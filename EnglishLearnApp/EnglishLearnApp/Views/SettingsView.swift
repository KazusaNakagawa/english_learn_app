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
    private let speechService = SpeechService.shared

    /// Local state for the OpenAI API key input field.
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

    // MARK: - Cache state
    @State private var cacheBytes: UInt64 = 0
    @State private var showingClearCacheConfirm = false
    @State private var showingClearCacheSuccess = false

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("英語の音声設定")) {
                    Picker("音声", selection: $settings.englishVoiceGender) {
                        ForEach(SettingsManager.VoiceGender.allCases, id: \.self) { gender in
                            Text(gender.label).tag(gender)
                        }
                    }
                    .pickerStyle(.segmented)

                    VoiceSampleButton(
                        text: "This is a test sentence.",
                        language: "en-US",
                        label: "英語サンプルを再生",
                        color: .blue,
                        speechService: speechService
                    )
                }

                Section(header: Text("日本語の音声設定")) {
                    Picker("音声", selection: $settings.japaneseVoiceGender) {
                        Text("ずんだもん").tag(SettingsManager.VoiceGender.zundamon)
                        Text("デフォルト").tag(SettingsManager.VoiceGender.default_)
                    }
                    .pickerStyle(.segmented)

                    VoiceSampleButton(
                        text: "これはテスト文です。",
                        language: "ja-JP",
                        label: "日本語サンプルを再生",
                        color: .green,
                        speechService: speechService
                    )
                }

                Section(header: Text("連続再生設定")) {
                    Picker("再生モード", selection: $settings.playbackMode) {
                        ForEach(SettingsManager.PlaybackMode.allCases, id: \.self) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)

                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("例文間の間隔")
                            Spacer()
                            Text(String(format: "%.1f秒", settings.sentenceDelaySeconds))
                                .foregroundColor(.secondary)
                        }
                        Slider(
                            value: $settings.sentenceDelaySeconds,
                            in: 0.5...3.0,
                            step: 0.5
                        )
                    }

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

                if settings.englishVoiceGender == .zundamon || settings.japaneseVoiceGender == .zundamon {
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

                    HStack {
                        Label("音声キャッシュ", systemImage: "waveform")
                        Spacer()
                        Text(Self.cacheSizeFormatter.string(fromByteCount: Int64(cacheBytes)))
                            .foregroundColor(.secondary)
                    }

                    Button(role: .destructive) {
                        showingClearCacheConfirm = true
                    } label: {
                        Label("キャッシュをクリア", systemImage: "trash")
                    }
                    .disabled(cacheBytes == 0)
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
                        Text("英語・日本語それぞれの音声を個別に設定できます。")
                            .font(.body)
                        Text("英語音声: デフォルト/女性/男性/ずんだもん から選択")
                            .font(.caption)
                            .foregroundColor(.secondary)
                        Text("日本語音声: ずんだもん/デフォルト から選択")
                            .font(.caption)
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

                    VStack(alignment: .leading, spacing: 8) {
                        Text("APIキーはiOS Keychainに安全に保存されます。")
                            .font(.body)
                        Text("Keychainはデバイスのセキュリティ機能により暗号化され、他のアプリからアクセスできません。")
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
                    // Use detailed error message from WordImportError
                    importErrorMessage = error.localizedDescription
                    showingImportError = true
                }
            case .failure(let error):
                importErrorMessage = "ファイル選択エラー\n\n\(error.localizedDescription)"
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
        .confirmationDialog(
            "音声キャッシュをクリアしますか？",
            isPresented: $showingClearCacheConfirm,
            titleVisibility: .visible
        ) {
            Button("クリア", role: .destructive) {
                Task {
                    let before = cacheBytes
                    await AudioCache.shared.clearAll()
                    let after = await AudioCache.shared.diskCacheSize()
                    cacheBytes = after
                    if after < before {
                        showingClearCacheSuccess = true
                    }
                }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("ダウンロード済みの音声データがすべて削除されます")
        }
        .alert("クリア完了", isPresented: $showingClearCacheSuccess) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("音声キャッシュをクリアしました")
        }
        .task {
            cacheBytes = await AudioCache.shared.diskCacheSize()
        }
    }

    // MARK: - Helpers

    private static let cacheSizeFormatter: ByteCountFormatter = {
        let f = ByteCountFormatter()
        f.allowedUnits = [.useBytes, .useKB, .useMB]
        f.countStyle = .file
        return f
    }()

}

/// A reusable button for playing voice sample in settings.
private struct VoiceSampleButton: View {
    let text: String
    let language: String
    let label: String
    let color: Color
    @ObservedObject var speechService: SpeechService

    private var isActive: Bool {
        speechService.isSpeaking && speechService.speakingLanguage == language
    }

    var body: some View {
        Button(action: {
            speechService.speak(text, language: language)
        }) {
            HStack {
                Image(systemName: isActive ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                    .font(.title2)
                Text(label)
                    .font(.headline)
            }
            .frame(maxWidth: .infinity)
            .frame(height: 50)
            .foregroundColor(.white)
            .background(color)
            .cornerRadius(10)
        }
        .listRowInsets(EdgeInsets())
        .listRowSeparator(.hidden)
    }
}

#Preview {
    SettingsView()
        .environmentObject(SettingsManager.shared)
}
