import SwiftUI

struct SentencePracticeView: View {
    // MARK: - Constants

    private enum Constants {
        /// Default VOICEVOX speaker ID for English TTS
        static let englishSpeakerID = 3
    }

    // MARK: - Properties

    let sentence: Sentence
    let word: Word

    private let speechService = SpeechService.shared
    @StateObject private var speechRecognizer = SpeechRecognizer()
    @State private var pronunciationResult: PronunciationResult?
    @State private var showResult = false
    @State private var prefetchTask: Task<Void, Never>?
    @EnvironmentObject private var settings: SettingsManager

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                // 例文表示
                VStack(spacing: 12) {
                    Text(sentence.english)
                        .font(.title2)
                        .fontWeight(.semibold)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)

                    Text(sentence.japanese)
                        .font(.body)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal)

                    // カテゴリタグ
                    Text(sentence.category)
                        .font(.caption)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 4)
                        .background(Color.blue.opacity(0.1))
                        .foregroundColor(.blue)
                        .cornerRadius(12)
                }
                .padding(.top, 20)

                Divider()
                    .padding(.horizontal)

                // 操作ボタン
                VStack(spacing: 16) {
                    // 英語読み上げボタン
                    SpeechButton(
                        text: sentence.english, label: "英語を聞く",
                        isJapanese: false, color: .blue,
                        speechService: speechService
                    )

                    // 日本語訳読み上げボタン
                    SpeechButton(
                        text: sentence.japanese, label: "日本語訳を聞く",
                        isJapanese: true, color: .orange,
                        speechService: speechService
                    )

                    // 発音チェックボタン
                    Button(action: {
                        if speechRecognizer.isRecording {
                            speechRecognizer.stopRecording()
                            checkPronunciation()
                        } else {
                            showResult = false
                            pronunciationResult = nil
                            speechRecognizer.startRecording()
                        }
                    }) {
                        HStack {
                            Image(systemName: speechRecognizer.isRecording ? "mic.fill" : "mic")
                                .font(.title2)
                            Text(speechRecognizer.isRecording ? "録音中...タップで停止" : "発音する")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(speechRecognizer.isRecording ? Color.red.opacity(0.2) : Color.green.opacity(0.1))
                        .foregroundColor(speechRecognizer.isRecording ? .red : .green)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)
                    .disabled(speechRecognizer.authorizationStatus != .authorized)
                }

                // 認識結果表示
                if !speechRecognizer.recognizedText.isEmpty {
                    RecognitionResultView(recognizedText: speechRecognizer.recognizedText)
                }

                // 判定結果表示
                if showResult, let result = pronunciationResult {
                    PronunciationResultView(result: result)
                }

                // エラーメッセージ
                if let errorMessage = speechRecognizer.errorMessage {
                    Text(errorMessage)
                        .font(.caption)
                        .foregroundColor(.red)
                        .padding()
                }

                // 権限がない場合の案内
                if speechRecognizer.authorizationStatus != .authorized {
                    Text("音声認識を使用するには、設定から権限を許可してください")
                        .font(.caption)
                        .foregroundColor(.orange)
                        .multilineTextAlignment(.center)
                        .padding()
                }

                Spacer(minLength: 40)
            }
        }
        .navigationTitle(word.word)
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            prefetchTask = Task {
                // Prefetch both English and Japanese in parallel (if using VOICEVOX)
                async let englishPrefetch = {
                    if settings.englishVoiceGender == .zundamon {
                        await PrefetchService.shared.prefetch(
                            text: sentence.english,
                            speakerID: Constants.englishSpeakerID
                        )
                    }
                }()
                async let japanesePrefetch = {
                    if settings.japaneseVoiceGender == .zundamon {
                        await PrefetchService.shared.prefetch(
                            text: sentence.japanese,
                            speakerID: settings.voicevoxStyle.rawValue
                        )
                    }
                }()
                await (englishPrefetch, japanesePrefetch)
            }
        }
        .onDisappear {
            prefetchTask?.cancel()
            prefetchTask = nil
        }
    }

    private func checkPronunciation() {
        pronunciationResult = speechRecognizer.checkPronunciation(expected: sentence.english)
        showResult = true
    }

}

#Preview {
    NavigationStack {
        SentencePracticeView(
            sentence: Sentence(
                english: "True friendship is a rarity in this world.",
                japanese: "本当の友情はこの世では珍しいものだ。",
                category: "一般的な使い方"
            ),
            word: Word(word: "rarity", meaning: "珍しさ", phonetic: "ˈrer.ə.t̬i")
        )
    }
}
