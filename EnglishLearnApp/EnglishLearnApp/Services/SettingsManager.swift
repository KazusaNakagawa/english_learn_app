import Foundation

/// Manages application settings with UserDefaults persistence.
///
/// This singleton class handles user preferences such as voice settings
/// and API keys. All settings are automatically persisted to UserDefaults.
///
/// ## Usage
/// ```swift
/// // Access voice gender setting
/// let gender = SettingsManager.shared.voiceGender
///
/// // Set OpenAI API key
/// SettingsManager.shared.openAIAPIKey = "sk-..."
/// ```
class SettingsManager: ObservableObject {
    /// The shared singleton instance.
    static let shared = SettingsManager()

    /// The selected voice gender for text-to-speech.
    ///
    /// Changes are automatically persisted to UserDefaults.
    @Published var voiceGender: VoiceGender {
        didSet {
            saveVoiceGender()
        }
    }

    /// The OpenAI API key for sentence generation.
    ///
    /// Set this value before using `OpenAIService`.
    /// Changes are automatically persisted to UserDefaults.
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

    /// The UserDefaults key for the OpenAI API key.
    private let openAIAPIKeyKey = "openAIAPIKey"

    // MARK: - Initializer

    /// Initializes the settings manager and loads saved preferences.
    init() {
        if let saved = UserDefaults.standard.string(forKey: "voiceGender"),
           let gender = VoiceGender(rawValue: saved) {
            self.voiceGender = gender
        } else {
            self.voiceGender = .default_
        }

        self.openAIAPIKey = UserDefaults.standard.string(forKey: openAIAPIKeyKey)

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

    /// Persists the voice gender setting to UserDefaults.
    private func saveVoiceGender() {
        UserDefaults.standard.set(voiceGender.rawValue, forKey: "voiceGender")
    }

    /// Persists built-in overrides to UserDefaults.
    private func saveBuiltInOverrides() {
        if let data = try? JSONEncoder().encode(builtInOverrides) {
            UserDefaults.standard.set(data, forKey: "builtInOverrides")
        }
    }

    /// Persists the OpenAI API key to UserDefaults.
    ///
    /// If the key is nil, removes the stored value.
    private func saveOpenAIAPIKey() {
        if let key = openAIAPIKey {
            UserDefaults.standard.set(key, forKey: openAIAPIKeyKey)
        } else {
            UserDefaults.standard.removeObject(forKey: openAIAPIKeyKey)
        }
    }
}
