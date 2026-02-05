import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: SettingsManager

    var body: some View {
        TabView {
            NavigationStack {
                WordListView()
            }
            .tabItem {
                Label("学習", systemImage: "books.vertical")
            }

            SettingsView()
                .tabItem {
                    Label("設定", systemImage: "gear")
                }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject private var settings: SettingsManager
    @StateObject private var speechService = SpeechService()

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

                Section(header: Text("説明")) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("英語の学習コンテンツの音声として、女性または男性の音声を選択できます。")
                            .font(.body)
                        Text("デフォルトを選択すると、システムの設定に従います。")
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
    ContentView()
        .environmentObject(SettingsManager.shared)
}
