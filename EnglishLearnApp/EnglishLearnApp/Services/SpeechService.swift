import AVFoundation

class SpeechService: NSObject, ObservableObject {
    private let synthesizer = AVSpeechSynthesizer()
    @Published var isSpeaking = false
    @Published var voiceGender: SettingsManager.VoiceGender = .default_

    override init() {
        super.init()
        synthesizer.delegate = self
        observeSettingsChanges()
    }

    private func observeSettingsChanges() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(updateVoiceGender),
            name: UserDefaults.didChangeNotification,
            object: nil
        )
    }

    @objc private func updateVoiceGender() {
        if let saved = UserDefaults.standard.string(forKey: "voiceGender"),
           let gender = SettingsManager.VoiceGender(rawValue: saved) {
            DispatchQueue.main.async {
                self.voiceGender = gender
            }
        }
    }

    func speak(_ text: String, language: String = "en-US", voiceGender: SettingsManager.VoiceGender = .default_) {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = getVoiceForGender(voiceGender, language: language)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.8
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0

        isSpeaking = true
        synthesizer.speak(utterance)
    }

    private func getVoiceForGender(_ gender: SettingsManager.VoiceGender, language: String) -> AVSpeechSynthesisVoice? {
        let availableVoices = AVSpeechSynthesisVoice.speechVoices()

        switch gender {
        case .default_:
            return AVSpeechSynthesisVoice(language: language)
        case .female:
            return availableVoices.first { voice in
                voice.language == language && voice.gender == .female
            } ?? AVSpeechSynthesisVoice(language: language)
        case .male:
            return availableVoices.first { voice in
                voice.language == language && voice.gender == .male
            } ?? AVSpeechSynthesisVoice(language: language)
        }
    }

    func stop() {
        if synthesizer.isSpeaking {
            synthesizer.stopSpeaking(at: .immediate)
        }
    }
}

extension SpeechService: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isSpeaking = false
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            self.isSpeaking = false
        }
    }
}
