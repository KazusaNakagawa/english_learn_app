import SwiftUI

struct SentenceListView: View {
    let word: Word
    private let speechService = SpeechService.shared
    @EnvironmentObject private var settings: SettingsManager
    @EnvironmentObject private var globalPlaybackManager: GlobalPlaybackManager

    init(word: Word) {
        self.word = word
    }

    /// Groups sentences by category and returns them in sorted order.
    ///
    /// - Returns: An array of tuples containing category names and their sentences
    var groupedSentences: [(String, [Sentence])] {
        let grouped = Dictionary(grouping: word.sentences) { $0.category }
        return grouped.sorted { $0.key < $1.key }
    }

    /// Flattens the grouped sentences into queue items for continuous playback.
    ///
    /// This computed property provides the sentences in display order, which is used
    /// for indexing during continuous playback operations.
    ///
    /// - Returns: An array of QueueItem in display order
    private var allQueueItems: [QueueItem] {
        groupedSentences.flatMap { _, sentences in
            sentences.map { sentence in
                QueueItem(sentence: sentence, word: word)
            }
        }
    }

    /// Checks if the current playback queue belongs to this view
    private var isPlayingThisViewsQueue: Bool {
        globalPlaybackManager.isPlayingQueue(allQueueItems)
    }

    /// Returns the UUID of the currently playing sentence, if any.
    ///
    /// - Returns: The sentence ID if playback is active and index is valid, otherwise nil
    private var playingSentenceID: UUID? {
        guard isPlayingThisViewsQueue,
              globalPlaybackManager.currentIndex < globalPlaybackManager.queue.count else { return nil }
        return globalPlaybackManager.currentItem?.sentence.id
    }

    var body: some View {
        List {
            // 単語情報セクション
            Section {
                VStack(alignment: .center, spacing: 8) {
                    Text(word.word)
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text(word.phonetic)
                        .font(.title3)
                        .foregroundColor(.secondary)

                    Text(word.meaning)
                        .font(.title3)
                        .foregroundColor(.blue)

                    HStack(spacing: 12) {
                        SpeechButton(
                            text: word.word, label: "英語を聞く",
                            isJapanese: false, color: .blue, style: .pill,
                            speechService: speechService
                        )
                        SpeechButton(
                            text: word.meaning, label: "日本語を聞く",
                            isJapanese: true, color: .orange, style: .pill,
                            speechService: speechService
                        )
                    }
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }

            // 例文セクション（カテゴリ別）
            ForEach(groupedSentences, id: \.0) { category, sentences in
                Section(header: Text(category)) {
                    ForEach(sentences) { sentence in
                        let isPlaying = playingSentenceID == sentence.id
                        // NavigationLink and play button are siblings in HStack so the
                        // button tap is not intercepted by the NavigationLink gesture.
                        HStack {
                            NavigationLink(destination: SentencePracticeView(sentence: sentence, word: word)) {
                                SentenceRowView(sentence: sentence, speechService: speechService)
                            }
                            Button {
                                if isPlaying {
                                    globalPlaybackManager.stop()
                                } else {
                                    startPlayAll(from: sentence)
                                }
                            } label: {
                                Image(systemName: isPlaying ? "stop.fill" : "play.fill")
                                    .font(.subheadline)
                                    .foregroundColor(isPlaying ? .red : .secondary)
                                    .frame(width: 32, height: 32)
                            }
                            .buttonStyle(.borderless)
                        }
                        .listRowBackground(
                            isPlaying ? Color.accentColor.opacity(0.12) : nil
                        )
                    }
                }
            }
        }
        .navigationTitle("例文一覧")
        .navigationBarTitleDisplayMode(.inline)
        // When individual playback starts, always stop continuous playback
        // to prevent stale queues from advancing via delayed completion handlers
        .onReceive(NotificationCenter.default.publisher(for: .speechServiceDidStartNewPlayback)) { _ in
            globalPlaybackManager.stop()
        }
    }

    // MARK: - Playback control

    /// Starts continuous playback from a specific sentence or the beginning.
    ///
    /// - Parameter sentence: The sentence to start from, or nil to start from the first sentence
    private func startPlayAll(from sentence: Sentence? = nil) {
        let items = allQueueItems
        guard !items.isEmpty else { return }

        // Determine start index
        let startIndex: Int
        if let sentence,
           let idx = items.firstIndex(where: { $0.sentence.id == sentence.id }) {
            startIndex = idx
        } else {
            startIndex = 0
        }

        globalPlaybackManager.enqueue(items, startIndex: startIndex)
    }
}


struct SentenceRowView: View {
    let sentence: Sentence
    @ObservedObject var speechService: SpeechService

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(sentence.english)
                .font(.body)

            Text(sentence.japanese)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    NavigationStack {
        SentenceListView(word: Word(
            word: "rarity",
            meaning: "珍しさ・希少性",
            phonetic: "ˈrer.ə.t̬i",
            sentences: [
                Sentence(english: "True friendship is a rarity.", japanese: "本当の友情は珍しい。", category: "一般的な使い方"),
                Sentence(english: "Snow is a rarity in this region.", japanese: "この地域では雪は珍しい。", category: "一般的な使い方")
            ]
        ))
    }
    .environmentObject(SettingsManager.shared)
    .environmentObject(GlobalPlaybackManager(speechService: .shared, settings: .shared))
}
