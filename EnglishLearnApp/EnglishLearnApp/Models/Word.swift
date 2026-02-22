import Foundation

// MARK: - Import Errors

enum WordImportError: LocalizedError {
    case fileNotReadable(String)
    case invalidJSONFormat(String)
    case missingRequiredFields(String)
    case invalidUUID(String, path: String)
    case emptyWordList
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .fileNotReadable(let detail):
            return "ファイルの読み込みエラー\n\n\(detail)"
        case .invalidJSONFormat(let detail):
            return "JSON形式のエラー\n\n\(detail)\n\n正しいエクスポートファイルか確認してください。"
        case .missingRequiredFields(let detail):
            return "データ形式のエラー\n\n\(detail)\n\n必須フィールドが不足しています。"
        case .invalidUUID(let uuidString, let path):
            return "UUID形式のエラー\n\n無効なUUID: \"\(uuidString)\"\n場所: \(path)\n\nUUIDは「XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX」の形式で、0-9とA-Fのみを含む必要があります。\n\n修正方法:\n• 無効な文字（G-Z、記号など）を削除\n• または新しいUUIDを生成（uuidgenコマンド）"
        case .emptyWordList:
            return "インポートエラー\n\nファイルに単語データが含まれていません。"
        case .unknown(let error):
            return "予期しないエラー\n\n\(error.localizedDescription)"
        }
    }
}

// MARK: - Word Models

struct Sentence: Codable, Identifiable {
    let id: UUID
    let english: String
    let japanese: String
    let category: String

    init(id: UUID = UUID(), english: String, japanese: String, category: String = "") {
        self.id = id
        self.english = english
        self.japanese = japanese
        self.category = category
    }
}

struct Word: Codable, Identifiable {
    let id: UUID
    var word: String
    var meaning: String
    var phonetic: String
    var sentences: [Sentence]
    var deletedAt: Date?
    var createdAt: Date?
    var archivedAt: Date?

    init(id: UUID = UUID(), word: String, meaning: String, phonetic: String,
         sentences: [Sentence] = [], deletedAt: Date? = nil, createdAt: Date? = Date(),
         archivedAt: Date? = nil) {
        self.id = id
        self.word = word
        self.meaning = meaning
        self.phonetic = phonetic
        self.sentences = sentences
        self.deletedAt = deletedAt
        self.createdAt = createdAt
        self.archivedAt = archivedAt
    }
}

struct WordList: Codable {
    let words: [Word]
}

class WordDataManager: ObservableObject {
    static let shared = WordDataManager()

    /// Active (non-deleted, non-archived) words. Updated automatically after every mutation.
    @Published private(set) var words: [Word] = []
    /// Words in the trash within the 10-day retention window.
    @Published private(set) var trashedWords: [Word] = []
    /// Archived words.
    @Published private(set) var archivedWords: [Word] = []

    private let documentsFileName = "words.json"
    private let trashRetentionDays = 10

    private init() {
        refreshPublishedWords()
    }

    private var documentsURL: URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent(documentsFileName)
    }

    // MARK: - Public Methods

    /// Loads active (non-deleted) words. Auto-purges trash older than 10 days.
    func loadWords() -> [Word] {
        var all = loadAllWords()
        let cutoff = Calendar.current.date(byAdding: .day, value: -trashRetentionDays, to: Date())!
        let expiredExists = all.contains { w in
            guard let d = w.deletedAt else { return false }
            return d < cutoff
        }
        if expiredExists {
            all.removeAll { w in
                guard let d = w.deletedAt else { return false }
                return d < cutoff
            }
            saveAllWords(all)
        }
        return all.filter { $0.deletedAt == nil && $0.archivedAt == nil }
    }

    /// Loads all words including trashed ones.
    func loadAllWords() -> [Word] {
        let words: [Word]
        if let documentsWords = loadFromDocuments() {
            words = documentsWords
        } else {
            words = loadFromBundle()
        }
        return migrateCreatedAtIfNeeded(words)
    }

    /// One-time migration: assigns incremental createdAt to words that have none.
    /// Preserves the original load order as relative age (index 0 = oldest).
    /// Runs once and persists to Documents so it never runs again.
    private func migrateCreatedAtIfNeeded(_ words: [Word]) -> [Word] {
        guard words.contains(where: { $0.createdAt == nil }) else { return words }
        // Assign synthetic dates 1 hour apart so sort order matches load order
        let reference = Date(timeIntervalSince1970: 0)
        var migrated = words
        for i in migrated.indices where migrated[i].createdAt == nil {
            migrated[i].createdAt = reference.addingTimeInterval(Double(i) * 3600)
        }
        saveAllWords(migrated)
        return migrated
    }

    /// Loads all archived words.
    func loadArchivedWords() -> [Word] {
        return loadAllWords().filter { $0.archivedAt != nil && $0.deletedAt == nil }
    }

    /// Archives a word by setting archivedAt to now.
    func archive(wordId: UUID) { archive(wordIds: [wordId]) }

    /// Restores an archived word by clearing archivedAt.
    func unarchive(wordId: UUID) { unarchive(wordIds: [wordId]) }

    /// Loads only trashed words within the 10-day retention window.
    func loadTrashWords() -> [Word] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -trashRetentionDays, to: Date())!
        return loadAllWords().filter { w in
            guard let d = w.deletedAt else { return false }
            return d >= cutoff
        }
    }

    /// Adds a new word to storage.
    func addWord(_ word: Word) {
        var all = loadAllWords()
        all.append(word)
        saveAllWords(all)
    }

    /// Saves all words (active + trashed) to Documents and refreshes published properties.
    func saveAllWords(_ words: [Word]) {
        writeToDisk(words)
        refreshPublishedWords()
    }

    /// Soft-deletes a word by setting deletedAt to now.
    func moveToTrash(wordId: UUID) { moveToTrash(wordIds: [wordId]) }

    /// Restores a trashed word by clearing deletedAt.
    func restoreFromTrash(wordId: UUID) { restoreFromTrash(wordIds: [wordId]) }

    /// Permanently removes a word from storage.
    func permanentlyDelete(wordId: UUID) { permanentlyDelete(wordIds: [wordId]) }

    // MARK: - Batch Operations

    /// Soft-deletes multiple words in a single save.
    func moveToTrash(wordIds: [UUID]) {
        guard !wordIds.isEmpty else { return }
        let now = Date()
        modifyWords(ids: Set(wordIds)) { $0.deletedAt = now }
    }

    /// Archives multiple words in a single save.
    func archive(wordIds: [UUID]) {
        guard !wordIds.isEmpty else { return }
        let now = Date()
        modifyWords(ids: Set(wordIds)) { $0.archivedAt = now }
    }

    /// Unarchives multiple words in a single save.
    func unarchive(wordIds: [UUID]) {
        guard !wordIds.isEmpty else { return }
        modifyWords(ids: Set(wordIds)) { $0.archivedAt = nil }
    }

    /// Restores multiple trashed words in a single save.
    func restoreFromTrash(wordIds: [UUID]) {
        guard !wordIds.isEmpty else { return }
        modifyWords(ids: Set(wordIds)) { $0.deletedAt = nil }
    }

    /// Permanently removes multiple words in a single save.
    func permanentlyDelete(wordIds: [UUID]) {
        guard !wordIds.isEmpty else { return }
        let idSet = Set(wordIds)
        var all = loadAllWords()
        all.removeAll { idSet.contains($0.id) }
        saveAllWords(all)
    }

    // MARK: - Private Helpers

    /// Applies `transform` to every word whose ID is in `ids`, then saves once.
    private func modifyWords(ids: Set<UUID>, transform: (inout Word) -> Void) {
        var all = loadAllWords()
        for idx in all.indices where ids.contains(all[idx].id) {
            transform(&all[idx])
        }
        saveAllWords(all)
    }

    // MARK: - Export / Import

    /// Exports all non-deleted words to a JSON file in the temp directory.
    func exportToJSON() -> URL? {
        let words = loadAllWords().filter { $0.deletedAt == nil }
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        guard let data = try? encoder.encode(WordList(words: words)) else { return nil }
        let filename = "words_export_\(Int(Date().timeIntervalSince1970)).json"
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(filename)
        do {
            try data.write(to: url)
            return url
        } catch {
            print("Export error: \(error)")
            return nil
        }
    }

    /// Helper function to extract a value from a JSON object using a coding path.
    private func extractValue(from json: Any, path: [CodingKey]) -> Any? {
        var current: Any = json
        for key in path {
            if let dict = current as? [String: Any] {
                guard let next = dict[key.stringValue] else { return nil }
                current = next
            } else if let array = current as? [Any], let index = key.intValue {
                guard index < array.count else { return nil }
                current = array[index]
            } else {
                return nil
            }
        }
        return current
    }

    /// Decodes words from a JSON file URL. Throws on parse failure.
    func importFromJSON(url: URL) throws -> [Word] {
        // Read file
        let data: Data
        do {
            data = try Data(contentsOf: url)
        } catch {
            if (error as NSError).code == NSFileReadNoSuchFileError {
                throw WordImportError.fileNotReadable("ファイルが見つかりません。")
            } else if (error as NSError).code == NSFileReadNoPermissionError {
                throw WordImportError.fileNotReadable("ファイルへのアクセス権限がありません。")
            } else {
                throw WordImportError.fileNotReadable(error.localizedDescription)
            }
        }

        // Decode JSON
        let decoder = JSONDecoder()
        let wordList: WordList
        do {
            wordList = try decoder.decode(WordList.self, from: data)
        } catch let DecodingError.dataCorrupted(context) {
            // Check if this is a UUID decoding error
            let description = context.debugDescription
            if description.contains("UUID") {
                let path = context.codingPath.map { $0.stringValue }.joined(separator: " → ")
                // Try to extract the invalid UUID string from the underlying data
                if let lastKey = context.codingPath.last,
                   let jsonObject = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let invalidUUID = extractValue(from: jsonObject, path: context.codingPath) as? String {
                    throw WordImportError.invalidUUID(invalidUUID, path: path.isEmpty ? "id" : path)
                }
                throw WordImportError.invalidUUID("(取得できませんでした)", path: path.isEmpty ? "id" : path)
            }
            throw WordImportError.invalidJSONFormat("JSONファイルが破損しています。\n\(description)")
        } catch let DecodingError.keyNotFound(key, context) {
            throw WordImportError.missingRequiredFields("必須キー '\(key.stringValue)' が見つかりません。\nパス: \(context.codingPath.map { $0.stringValue }.joined(separator: " → "))")
        } catch let DecodingError.typeMismatch(type, context) {
            let path = context.codingPath.map { $0.stringValue }.joined(separator: " → ")
            // Check if this is a UUID type mismatch
            if type == UUID.self {
                if let jsonObject = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let invalidValue = extractValue(from: jsonObject, path: context.codingPath) {
                    throw WordImportError.invalidUUID("\(invalidValue)", path: path)
                }
                throw WordImportError.invalidUUID("(型が不正です)", path: path)
            }
            throw WordImportError.invalidJSONFormat("型が一致しません。'\(type)' が期待されています。\nパス: \(path)")
        } catch let DecodingError.valueNotFound(type, context) {
            throw WordImportError.missingRequiredFields("値が見つかりません。'\(type)' が期待されています。\nパス: \(context.codingPath.map { $0.stringValue }.joined(separator: " → "))")
        } catch {
            throw WordImportError.unknown(error)
        }

        // Validate data
        guard !wordList.words.isEmpty else {
            throw WordImportError.emptyWordList
        }

        return wordList.words
    }

    /// Adds imported words that don't already exist (deduplicates by ID).
    func mergeWords(_ imported: [Word]) {
        var all = loadAllWords()
        let existingIDs = Set(all.map { $0.id })
        let newWords = imported.filter { !existingIDs.contains($0.id) }
        all.append(contentsOf: newWords)
        saveAllWords(all)
    }

    /// Replaces all active words with imported words, keeping trashed words intact.
    /// Trashed entries whose ID also appears in the imported set are dropped to avoid duplicate UUIDs.
    func replaceWords(_ imported: [Word]) {
        let importedIDs = Set(imported.map { $0.id })
        let trashed = loadAllWords().filter { $0.deletedAt != nil && !importedIDs.contains($0.id) }
        saveAllWords(trashed + imported)
    }

    /// Updates a word's fields by ID.
    func updateWord(_ updated: Word) {
        var all = loadAllWords()
        if let idx = all.firstIndex(where: { $0.id == updated.id }) {
            all[idx] = updated
            saveAllWords(all)
        }
    }

    // MARK: - Private Methods

    /// Writes words to disk without triggering a published-property refresh.
    /// Use this inside `refreshPublishedWords` to avoid re-entrancy.
    private func writeToDisk(_ words: [Word]) {
        guard let url = documentsURL else {
            print("Could not get Documents URL")
            return
        }
        do {
            let wordList = WordList(words: words)
            let encoder = JSONEncoder()
            encoder.outputFormatting = .prettyPrinted
            let data = try encoder.encode(wordList)
            try data.write(to: url)
        } catch {
            print("Error saving words: \(error)")
        }
    }

    /// Reloads all words from disk, auto-purges expired trash, and updates published properties.
    private func refreshPublishedWords() {
        var all = loadAllWords()
        let cutoff = Calendar.current.date(byAdding: .day, value: -trashRetentionDays, to: Date())!
        let expired = all.filter { ($0.deletedAt ?? .distantFuture) < cutoff }
        if !expired.isEmpty {
            all.removeAll { ($0.deletedAt ?? .distantFuture) < cutoff }
            writeToDisk(all)
        }
        words = all.filter { $0.deletedAt == nil && $0.archivedAt == nil }
        trashedWords = all.filter { ($0.deletedAt ?? .distantFuture) >= cutoff && $0.deletedAt != nil }
        archivedWords = all.filter { $0.archivedAt != nil && $0.deletedAt == nil }
    }

    private func loadFromDocuments() -> [Word]? {
        guard let url = documentsURL else { return nil }
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            let wordList = try decoder.decode(WordList.self, from: data)
            return wordList.words
        } catch {
            print("Error loading words from Documents: \(error)")
            return nil
        }
    }

    private func loadFromBundle() -> [Word] {
        guard let url = Bundle.main.url(forResource: "words", withExtension: "json") else {
            print("words.json not found in bundle")
            return sampleWords()
        }
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            let wordList = try decoder.decode(WordList.self, from: data)
            if wordList.words.isEmpty {
                return sampleWords()
            }
            return wordList.words
        } catch {
            print("Error loading words from Bundle: \(error)")
            return sampleWords()
        }
    }

    private func sampleWords() -> [Word] {
        return [
            Word(
                word: "rarity",
                meaning: "珍しさ・希少性",
                phonetic: "ˈrer.ə.t̬i",
                sentences: [
                    Sentence(english: "True friendship is a rarity in this world.", japanese: "本当の友情はこの世では珍しいものだ。", category: "一般的な使い方"),
                    Sentence(english: "Snow is a rarity in this region.", japanese: "この地域では雪は珍しい。", category: "一般的な使い方"),
                    Sentence(english: "Kindness like hers is a rarity these days.", japanese: "彼女のような優しさは、今では稀だ。", category: "一般的な使い方")
                ]
            ),
            Word(
                word: "these days",
                meaning: "最近、この頃",
                phonetic: "ðiːz deɪz",
                sentences: [
                    Sentence(english: "These days, I've been exercising regularly.", japanese: "最近は定期的に運動している。", category: "趣味・習慣の変化"),
                    Sentence(english: "I'm into gardening these days.", japanese: "最近ガーデニングにハマってるの。", category: "趣味・習慣の変化")
                ]
            ),
            Word(
                word: "experience",
                meaning: "経験、体験",
                phonetic: "ɪkˈspɪr.i.əns",
                sentences: [
                    Sentence(english: "I had a wonderful experience during my trip to Italy.", japanese: "イタリア旅行中に素晴らしい体験をした。", category: "一般的な経験"),
                    Sentence(english: "Experience is the best teacher.", japanese: "経験は最良の教師である。", category: "教育・人生の教訓"),
                    Sentence(english: "This… is my Stand! Gold Experience!", japanese: "これが……オレのスタンド！『ゴールド・エクスペリエンス』だッ！", category: "Gold Experience")
                ]
            )
        ]
    }
}
