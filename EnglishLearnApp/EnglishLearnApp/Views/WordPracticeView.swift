import SwiftUI

struct WordPracticeView: View {
    let word: Word

    @StateObject private var speechService = SpeechService()
    @StateObject private var speechRecognizer = SpeechRecognizer()
    @State private var pronunciationResult: PronunciationResult?
    @State private var showResult = false
    @EnvironmentObject private var settings: SettingsManager

    var body: some View {
        VStack(spacing: 30) {
            Spacer()

            // 単語表示
            VStack(spacing: 12) {
                Text(word.word)
                    .font(.system(size: 48, weight: .bold))

                Text(word.phonetic)
                    .font(.title2)
                    .foregroundColor(.secondary)

                Text(word.meaning)
                    .font(.title3)
                    .foregroundColor(.blue)
            }

            Spacer()

            // 音声読み上げボタン
            HStack(spacing: 16) {
                Button(action: {
                    speechService.speak(word.word, voiceGender: settings.voiceGender)
                }) {
                    VStack {
                        Image(systemName: (speechService.isSpeaking && speechService.speakingLanguage != "ja-JP") ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                            .font(.system(size: 40))
                        Text("英語を聞く")
                            .font(.subheadline)
                    }
                    .frame(width: 120, height: 80)
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(16)
                }
                .foregroundColor(.blue)

                Button(action: {
                    speechService.speak(word.meaning, language: "ja-JP", voiceGender: settings.voiceGender)
                }) {
                    VStack {
                        Image(systemName: (speechService.isSpeaking && speechService.speakingLanguage == "ja-JP") ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                            .font(.system(size: 40))
                        Text("日本語を聞く")
                            .font(.subheadline)
                    }
                    .frame(width: 120, height: 80)
                    .background(Color.orange.opacity(0.1))
                    .cornerRadius(16)
                }
                .foregroundColor(.orange)
            }

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
                VStack {
                    Image(systemName: speechRecognizer.isRecording ? "mic.fill" : "mic")
                        .font(.system(size: 40))
                    Text(speechRecognizer.isRecording ? "録音中..." : "発音する")
                        .font(.subheadline)
                }
                .frame(width: 120, height: 80)
                .background(speechRecognizer.isRecording ? Color.red.opacity(0.2) : Color.green.opacity(0.1))
                .cornerRadius(16)
            }
            .foregroundColor(speechRecognizer.isRecording ? .red : .green)
            .disabled(speechRecognizer.authorizationStatus != .authorized)

            // 認識結果表示
            if !speechRecognizer.recognizedText.isEmpty {
                VStack(spacing: 8) {
                    Text("認識結果:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                    Text(speechRecognizer.recognizedText)
                        .font(.title3)
                        .fontWeight(.medium)
                }
                .padding()
                .background(Color.gray.opacity(0.1))
                .cornerRadius(12)
            }

            // 判定結果表示
            if showResult, let result = pronunciationResult {
                Text(result.message)
                    .font(.title2)
                    .fontWeight(.semibold)
                    .foregroundColor(resultColor(for: result))
                    .padding()
                    .background(resultColor(for: result).opacity(0.1))
                    .cornerRadius(12)
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

            Spacer()
        }
        .padding()
        .navigationTitle("発音練習")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func checkPronunciation() {
        pronunciationResult = speechRecognizer.checkPronunciation(expected: word.word)
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
        WordPracticeView(word: Word(word: "apple", meaning: "りんご", phonetic: "ˈæp.əl"))
    }
}
