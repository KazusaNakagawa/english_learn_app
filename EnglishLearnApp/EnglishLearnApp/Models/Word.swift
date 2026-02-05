import Foundation
import SwiftUI

// MARK: - Settings Manager
class SettingsManager: ObservableObject {
    static let shared = SettingsManager()

    @Published var voiceGender: VoiceGender {
        didSet {
            saveVoiceGender()
        }
    }

    enum VoiceGender: String, CaseIterable {
        case default_ = "default"
        case female = "female"
        case male = "male"

        var label: String {
            switch self {
            case .default_:
                return "デフォルト"
            case .female:
                return "女性"
            case .male:
                return "男性"
            }
        }
    }

    init() {
        if let saved = UserDefaults.standard.string(forKey: "voiceGender"),
           let gender = VoiceGender(rawValue: saved) {
            self.voiceGender = gender
        } else {
            self.voiceGender = .default_
        }
    }

    private func saveVoiceGender() {
        UserDefaults.standard.set(voiceGender.rawValue, forKey: "voiceGender")
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
    let word: String
    let meaning: String
    let phonetic: String
    let sentences: [Sentence]

    init(id: UUID = UUID(), word: String, meaning: String, phonetic: String, sentences: [Sentence] = []) {
        self.id = id
        self.word = word
        self.meaning = meaning
        self.phonetic = phonetic
        self.sentences = sentences
    }
}

struct WordList: Codable {
    let words: [Word]
}

class WordDataManager {
    static let shared = WordDataManager()

    private init() {}

    func loadWords() -> [Word] {
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
            print("Error loading words: \(error)")
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
