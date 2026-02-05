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

    /// Voice gender options for text-to-speech.
    enum VoiceGender: String, CaseIterable {
        /// Use the system default voice.
        case default_ = "default"
        /// Use a female voice.
        case female = "female"
        /// Use a male voice.
        case male = "male"

        /// The localized display label for this option.
        var label: String {
            switch self {
            case .default_:
                return "デフォルト"
            case .female:
                return "女性"
            case .male:
                return "男性"
            }
        }
    }

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
