import SwiftUI
import MediaPlayer

struct SentenceListView: View {
    let word: Word
    @StateObject private var speechService = SpeechService()
    @EnvironmentObject private var settings: SettingsManager

    // MARK: - Continuous playback managers
    @State private var playbackManager: ContinuousPlaybackManager<Sentence>?
    @State private var remoteCommandManager = RemoteCommandCenterManager()

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

    /// Flattens the grouped sentences into a single array for continuous playback.
    ///
    /// This computed property provides the sentences in display order, which is used
    /// for indexing during continuous playback operations.
    ///
    /// - Returns: An array of all sentences in display order
    private var allSentences: [Sentence] {
        groupedSentences.flatMap { $0.1 }
    }

    /// Returns the UUID of the currently playing sentence, if any.
    ///
    /// - Returns: The sentence ID if playback is active and index is valid, otherwise nil
    private var playingSentenceID: UUID? {
        guard let manager = playbackManager,
              manager.isPlaying,
              manager.currentIndex < allSentences.count else { return nil }
        return allSentences[manager.currentIndex].id
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
                            speechService: speechService, voiceGender: settings.voiceGender
                        )
                        SpeechButton(
                            text: word.meaning, label: "日本語を聞く",
                            isJapanese: true, color: .orange, style: .pill,
                            speechService: speechService, voiceGender: settings.voiceGender
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
                                    stopPlayAll()
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
        .onReceive(speechService.speechFinishedPublisher) { _ in
            // Called only when speech finishes naturally (not cancelled)
            guard let manager = playbackManager else { return }

            // Check if this completion is for the current playback session
            guard manager.isValidCompletion(generation: manager.expectedGeneration) else { return }

            // Add a delay before advancing to the next step for better pacing
            let capturedGeneration = manager.playbackGeneration
            Task {
                try? await Task.sleep(nanoseconds: 800_000_000)  // 0.8 second delay
                await MainActor.run {
                    // Verify generation hasn't changed during the delay
                    guard manager.isValidCompletion(generation: capturedGeneration) else { return }
                    manager.advance()
                }
            }
        }
        .onAppear {
            setupPlaybackManager()

            // Setup remote command center
            remoteCommandManager.setup(
                onPlay: {
                    Task { @MainActor in
                        if let manager = self.playbackManager, !manager.isPlaying {
                            self.startPlayAll()
                        }
                    }
                },
                onPause: {
                    Task { @MainActor in
                        self.stopPlayAll()
                    }
                },
                onNext: {
                    Task { @MainActor in
                        self.playbackManager?.next()
                    }
                },
                onPrevious: {
                    Task { @MainActor in
                        self.playbackManager?.previous()
                    }
                }
            )
        }
        .onChange(of: settings.playbackMode) { _, newMode in
            // If playback is active, restart current sentence from step 0 when mode changes
            playbackManager?.updatePlaybackMode(newMode)
        }
        .onReceive(NotificationCenter.default.publisher(for: .speechServiceDidStartNewPlayback)) { _ in
            // When individual playback starts (e.g., user taps "英語を聞く" button),
            // stop continuous playback cleanly to avoid state confusion.
            // The audio session remains active to allow seamless transition.
            if let manager = playbackManager, manager.isPlaying {
                manager.stop()
                NowPlayingInfoManager.clear()
            }
        }
        .onDisappear {
            // Always stop to invalidate any pending async tasks via generation increment
            playbackManager?.stop()
            speechService.deactivateAudioSession()
            NowPlayingInfoManager.clear()
            // Remove remote command handlers to avoid leaked handlers after view disappears
            remoteCommandManager.cleanup()
        }
    }

    // MARK: - Playback control

    /// Initializes the playback manager on first use.
    private func setupPlaybackManager() {
        guard playbackManager == nil else { return }

        playbackManager = ContinuousPlaybackManager(
            playbackMode: settings.playbackMode,
            speechHandler: { [weak speechService, settings, word] (sentence: Sentence, step: Int) in
                guard let speechService else { return }

                switch settings.playbackMode {
                case .bilingual:
                    switch step {
                    case 0, 2:
                        speechService.speak(sentence.english, voiceGender: settings.voiceGender, isContinuousPlayback: true)
                    case 1:
                        speechService.speak(sentence.japanese, language: "ja-JP", voiceGender: settings.voiceGender, isContinuousPlayback: true)
                    default:
                        break
                    }
                case .englishOnly:
                    speechService.speak(sentence.english, voiceGender: settings.voiceGender, isContinuousPlayback: true)
                }

                // Update Now Playing info
                let stepLabel = settings.playbackMode.stepLabel(for: step)
                NowPlayingInfoManager.update(
                    title: sentence.english,
                    artist: "\(word.word) - \(stepLabel)",
                    album: word.meaning,
                    playbackRate: 1.0
                )
            },
            completionHandler: { [weak speechService] in
                speechService?.deactivateAudioSession()
                NowPlayingInfoManager.clear()
            }
        )
    }

    /// Starts continuous playback from a specific sentence or the beginning.
    ///
    /// - Parameter sentence: The sentence to start from, or nil to start from the first sentence
    private func startPlayAll(from sentence: Sentence? = nil) {
        guard !allSentences.isEmpty else { return }

        setupPlaybackManager()

        // Stop current playback first
        speechService.stop()

        // Determine start index
        let startIndex: Int
        if let sentence,
           let idx = allSentences.firstIndex(where: { $0.id == sentence.id }) {
            startIndex = idx
        } else {
            startIndex = 0
        }

        Task { @MainActor in
            playbackManager?.start(items: allSentences, startIndex: startIndex)
        }
    }

    /// Stops all continuous playback.
    private func stopPlayAll() {
        playbackManager?.stop()
        speechService.stop()
        speechService.deactivateAudioSession()
        NowPlayingInfoManager.clear()
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
}
