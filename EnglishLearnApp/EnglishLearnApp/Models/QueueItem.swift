import Foundation

struct QueueItem: Identifiable, Equatable {
    let sentence: Sentence
    let word: Word

    /// Stable, deterministic identifier based on sentence and word IDs.
    /// Ensures SwiftUI diffing uses the same identifier as equality comparison.
    var id: String {
        "\(word.id)-\(sentence.id)"
    }

    static func == (lhs: QueueItem, rhs: QueueItem) -> Bool {
        lhs.sentence.id == rhs.sentence.id && lhs.word.id == rhs.word.id
    }
}
