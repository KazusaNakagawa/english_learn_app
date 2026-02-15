import Foundation

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

class WordDataManager {
    static let shared = WordDataManager()

    private let documentsFileName = "words.json"
    private let trashRetentionDays = 10

    private init() {}

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
    func archive(wordId: UUID) {
        var all = loadAllWords()
        if let idx = all.firstIndex(where: { $0.id == wordId }) {
            all[idx].archivedAt = Date()
            saveAllWords(all)
        }
    }

    /// Restores an archived word by clearing archivedAt.
    func unarchive(wordId: UUID) {
        var all = loadAllWords()
        if let idx = all.firstIndex(where: { $0.id == wordId }) {
            all[idx].archivedAt = nil
            saveAllWords(all)
        }
    }

    /// Loads only trashed words within the 10-day retention window.
    func loadTrashWords() -> [Word] {
        let cutoff = Calendar.current.date(byAdding: .day, value: -trashRetentionDays, to: Date())!
        return loadAllWords().filter { w in
            guard let d = w.deletedAt else { return false }
            return d >= cutoff
        }
    }

    /// Saves all words (active + trashed) to Documents.
    func saveAllWords(_ words: [Word]) {
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

    /// Soft-deletes a word by setting deletedAt to now.
    func moveToTrash(wordId: UUID) {
        var all = loadAllWords()
        if let idx = all.firstIndex(where: { $0.id == wordId }) {
            all[idx].deletedAt = Date()
            saveAllWords(all)
        }
    }

    /// Restores a trashed word by clearing deletedAt.
    func restoreFromTrash(wordId: UUID) {
        var all = loadAllWords()
        if let idx = all.firstIndex(where: { $0.id == wordId }) {
            all[idx].deletedAt = nil
            saveAllWords(all)
        }
    }

    /// Permanently removes a word from storage.
    func permanentlyDelete(wordId: UUID) {
        var all = loadAllWords()
        all.removeAll { $0.id == wordId }
        saveAllWords(all)
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
