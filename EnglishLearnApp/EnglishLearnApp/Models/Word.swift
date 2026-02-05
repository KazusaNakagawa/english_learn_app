import Foundation

// MARK: - Word Models

/// Represents an example sentence for vocabulary learning.
///
/// Each sentence contains an English sentence, its Japanese translation,
/// and an optional category for classification.
struct Sentence: Codable, Identifiable {
    /// The unique identifier for the sentence.
    let id: UUID

    /// The English sentence text.
    let english: String

    /// The Japanese translation of the sentence.
    let japanese: String

    /// The category of the sentence (e.g., "日常会話", "ビジネス").
    let category: String

    /// Creates a new sentence.
    ///
    /// - Parameters:
    ///   - id: The unique identifier (default: auto-generated UUID).
    ///   - english: The English sentence text.
    ///   - japanese: The Japanese translation.
    ///   - category: The category of the sentence (default: empty string).
    init(id: UUID = UUID(), english: String, japanese: String, category: String = "") {
        self.id = id
        self.english = english
        self.japanese = japanese
        self.category = category
    }
}

/// Represents a vocabulary word with its associated sentences.
///
/// A word contains the English word, its meaning, phonetic transcription,
/// and a collection of example sentences.
struct Word: Codable, Identifiable {
    /// The unique identifier for the word.
    let id: UUID

    /// The English word or phrase.
    let word: String

    /// The Japanese meaning of the word.
    let meaning: String

    /// The phonetic transcription (IPA) of the word.
    let phonetic: String

    /// The example sentences using this word.
    let sentences: [Sentence]

    /// Creates a new word.
    ///
    /// - Parameters:
    ///   - id: The unique identifier (default: auto-generated UUID).
    ///   - word: The English word or phrase.
    ///   - meaning: The Japanese meaning.
    ///   - phonetic: The phonetic transcription.
    ///   - sentences: The example sentences (default: empty array).
    init(id: UUID = UUID(), word: String, meaning: String, phonetic: String, sentences: [Sentence] = []) {
        self.id = id
        self.word = word
        self.meaning = meaning
        self.phonetic = phonetic
        self.sentences = sentences
    }
}

/// A container for serializing a list of words to JSON.
struct WordList: Codable {
    /// The array of words.
    let words: [Word]
}

/// Manages loading and saving of word data.
///
/// This singleton class handles the persistence of vocabulary words.
/// It supports loading from both the app bundle (read-only) and
/// the Documents directory (read-write), with Documents taking priority.
///
/// ## Data Priority
/// 1. Documents directory: User-saved data (read-write)
/// 2. App bundle: Initial/sample data (read-only)
///
/// ## Usage
/// ```swift
/// // Load words
/// let words = WordDataManager.shared.loadWords()
///
/// // Save words
/// WordDataManager.shared.saveWords(words)
/// ```
class WordDataManager {
    /// The shared singleton instance.
    static let shared = WordDataManager()

    /// The filename for storing words in the Documents directory.
    private let documentsFileName = "words.json"

    private init() {}

    /// The URL for the words file in the Documents directory.
    private var documentsURL: URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?
            .appendingPathComponent(documentsFileName)
    }

    // MARK: - Public Methods

    /// Loads all words from storage.
    ///
    /// Attempts to load from the Documents directory first.
    /// If no user data exists, falls back to the app bundle.
    ///
    /// - Returns: An array of `Word` objects.
    func loadWords() -> [Word] {
        // 1. Attempt to load from Documents
        if let documentsWords = loadFromDocuments() {
            return documentsWords
        }
        // 2. Fall back to Bundle
        return loadFromBundle()
    }

    /// Saves words to the Documents directory.
    ///
    /// Serializes the words to JSON and writes them to the Documents directory.
    /// This allows user data to persist between app launches.
    ///
    /// - Parameter words: The array of words to save.
    func saveWords(_ words: [Word]) {
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
            print("Words saved to: \(url.path)")
        } catch {
            print("Error saving words: \(error)")
        }
    }

    // MARK: - Private Methods

    /// Loads words from the Documents directory.
    ///
    /// - Returns: An array of words if the file exists and is valid, nil otherwise.
    private func loadFromDocuments() -> [Word]? {
        guard let url = documentsURL else { return nil }

        guard FileManager.default.fileExists(atPath: url.path) else {
            return nil
        }

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

    /// Loads words from the app bundle.
    ///
    /// Falls back to sample data if the bundle file is missing or empty.
    ///
    /// - Returns: An array of words from the bundle or sample data.
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
                print("words.json is empty, using sample data")
                return sampleWords()
            }
            return wordList.words
        } catch {
            print("Error loading words from Bundle: \(error)")
            return sampleWords()
        }
    }

    /// Returns sample words for demonstration purposes.
    ///
    /// Used as a fallback when no data is available from bundle or Documents.
    ///
    /// - Returns: An array of sample `Word` objects.
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
