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

    /// The conditions appended to the user prompt for sentence generation.
    ///
    /// Changes are automatically persisted to UserDefaults.
    @Published var promptConditions: String {
        didSet {
            UserDefaults.standard.set(promptConditions, forKey: "promptConditions")
        }
    }

    /// The base URL of the VOICEVOX ENGINE server (e.g. "http://192.168.1.10:50021").
    @Published var voicevoxServerURL: String {
        didSet {
            UserDefaults.standard.set(voicevoxServerURL, forKey: "voicevoxServerURL")
        }
    }

    /// The selected ずんだもん voice style.
    @Published var voicevoxStyle: VoicevoxStyle {
        didSet {
            UserDefaults.standard.set(voicevoxStyle.rawValue, forKey: "voicevoxStyle")
        }
    }

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
        case hisohiso  = 37

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

    /// The default conditions for the user prompt in sentence generation.
    static let defaultPromptConditions = """
    条件：
    - 日常会話、ビジネス、学習など多様なシーンの例文を含めてください
    - カテゴリは「日常会話」「ビジネス」「学習・教育」「趣味・娯楽」「旅行」などから適切なものを選んでください
    - 自然で実用的な例文にしてください
    - 日本語訳は自然な日本語にしてください
    """

    /// The UserDefaults key for the OpenAI API key.
    private let openAIAPIKeyKey = "openAIAPIKey"

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

        if let saved = UserDefaults.standard.string(forKey: "promptConditions") {
            self.promptConditions = saved
        } else {
            self.promptConditions = SettingsManager.defaultPromptConditions
        }

        self.voicevoxServerURL = UserDefaults.standard.string(forKey: "voicevoxServerURL") ?? ""

        if let savedStyle = UserDefaults.standard.object(forKey: "voicevoxStyle") as? Int,
           let style = VoicevoxStyle(rawValue: savedStyle) {
            self.voicevoxStyle = style
        } else {
            self.voicevoxStyle = .normal
        }
    }

    // MARK: - Private Methods

    /// Persists the voice gender setting to UserDefaults.
    private func saveVoiceGender() {
        UserDefaults.standard.set(voiceGender.rawValue, forKey: "voiceGender")
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
