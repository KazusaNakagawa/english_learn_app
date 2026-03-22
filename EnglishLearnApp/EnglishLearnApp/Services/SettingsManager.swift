import Foundation

/// Manages application settings with UserDefaults persistence.
///
/// This singleton class handles user preferences such as voice settings
/// and API keys. All settings are automatically persisted to UserDefaults.
///
/// ## Usage
/// ```swift
/// // Access language-specific voice settings
/// let englishVoice = SettingsManager.shared.englishVoiceGender
/// let japaneseVoice = SettingsManager.shared.japaneseVoiceGender
///
/// // Set OpenAI API key
/// SettingsManager.shared.openAIAPIKey = "sk-..."
/// ```
class SettingsManager: ObservableObject {
    /// The shared singleton instance.
    static let shared = SettingsManager()

    /// The selected voice gender for English text-to-speech.
    ///
    /// Changes are automatically persisted to UserDefaults.
    @Published var englishVoiceGender: VoiceGender {
        didSet {
            saveEnglishVoiceGender()
        }
    }

    /// The selected voice gender for Japanese text-to-speech.
    ///
    /// Changes are automatically persisted to UserDefaults.
    @Published var japaneseVoiceGender: VoiceGender {
        didSet {
            saveJapaneseVoiceGender()
        }
    }

    /// The OpenAI API key for sentence generation.
    ///
    /// Set this value before using `OpenAIService`.
    /// Changes are automatically persisted to the iOS Keychain.
    @Published var openAIAPIKey: String? {
        didSet {
            saveOpenAIAPIKey()
        }
    }

    /// The selected OpenAI model for sentence generation.
    ///
    /// Changes are automatically persisted to UserDefaults.
    @Published var openAIModel: OpenAIModel {
        didSet {
            UserDefaults.standard.set(openAIModel.rawValue, forKey: "openAIModel")
        }
    }

    /// Custom (non-built-in) presets stored in UserDefaults.
    @Published var customPresets: [PromptPreset] {
        didSet {
            saveCustomPresets(customPresets)
        }
    }

    /// The ID of the currently active preset.
    @Published var activePresetID: UUID {
        didSet {
            UserDefaults.standard.set(activePresetID.uuidString, forKey: "activePresetID")
        }
    }

    /// User edits to built-in preset conditions, keyed by UUID string.
    /// Only the overridden text is stored; the name stays fixed.
    @Published var builtInOverrides: [String: String] {
        didSet {
            saveBuiltInOverrides()
        }
    }

    /// The selected ずんだもん voice style.
    @Published var voicevoxStyle: VoicevoxStyle {
        didSet {
            UserDefaults.standard.set(voicevoxStyle.rawValue, forKey: "voicevoxStyle")
        }
    }

    /// The selected playback mode for continuous playback.
    @Published var playbackMode: PlaybackMode {
        didSet {
            UserDefaults.standard.set(playbackMode.rawValue, forKey: "playbackMode")
        }
    }

    /// The delay in seconds between sentences during continuous playback.
    ///
    /// Range: 0.5 - 3.0 seconds. Default: 1.5 seconds.
    /// Values outside this range are clamped automatically.
    @Published var sentenceDelaySeconds: Double {
        didSet {
            let clamped = min(max(sentenceDelaySeconds, 0.5), 3.0)
            if sentenceDelaySeconds != clamped {
                sentenceDelaySeconds = clamped
                return
            }
            UserDefaults.standard.set(sentenceDelaySeconds, forKey: "sentenceDelaySeconds")
        }
    }

    // MARK: - Computed Properties

    /// All presets: built-ins (with any user edits applied) first, then custom.
    var allPresets: [PromptPreset] {
        let overriddenBuiltIns = PromptPreset.builtIns.map { preset -> PromptPreset in
            if let overriddenConditions = builtInOverrides[preset.id.uuidString] {
                return PromptPreset(id: preset.id, name: preset.name,
                                   conditions: overriddenConditions, isBuiltIn: true)
            }
            return preset
        }
        return overriddenBuiltIns + customPresets
    }

    /// The currently active preset, falling back to the general preset.
    var activePreset: PromptPreset {
        allPresets.first { $0.id == activePresetID } ?? PromptPreset.general
    }

    /// The conditions string of the active preset.
    var activeConditions: String {
        activePreset.conditions
    }

    /// Maximum total number of presets (built-in + custom).
    static let maxPresets = 10

    // MARK: - Nested Types

    /// Voice gender options for text-to-speech.
    enum VoiceGender: String, CaseIterable {
        /// Use the system default voice.
        case default_ = "default"
        /// Use a female voice.
        case female = "female"
        /// Use a male voice.
        case male = "male"
        /// Use VOICEVOX ずんだもん.
        case zundamon = "zundamon"

        /// The localized display label for this option.
        var label: String {
            switch self {
            case .default_:
                return "デフォルト"
            case .female:
                return "女性"
            case .male:
                return "男性"
            case .zundamon:
                return "ずんだもん"
            }
        }
    }

    /// VOICEVOX ずんだもん style options.
    /// The raw value is the VOICEVOX style ID used in the API `speaker` parameter.
    enum VoicevoxStyle: Int, CaseIterable {
        case normal    = 3
        case sweet     = 1
        case tsundere  = 7
        case sexy      = 5
        case whisper   = 22
        case hisohiso  = 38

        var label: String {
            switch self {
            case .normal:   return "ノーマル"
            case .sweet:    return "あまあま"
            case .tsundere: return "ツンツン"
            case .sexy:     return "セクシー"
            case .whisper:  return "ささやき"
            case .hisohiso: return "ヒソヒソ"
            }
        }
    }

    /// Playback mode options for continuous playback.
    enum PlaybackMode: String, CaseIterable {
        case bilingual = "bilingual"
        case englishOnly = "english_only"

        var label: String {
            switch self {
            case .bilingual:
                return "バイリンガル (EN→JA→EN)"
            case .englishOnly:
                return "英語のみ (EN→EN)"
            }
        }

        /// Number of steps per item for this mode.
        var stepsPerItem: Int {
            switch self {
            case .bilingual: return 3
            case .englishOnly: return 2
            }
        }

        /// Returns the step label for display purposes.
        ///
        /// - Parameter step: The step index (0-based)
        /// - Returns: Localized step label
        func stepLabel(for step: Int) -> String {
            let clampedStep = min(max(step, 0), stepsPerItem - 1)

            switch self {
            case .bilingual:
                return ["English (1st)", "Japanese", "English (2nd)"][clampedStep]
            case .englishOnly:
                return ["English (1st)", "English (2nd)"][clampedStep]
            }
        }
    }

    /// OpenAI model options for sentence generation.
    enum OpenAIModel: String, CaseIterable {
        case gpt4oMini = "gpt-4o-mini"
        case gpt4o = "gpt-4o"
        case gpt4Turbo = "gpt-4-turbo"
        case gpt35Turbo = "gpt-3.5-turbo"

        var label: String {
            switch self {
            case .gpt4oMini:
                return "GPT-4o mini（高速・低コスト）"
            case .gpt4o:
                return "GPT-4o（高性能）"
            case .gpt4Turbo:
                return "GPT-4 Turbo"
            case .gpt35Turbo:
                return "GPT-3.5 Turbo（最安価）"
            }
        }
    }

    /// The UserDefaults key for the OpenAI API key (legacy, used for migration).
    private let openAIAPIKeyKey = "openAIAPIKey"

    /// Flag to track if Keychain migration has been completed.
    private let keychainMigrationKey = "keychainMigrationCompleted"

    // MARK: - Initializer

    /// Initializes the settings manager and loads saved preferences.
    init() {
        if let saved = UserDefaults.standard.string(forKey: "englishVoiceGender"),
           let gender = VoiceGender(rawValue: saved) {
            self.englishVoiceGender = gender
        } else {
            self.englishVoiceGender = .default_
        }

        if let saved = UserDefaults.standard.string(forKey: "japaneseVoiceGender"),
           let gender = VoiceGender(rawValue: saved) {
            self.japaneseVoiceGender = gender
        } else {
            self.japaneseVoiceGender = .zundamon
        }

        // Load API key from Keychain
        self.openAIAPIKey = KeychainService.shared.retrieve(for: .openAI)

        if let saved = UserDefaults.standard.string(forKey: "openAIModel"),
           let model = OpenAIModel(rawValue: saved) {
            self.openAIModel = model
        } else {
            self.openAIModel = .gpt4oMini
        }

        if let savedStyle = UserDefaults.standard.object(forKey: "voicevoxStyle") as? Int,
           let style = VoicevoxStyle(rawValue: savedStyle) {
            self.voicevoxStyle = style
        } else {
            self.voicevoxStyle = .normal
        }

        if let saved = UserDefaults.standard.string(forKey: "playbackMode"),
           let mode = PlaybackMode(rawValue: saved) {
            self.playbackMode = mode
        } else {
            self.playbackMode = .bilingual
        }

        // Load sentence delay (default: 1.5 seconds)
        let savedDelay = UserDefaults.standard.double(forKey: "sentenceDelaySeconds")
        if savedDelay > 0 {
            self.sentenceDelaySeconds = min(max(savedDelay, 0.5), 3.0)
        } else {
            self.sentenceDelaySeconds = 1.5
        }

        // Load custom presets
        if let data = UserDefaults.standard.data(forKey: "promptPresets"),
           let decoded = try? JSONDecoder().decode([PromptPreset].self, from: data) {
            self.customPresets = decoded
        } else {
            self.customPresets = []
        }

        // Load active preset ID
        if let idString = UserDefaults.standard.string(forKey: "activePresetID"),
           let uuid = UUID(uuidString: idString) {
            self.activePresetID = uuid
        } else {
            self.activePresetID = PromptPreset.general.id
        }

        // Load built-in overrides
        if let data = UserDefaults.standard.data(forKey: "builtInOverrides"),
           let decoded = try? JSONDecoder().decode([String: String].self, from: data) {
            self.builtInOverrides = decoded
        } else {
            self.builtInOverrides = [:]
        }

        // Migration: convert legacy promptConditions to a custom preset if needed
        let legacyKey = "promptConditions"
        if UserDefaults.standard.object(forKey: "promptPresets") == nil,
           let legacyConditions = UserDefaults.standard.string(forKey: legacyKey) {
            let defaultConditions = PromptPreset.general.conditions
            if legacyConditions.trimmingCharacters(in: .whitespacesAndNewlines) !=
               defaultConditions.trimmingCharacters(in: .whitespacesAndNewlines) {
                // User had a custom prompt — migrate it as a new custom preset
                let migrated = PromptPreset(name: "マイプリセット", conditions: legacyConditions)
                self.customPresets = [migrated]
                self.activePresetID = migrated.id
                saveCustomPresets([migrated])
                UserDefaults.standard.set(migrated.id.uuidString, forKey: "activePresetID")
            }
            UserDefaults.standard.removeObject(forKey: legacyKey)
        }

        // Migrate OpenAI key from UserDefaults to Keychain (one-time)
        // This must be called after all stored properties are initialized
        migrateOpenAIKeyToKeychain()

        // Migrate voiceGender to language-specific settings (one-time)
        migrateVoiceGenderSettings()
    }

    // MARK: - Preset Management

    /// Adds a new custom preset if the total count is below the maximum.
    func addPreset(_ preset: PromptPreset) {
        guard allPresets.count < SettingsManager.maxPresets else { return }
        customPresets.append(preset)
    }

    /// Updates a preset by ID.
    /// For built-ins, stores the edited conditions in `builtInOverrides` (or clears the
    /// override when the conditions are restored to the original).
    /// For custom presets, updates the entry in `customPresets`.
    func updatePreset(_ preset: PromptPreset) {
        if preset.isBuiltIn {
            let original = PromptPreset.builtIns.first { $0.id == preset.id }?.conditions ?? ""
            if preset.conditions == original {
                builtInOverrides.removeValue(forKey: preset.id.uuidString)
            } else {
                builtInOverrides[preset.id.uuidString] = preset.conditions
            }
        } else {
            guard let idx = customPresets.firstIndex(where: { $0.id == preset.id }) else { return }
            customPresets[idx] = preset
        }
    }

    /// Restores a built-in preset's conditions to the hardcoded original.
    func resetPreset(id: UUID) {
        builtInOverrides.removeValue(forKey: id.uuidString)
    }

    /// Returns true if a built-in preset has been edited by the user.
    func isPresetModified(id: UUID) -> Bool {
        builtInOverrides[id.uuidString] != nil
    }

    /// Generates a Markdown string containing all presets.
    /// Built-in presets are labelled with `(built-in)`.
    var exportMarkdown: String {
        var lines = ["# Prompt Presets", ""]
        for preset in allPresets {
            let title = preset.isBuiltIn ? "## \(preset.name) (built-in)" : "## \(preset.name)"
            lines.append(title)
            lines.append("")
            lines.append(preset.conditions)
            lines.append("")
            lines.append("---")
            lines.append("")
        }
        return lines.joined(separator: "\n")
    }

    /// Deletes a custom preset by ID. Built-in presets cannot be deleted.
    func deletePreset(id: UUID) {
        customPresets.removeAll { $0.id == id }
        // If the deleted preset was active, fall back to general
        if activePresetID == id {
            activePresetID = PromptPreset.general.id
        }
    }

    /// Persists custom presets to UserDefaults.
    func saveCustomPresets(_ presets: [PromptPreset]) {
        if let data = try? JSONEncoder().encode(presets) {
            UserDefaults.standard.set(data, forKey: "promptPresets")
        }
    }

    // MARK: - Private Methods

    /// Persists the English voice gender setting to UserDefaults.
    private func saveEnglishVoiceGender() {
        UserDefaults.standard.set(englishVoiceGender.rawValue, forKey: "englishVoiceGender")
    }

    /// Persists the Japanese voice gender setting to UserDefaults.
    private func saveJapaneseVoiceGender() {
        UserDefaults.standard.set(japaneseVoiceGender.rawValue, forKey: "japaneseVoiceGender")
    }

    /// Persists built-in overrides to UserDefaults.
    private func saveBuiltInOverrides() {
        if let data = try? JSONEncoder().encode(builtInOverrides) {
            UserDefaults.standard.set(data, forKey: "builtInOverrides")
        }
    }

    /// Persists the OpenAI API key to the Keychain.
    ///
    /// If the key is nil or empty, removes the stored value.
    private func saveOpenAIAPIKey() {
        if let key = openAIAPIKey, !key.isEmpty {
            KeychainService.shared.save(key: key, for: .openAI)
        } else {
            KeychainService.shared.delete(for: .openAI)
        }
    }

    /// Migrates the OpenAI API key from UserDefaults to Keychain.
    ///
    /// This method runs once on app upgrade. It:
    /// 1. Checks if migration has already been completed
    /// 2. Reads the key from UserDefaults (if present)
    /// 3. Saves it to Keychain
    /// 4. Removes the key from UserDefaults
    /// 5. Marks migration as complete
    private func migrateOpenAIKeyToKeychain() {
        // Skip if already migrated
        guard !UserDefaults.standard.bool(forKey: keychainMigrationKey) else { return }

        // Check if there's a key in UserDefaults to migrate
        if let legacyKey = UserDefaults.standard.string(forKey: openAIAPIKeyKey),
           !legacyKey.isEmpty {
            // Only migrate if we don't already have a key in Keychain
            if openAIAPIKey == nil {
                KeychainService.shared.save(key: legacyKey, for: .openAI)
                self.openAIAPIKey = legacyKey
            }
            // Remove from UserDefaults regardless (don't leave plaintext key lying around)
            UserDefaults.standard.removeObject(forKey: openAIAPIKeyKey)
        }

        // Mark migration as complete
        UserDefaults.standard.set(true, forKey: keychainMigrationKey)
    }

    /// Migrates the old voiceGender setting to language-specific settings.
    ///
    /// This handles the transition from a single voiceGender setting to separate
    /// englishVoiceGender and japaneseVoiceGender settings.
    private func migrateVoiceGenderSettings() {
        let legacyKey = "voiceGender"
        let migrationKey = "voiceGenderLanguageMigrationCompleted"

        // Skip if already migrated
        guard !UserDefaults.standard.bool(forKey: migrationKey) else { return }

        // Only migrate if the new keys don't exist yet
        let hasEnglish = UserDefaults.standard.string(forKey: "englishVoiceGender") != nil
        let hasJapanese = UserDefaults.standard.string(forKey: "japaneseVoiceGender") != nil

        if !hasEnglish || !hasJapanese {
            // Check if there's a legacy voiceGender to migrate
            if let legacyValue = UserDefaults.standard.string(forKey: legacyKey) {
                // Migrate to both language settings
                if !hasEnglish {
                    UserDefaults.standard.set(legacyValue, forKey: "englishVoiceGender")
                    self.englishVoiceGender = VoiceGender(rawValue: legacyValue) ?? .default_
                }
                if !hasJapanese {
                    UserDefaults.standard.set(legacyValue, forKey: "japaneseVoiceGender")
                    self.japaneseVoiceGender = VoiceGender(rawValue: legacyValue) ?? .zundamon
                }

                // Remove the old key
                UserDefaults.standard.removeObject(forKey: legacyKey)
            }
        }

        // Mark migration as complete
        UserDefaults.standard.set(true, forKey: migrationKey)
    }
}
