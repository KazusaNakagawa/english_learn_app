import Foundation

struct QueueItem: Identifiable, Equatable {
    let id = UUID()
    let sentence: Sentence
    let word: Word

    static func == (lhs: QueueItem, rhs: QueueItem) -> Bool {
        lhs.sentence.id == rhs.sentence.id && lhs.word.id == rhs.word.id
    }
}
