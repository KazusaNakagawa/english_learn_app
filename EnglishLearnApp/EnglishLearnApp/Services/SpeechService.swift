import AVFoundation
import Combine

class SpeechService: NSObject, ObservableObject {
    nonisolated(unsafe) private let synthesizer = AVSpeechSynthesizer()
    private var audioPlayer: AVAudioPlayer?
    private var currentUtterance: AVSpeechUtterance?

    @Published var isSpeaking = false
    @Published var speakingLanguage: String? = nil
    @Published var voiceGender: SettingsManager.VoiceGender = .default_

    /// Publisher that emits when speech finishes naturally (not cancelled).
    /// Use this instead of onChange(of: isSpeaking) for reliable completion detection.
    let speechFinishedPublisher = PassthroughSubject<Void, Never>()

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
        speakingLanguage = language

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

        currentUtterance = utterance
        isSpeaking = true
        synthesizer.speak(utterance)
    }

    @MainActor
    private func speakWithVoicevox(_ text: String) async {
        let settings = SettingsManager.shared
        let baseURL = AppConfig.voicevoxBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
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
            let (queryData, queryResponse) = try await URLSession.shared.data(for: queryRequest)
            guard let queryHTTP = queryResponse as? HTTPURLResponse, (200...299).contains(queryHTTP.statusCode) else {
                print("VOICEVOX audio_query failed: \((queryResponse as? HTTPURLResponse)?.statusCode ?? -1)")
                isSpeaking = false
                return
            }

            var synthRequest = URLRequest(url: synthURL)
            synthRequest.httpMethod = "POST"
            synthRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            synthRequest.httpBody = queryData
            let (audioData, synthResponse) = try await URLSession.shared.data(for: synthRequest)
            guard let synthHTTP = synthResponse as? HTTPURLResponse, (200...299).contains(synthHTTP.statusCode) else {
                print("VOICEVOX synthesis failed: \((synthResponse as? HTTPURLResponse)?.statusCode ?? -1)")
                isSpeaking = false
                return
            }

            audioPlayer = try AVAudioPlayer(data: audioData)
            audioPlayer?.delegate = self
            audioPlayer?.play()
        } catch {
            print("VOICEVOX error: \(error.localizedDescription)")
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
        currentUtterance = nil
        synthesizer.stopSpeaking(at: .immediate)
        audioPlayer?.stop()
        audioPlayer = nil
        isSpeaking = false
        speakingLanguage = nil
    }
}

extension SpeechService: AVSpeechSynthesizerDelegate {
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            // Only process if this utterance is the current one (not an old cancelled one)
            guard utterance === self.currentUtterance, self.isSpeaking else { return }
            self.isSpeaking = false
            self.speechFinishedPublisher.send()  // Notify natural completion
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async {
            // Only process if this utterance is still the current one
            // If a new speech started, currentUtterance will be different
            guard utterance === self.currentUtterance else { return }
            self.isSpeaking = false
        }
    }
}

extension SpeechService: AVAudioPlayerDelegate {
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        DispatchQueue.main.async {
            if self.isSpeaking {
                self.isSpeaking = false
                self.speechFinishedPublisher.send()  // Notify natural completion
            }
        }
    }
}
