import Foundation

class SettingsManager: ObservableObject {
    static let shared = SettingsManager()

    @Published var voiceGender: VoiceGender {
        didSet {
            saveVoiceGender()
        }
    }

    enum VoiceGender: String, CaseIterable {
        case default_ = "default"
        case female = "female"
        case male = "male"

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

    init() {
        if let saved = UserDefaults.standard.string(forKey: "voiceGender"),
           let gender = VoiceGender(rawValue: saved) {
            self.voiceGender = gender
        } else {
            self.voiceGender = .default_
        }
    }

    private func saveVoiceGender() {
        UserDefaults.standard.set(voiceGender.rawValue, forKey: "voiceGender")
    }
}
