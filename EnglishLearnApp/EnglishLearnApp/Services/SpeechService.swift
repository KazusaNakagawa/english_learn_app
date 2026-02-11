import AVFoundation

class SpeechService: NSObject, ObservableObject {
    private let synthesizer = AVSpeechSynthesizer()
    private var audioPlayer: AVAudioPlayer?

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
        stop()

        if voiceGender == .zundamon {
            isSpeaking = true
            Task { @MainActor [weak self] in
                await self?.speakWithVoicevox(text)
            }
            return
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = getVoiceForGender(voiceGender, language: language)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.8
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0

        isSpeaking = true
        synthesizer.speak(utterance)
    }

    @MainActor
    private func speakWithVoicevox(_ text: String) async {
        let settings = SettingsManager.shared
        let baseURL = settings.voicevoxServerURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !baseURL.isEmpty else {
            isSpeaking = false
            return
        }

        let speakerID = settings.voicevoxStyle.rawValue

        guard let encodedText = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let queryURL = URL(string: "\(baseURL)/audio_query?text=\(encodedText)&speaker=\(speakerID)"),
              let synthURL = URL(string: "\(baseURL)/synthesis?speaker=\(speakerID)") else {
            isSpeaking = false
            return
        }

        do {
            var queryRequest = URLRequest(url: queryURL)
            queryRequest.httpMethod = "POST"
            let (queryData, _) = try await URLSession.shared.data(for: queryRequest)

            var synthRequest = URLRequest(url: synthURL)
            synthRequest.httpMethod = "POST"
            synthRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            synthRequest.httpBody = queryData
            let (audioData, _) = try await URLSession.shared.data(for: synthRequest)

            audioPlayer = try AVAudioPlayer(data: audioData)
            audioPlayer?.delegate = self
            audioPlayer?.play()
        } catch {
            isSpeaking = false
        }
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
        case .zundamon:
            return nil
        }
    }

    func stop() {
        synthesizer.stopSpeaking(at: .immediate)
        audioPlayer?.stop()
        audioPlayer = nil
        isSpeaking = false
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

extension SpeechService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async {
            self.isSpeaking = false
        }
    }
}
