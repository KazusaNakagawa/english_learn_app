import SwiftUI

/// A view for configuring application settings.
///
/// This view provides controls for:
/// - Voice gender selection for text-to-speech
/// - OpenAI API key configuration for sentence generation
///
/// Settings are automatically persisted via `SettingsManager`.
struct SettingsView: View {
    /// The shared settings manager injected from the environment.
    @EnvironmentObject private var settings: SettingsManager

    /// The speech service for playing sample audio.
    @StateObject private var speechService = SpeechService()

    /// Local state for the API key input field.
    @State private var apiKeyInput: String = ""

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("音声設定")) {
                    Picker("音声の性別", selection: $settings.voiceGender) {
                        ForEach(SettingsManager.VoiceGender.allCases, id: \.self) { gender in
                            Text(gender.label).tag(gender)
                        }
                    }
                    .pickerStyle(.segmented)

                    Button(action: {
                        speechService.speak("This is a test sentence.", voiceGender: settings.voiceGender)
                    }) {
                        HStack {
                            Image(systemName: speechService.isSpeaking ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                                .font(.title2)
                            Text("サンプルを再生")
                                .font(.headline)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 50)
                        .foregroundColor(.white)
                        .background(Color.blue)
                        .cornerRadius(10)
                    }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                }

                Section(header: Text("OpenAI API設定")) {
                    SecureField("APIキー", text: $apiKeyInput)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onAppear {
                            apiKeyInput = settings.openAIAPIKey ?? ""
                        }
                        .onChange(of: apiKeyInput) { _, newValue in
                            settings.openAIAPIKey = newValue.isEmpty ? nil : newValue
                        }

                    if settings.openAIAPIKey != nil && !settings.openAIAPIKey!.isEmpty {
                        HStack {
                            Image(systemName: "checkmark.circle.fill")
                                .foregroundColor(.green)
                            Text("APIキーが設定されています")
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Section(header: Text("説明")) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("英語の学習コンテンツの音声として、女性または男性の音声を選択できます。")
                            .font(.body)
                        Text("デフォルトを選択すると、システムの設定に従います。")
                            .font(.body)
                            .foregroundColor(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("OpenAI APIキーを設定すると、単語追加時に自動で例文を生成できます。")
                            .font(.body)
                        Text("APIキーはOpenAIのウェブサイトで取得できます。")
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("設定")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

#Preview {
    SettingsView()
        .environmentObject(SettingsManager.shared)
}
