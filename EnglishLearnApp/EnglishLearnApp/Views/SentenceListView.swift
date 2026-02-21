import SwiftUI

struct SentenceListView: View {
    let word: Word
    @StateObject private var speechService = SpeechService()
    @EnvironmentObject private var settings: SettingsManager

    // MARK: Continuous playback
    @State private var isPlayingAll = false
    @State private var playingIndex: Int = 0  // flat index into allSentences
    @State private var playingStep: Int = 0   // 0=EN, 1=JA, 2=EN, 3=JA
    @State private var playbackGeneration = 0  // Increment to invalidate old async tasks
    @State private var expectedGeneration = 0  // Set when starting speech, checked on completion

    init(word: Word) {
        self.word = word
    }

    var groupedSentences: [(String, [Sentence])] {
        let grouped = Dictionary(grouping: word.sentences) { $0.category }
        return grouped.sorted { $0.key < $1.key }
    }

    /// Flattened sentence list in display order, used for continuous playback indexing.
    private var allSentences: [Sentence] {
        groupedSentences.flatMap { $0.1 }
    }

    private var playingSentenceID: UUID? {
        guard isPlayingAll, playingIndex < allSentences.count else { return nil }
        return allSentences[playingIndex].id
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
            guard isPlayingAll else { return }

            // Check if this completion is for the current playback session
            guard expectedGeneration == playbackGeneration else { return }

            advancePlayback()
        }
        .onDisappear {
            if isPlayingAll { stopPlayAll() }
        }
    }

    // MARK: - Playback control

    /// Start continuous playback. Stops any ongoing playback first, then begins
    /// at `from` if given, otherwise from the first sentence in the list.
    private func startPlayAll(from sentence: Sentence? = nil) {
        guard !allSentences.isEmpty else { return }

        // Increment generation to invalidate all pending async tasks
        playbackGeneration += 1
        let currentGen = playbackGeneration

        // Immediately stop everything
        isPlayingAll = false
        playingStep = 0
        speechService.stop()

        Task { @MainActor in
            // Wait for speech to actually stop (poll for max 500ms)
            for _ in 0..<25 {
                if !speechService.isSpeaking {
                    break
                }
                try? await Task.sleep(nanoseconds: 20_000_000) // 20ms
            }

            // Check if this task is still valid (no new startPlayAll was called)
            guard currentGen == playbackGeneration else { return }

            // Set up new playback position
            if let sentence,
               let idx = allSentences.firstIndex(where: { $0.id == sentence.id }) {
                playingIndex = idx
            } else {
                playingIndex = 0
            }
            isPlayingAll = true
            playingStep = 0
            speakCurrentStep()
        }
    }

    private func stopPlayAll() {
        // Increment generation to invalidate all pending tasks
        playbackGeneration += 1
        isPlayingAll = false
        playingStep = 0
        speechService.stop()
    }

    /// Speak the text for the current (sentence, step) position.
    private func speakCurrentStep() {
        guard playingIndex < allSentences.count else {
            stopPlayAll()
            return
        }
        // Record the current generation before starting speech
        expectedGeneration = playbackGeneration

        let sentence = allSentences[playingIndex]
        switch playingStep {
        case 0, 2:
            speechService.speak(sentence.english, voiceGender: settings.voiceGender)
        case 1, 3:
            speechService.speak(sentence.japanese, language: "ja-JP", voiceGender: settings.voiceGender)
        default:
            break
        }
    }

    /// Called when the current utterance finishes; moves to the next step or sentence.
    private func advancePlayback() {
        let nextStep = playingStep + 1
        if nextStep < 4 {
            // More steps remain within the current sentence (EN→JA→EN→JA)
            playingStep = nextStep
            speakCurrentStep()
        } else {
            // Move to the next sentence
            let nextIdx = playingIndex + 1
            if nextIdx < allSentences.count {
                playingIndex = nextIdx
                playingStep = 0
                speakCurrentStep()
            } else {
                // All sentences done
                isPlayingAll = false
                playingStep = 0
            }
        }
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
