import SwiftUI
import UniformTypeIdentifiers

/// A view for configuring application settings.
///
/// This view provides controls for:
/// - Voice gender selection for text-to-speech
/// - OpenAI API key configuration for sentence generation
/// - OpenAI model selection
/// - Prompt preset management
///
/// Settings are automatically persisted via `SettingsManager`.
struct SettingsView: View {
    /// The shared settings manager injected from the environment.
    @EnvironmentObject private var settings: SettingsManager

    /// The speech service for playing sample audio.
    @StateObject private var speechService = SpeechService()

    /// Local state for the API key input field.
    @State private var apiKeyInput: String = ""

    // MARK: - Export / Import state
    @State private var exportURL: URL? = nil
    @State private var showingShareSheet = false
    @State private var isExporting = false
    @State private var exportErrorMessage: String? = nil
    @State private var showingExportError = false
    @State private var showingImportPicker = false
    @State private var pendingImportWords: [Word] = []
    @State private var showingImportConfirm = false
    @State private var importErrorMessage: String? = nil
    @State private var showingImportError = false
    @State private var importSuccessMessage: String? = nil
    @State private var showingImportSuccess = false

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

                Section(header: Text("連続再生設定")) {
                    Picker("再生モード", selection: $settings.playbackMode) {
                        ForEach(SettingsManager.PlaybackMode.allCases, id: \.self) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    VStack(alignment: .leading, spacing: 8) {
                        Text("連続再生時の音声パターンを選択できます")
                            .font(.body)
                        Text("バイリンガル: 英語→日本語→英語の順で再生")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text("英語のみ: 英語のみを2回繰り返します")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
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

                if settings.voiceGender == .zundamon {
                    Section(header: Text("VOICEVOX設定")) {
                        Picker("スタイル", selection: $settings.voicevoxStyle) {
                            ForEach(SettingsManager.VoicevoxStyle.allCases, id: \.self) { style in
                                Text(style.label).tag(style)
                            }
                        }

                        HStack(spacing: 4) {
                            Image(systemName: "c.circle")
                                .foregroundColor(.secondary)
                                .font(.caption)
                            Text("VOICEVOX:ずんだもん")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Section(header: Text("AIモデル設定")) {
                    Picker("使用モデル", selection: $settings.openAIModel) {
                        ForEach(SettingsManager.OpenAIModel.allCases, id: \.self) { model in
                            Text(model.label).tag(model)
                        }
                    }
                    .pickerStyle(.menu)
                }

                Section(header: Text("例文生成の条件")) {
                    NavigationLink(destination: PromptPresetsView()) {
                        HStack {
                            Text("プリセット管理")
                            Spacer()
                            Text(settings.activePreset.name)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Section(header: Text("データ管理")) {
                    Button {
                        guard !isExporting else { return }
                        isExporting = true
                        Task {
                            // Brief delay so the spinner renders before heavy work
                            try? await Task.sleep(nanoseconds: 150_000_000)
                            await MainActor.run {
                                if let url = WordDataManager.shared.exportToJSON() {
                                    exportURL = url
                                    isExporting = false
                                    showingShareSheet = true
                                } else {
                                    isExporting = false
                                    exportErrorMessage = "ファイルの生成に失敗しました。再度お試しください。"
                                    showingExportError = true
                                }
                            }
                        }
                    } label: {
                        if isExporting {
                            Label("エクスポート中...", systemImage: "square.and.arrow.up")
                        } else {
                            Label("単語リストをエクスポート", systemImage: "square.and.arrow.up")
                        }
                    }
                    .disabled(isExporting)

                    Button {
                        showingImportPicker = true
                    } label: {
                        Label("単語リストをインポート", systemImage: "square.and.arrow.down")
                    }
                }

                Section(header: Text("法的情報")) {
                    NavigationLink(destination: PrivacyPolicyView()) {
                        Label("プライバシーポリシー", systemImage: "hand.raised")
                    }
                    NavigationLink(destination: TermsOfServiceView()) {
                        Label("利用規約", systemImage: "doc.text")
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

                    VStack(alignment: .leading, spacing: 8) {
                        Text("AIモデルは精度やコストに応じて選択できます。GPT-4o miniは高速で低コスト、GPT-4oは高性能です。")
                            .font(.body)
                        Text("例文生成の条件は「プリセット管理」から選択・編集できます。組み込みプリセットはデフォルトに戻すことができます。")
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("設定")
            .navigationBarTitleDisplayMode(.inline)
            .scrollDismissesKeyboard(.interactively)
        }
        .background {
            if let url = exportURL {
                ActivityPresenter(activityItems: [url], isPresented: $showingShareSheet) {
                    exportURL = nil
                }
            }
        }
        .fileImporter(
            isPresented: $showingImportPicker,
            allowedContentTypes: [UTType.json]
        ) { result in
            switch result {
            case .success(let url):
                let accessing = url.startAccessingSecurityScopedResource()
                defer { if accessing { url.stopAccessingSecurityScopedResource() } }
                do {
                    pendingImportWords = try WordDataManager.shared.importFromJSON(url: url)
                    showingImportConfirm = true
                } catch {
                    importErrorMessage = "ファイルの読み込みに失敗しました。\n正しいエクスポートファイルか確認してください。"
                    showingImportError = true
                }
            case .failure(let error):
                importErrorMessage = error.localizedDescription
                showingImportError = true
            }
        }
        .confirmationDialog(
            "\(pendingImportWords.count)件の単語をインポートします",
            isPresented: $showingImportConfirm,
            titleVisibility: .visible
        ) {
            Button("既存データと結合") {
                WordDataManager.shared.mergeWords(pendingImportWords)
                importSuccessMessage = "\(pendingImportWords.count)件を既存データと結合しました"
                showingImportSuccess = true
            }
            Button("既存データを置き換え", role: .destructive) {
                WordDataManager.shared.replaceWords(pendingImportWords)
                importSuccessMessage = "\(pendingImportWords.count)件でデータを置き換えました"
                showingImportSuccess = true
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("インポート方法を選択してください")
        }
        .alert("インポート完了", isPresented: $showingImportSuccess) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(importSuccessMessage ?? "")
        }
        .alert("インポートエラー", isPresented: $showingImportError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(importErrorMessage ?? "不明なエラーが発生しました")
        }
        .alert("エクスポートエラー", isPresented: $showingExportError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(exportErrorMessage ?? "不明なエラーが発生しました")
        }
    }

}

#Preview {
    SettingsView()
        .environmentObject(SettingsManager.shared)
}
