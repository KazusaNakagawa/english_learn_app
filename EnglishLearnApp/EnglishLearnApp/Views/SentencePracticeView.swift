import SwiftUI

struct SentencePracticeView: View {
    let sentence: Sentence
    let word: Word

    @StateObject private var speechService = SpeechService()
    @StateObject private var speechRecognizer = SpeechRecognizer()
    @State private var pronunciationResult: PronunciationResult?
    @State private var showResult = false
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
                    Button(action: {
                        speechService.speak(sentence.english, voiceGender: settings.voiceGender)
                    }) {
                        HStack {
                            Image(systemName: (speechService.isSpeaking && speechService.speakingLanguage != "ja-JP") ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                                .font(.title2)
                            Text("英語を聞く")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(Color.blue.opacity(0.1))
                        .foregroundColor(.blue)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)

                    // 日本語訳読み上げボタン
                    Button(action: {
                        speechService.speak(sentence.japanese, language: "ja-JP", voiceGender: settings.voiceGender)
                    }) {
                        HStack {
                            Image(systemName: (speechService.isSpeaking && speechService.speakingLanguage == "ja-JP") ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                                .font(.title2)
                            Text("日本語訳を聞く")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(Color.orange.opacity(0.1))
                        .foregroundColor(.orange)
                        .cornerRadius(12)
                    }
                    .padding(.horizontal)

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
                    VStack(spacing: 8) {
                        Text("認識結果:")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text(speechRecognizer.recognizedText)
                            .font(.body)
                            .fontWeight(.medium)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Color.gray.opacity(0.1))
                    .cornerRadius(12)
                    .padding(.horizontal)
                }

                // 判定結果表示
                if showResult, let result = pronunciationResult {
                    Text(result.message)
                        .font(.title3)
                        .fontWeight(.semibold)
                        .foregroundColor(resultColor(for: result))
                        .padding()
                        .frame(maxWidth: .infinity)
                        .background(resultColor(for: result).opacity(0.1))
                        .cornerRadius(12)
                        .padding(.horizontal)
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
    }

    private func checkPronunciation() {
        pronunciationResult = speechRecognizer.checkPronunciation(expected: sentence.english)
        showResult = true
    }

    private func resultColor(for result: PronunciationResult) -> Color {
        switch result {
        case .correct:
            return .green
        case .close:
            return .orange
        case .incorrect, .noInput:
            return .red
        }
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
