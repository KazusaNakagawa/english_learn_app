import AVFoundation
import Combine

extension Notification.Name {
    static let speechServiceDidStartNewPlayback = Notification.Name("speechServiceDidStartNewPlayback")
}

/// Speech synthesis service managing TTS playback for both native iOS voices and VOICEVOX.
///
/// **Known Issues:**
/// - AVAudioBuffer warnings may appear in console on iOS 17+ (Apple framework bug, does not affect functionality)
/// - Swift concurrency warnings with AVSpeechSynthesizer are unavoidable due to ObjC interop
///
/// These warnings do not impact user experience or app stability.
@MainActor
class SpeechService: NSObject, ObservableObject {
    private let synthesizer = AVSpeechSynthesizer()
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
        configureAudioSession()
    }

    /// Configures the audio session for background playback.
    ///
    /// Sets the audio session category to `.playback` to allow audio to continue
    /// playing when the app is in the background or the screen is locked.
    /// Activation is deferred until actual playback begins to avoid interrupting other apps.
    private func configureAudioSession() {
        do {
            let audioSession = AVAudioSession.sharedInstance()
            // Set category now but delay activation until actual playback to avoid
            // interrupting other audio apps. Activation will be attempted when
            // speaking starts.
            try audioSession.setCategory(.playback, mode: .default)
        } catch {
            print("Failed to configure audio session: \(error.localizedDescription)")
        }
    }

    /// Activates the audio session for playback. Returns true on success.
    private func activateAudioSession() -> Bool {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setActive(true)
            return true
        } catch {
            print("Failed to activate audio session: \(error.localizedDescription)")
            return false
        }
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

    /// Speaks the given text using the specified language and voice gender.
    ///
    /// This method stops any ongoing speech before starting new playback. It tracks
    /// the current utterance to prevent race conditions from stale delegate callbacks.
    ///
    /// - Parameters:
    ///   - text: The text to be spoken
    ///   - language: The language code (default: "en-US")
    ///   - voiceGender: The voice gender preference (default: .default_)
    ///   - isContinuousPlayback: Set to true when called from continuous playback to prevent stopping the session (default: false)
    func speak(_ text: String, language: String = "en-US", voiceGender: SettingsManager.VoiceGender = .default_, isContinuousPlayback: Bool = false) {
        stop()

        // Only notify when starting individual playback (not continuous playback)
        // This allows continuous playback views to stop cleanly when user taps individual play buttons
        if !isContinuousPlayback {
            NotificationCenter.default.post(name: .speechServiceDidStartNewPlayback, object: nil)
        }

        speakingLanguage = language

        if voiceGender == .zundamon {
            isSpeaking = true
            Task { [weak self] in
                await self?.performVoicevoxPlayback(text)
            }
            return
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = getVoiceForGender(voiceGender, language: language)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.8
        utterance.pitchMultiplier = 1.0
        utterance.volume = 1.0

        // Pre-warm the utterance to avoid buffer warnings (iOS 17 workaround)
        utterance.preUtteranceDelay = 0.0
        utterance.postUtteranceDelay = 0.0

        currentUtterance = utterance
        isSpeaking = true
        // Activate audio session right before starting local TTS to avoid
        // preempting other audio until necessary.
        _ = activateAudioSession()
        synthesizer.speak(utterance)
    }

    /// Wrapper for VOICEVOX playback that activates audio session before synthesis.
    ///
    /// - Parameter text: The Japanese text to be spoken
    private func performVoicevoxPlayback(_ text: String) async {
        await MainActor.run {
            // Activate audio session before VOICEVOX playback
            _ = activateAudioSession()
        }
        await speakWithVoicevox(text)
    }

    /// Synthesizes speech using the VOICEVOX API and plays it via AVAudioPlayer.
    ///
    /// This method makes two HTTP requests to the VOICEVOX server:
    /// 1. POST /audio_query to generate query parameters
    /// 2. POST /synthesis to synthesize audio from the query
    ///
    /// - Parameter text: The Japanese text to be spoken
    private func speakWithVoicevox(_ text: String) async {
        let settings = await MainActor.run { SettingsManager.shared }
        let baseURL = AppConfig.voicevoxBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !baseURL.isEmpty else {
            await MainActor.run {
                isSpeaking = false
                speechFinishedPublisher.send()  // Notify failure to allow playback to continue or stop gracefully
            }
            return
        }

        let speakerID = settings.voicevoxStyle.rawValue

        guard let encodedText = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let queryURL = URL(string: "\(baseURL)/audio_query?text=\(encodedText)&speaker=\(speakerID)"),
              let synthURL = URL(string: "\(baseURL)/synthesis?speaker=\(speakerID)") else {
            await MainActor.run {
                isSpeaking = false
                speechFinishedPublisher.send()  // Notify failure to allow playback to continue or stop gracefully
            }
            return
        }

        do {
            var queryRequest = URLRequest(url: queryURL)
            queryRequest.httpMethod = "POST"
            let (queryData, queryResponse) = try await URLSession.shared.data(for: queryRequest)
            guard let queryHTTP = queryResponse as? HTTPURLResponse, (200...299).contains(queryHTTP.statusCode) else {
                print("VOICEVOX audio_query failed: \((queryResponse as? HTTPURLResponse)?.statusCode ?? -1)")
                await MainActor.run {
                    isSpeaking = false
                    speechFinishedPublisher.send()  // Notify failure to allow playback to continue or stop gracefully
                }
                return
            }

            var synthRequest = URLRequest(url: synthURL)
            synthRequest.httpMethod = "POST"
            synthRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
            synthRequest.httpBody = queryData
            let (audioData, synthResponse) = try await URLSession.shared.data(for: synthRequest)
            guard let synthHTTP = synthResponse as? HTTPURLResponse, (200...299).contains(synthHTTP.statusCode) else {
                print("VOICEVOX synthesis failed: \((synthResponse as? HTTPURLResponse)?.statusCode ?? -1)")
                await MainActor.run {
                    isSpeaking = false
                    speechFinishedPublisher.send()  // Notify failure to allow playback to continue or stop gracefully
                }
                return
            }

            // Validate audio data before creating AVAudioPlayer to avoid buffer warnings
            guard !audioData.isEmpty else {
                print("VOICEVOX returned empty audio data")
                await MainActor.run {
                    isSpeaking = false
                    speechFinishedPublisher.send()
                }
                return
            }

            await MainActor.run {
                do {
                    audioPlayer = try AVAudioPlayer(data: audioData)
                    audioPlayer?.delegate = self
                    // Ensure audio session is active before playing synthesized audio
                    _ = activateAudioSession()
                    audioPlayer?.play()
                } catch {
                    print("AVAudioPlayer error: \(error.localizedDescription)")
                    isSpeaking = false
                    speechFinishedPublisher.send()
                }
            }
        } catch {
            print("VOICEVOX error: \(error.localizedDescription)")
            await MainActor.run {
                isSpeaking = false
                speechFinishedPublisher.send()  // Notify failure to allow playback to continue or stop gracefully
            }
        }
    }

    /// Returns an appropriate AVSpeechSynthesisVoice for the specified gender and language.
    ///
    /// - Parameters:
    ///   - gender: The desired voice gender
    ///   - language: The language code for the voice
    /// - Returns: An AVSpeechSynthesisVoice, or nil for zundamon (uses VOICEVOX instead)
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

    /// Immediately stops all ongoing speech synthesis and clears the current utterance.
    ///
    /// This method stops both AVSpeechSynthesizer and AVAudioPlayer (VOICEVOX) playback,
    /// resets the isSpeaking flag, and clears the currentUtterance reference to prevent
    /// race conditions from stale delegate callbacks.
    ///
    /// Note: This does NOT deactivate the audio session, allowing seamless transitions
    /// between consecutive playback. Call deactivateAudioSession() explicitly when
    /// fully stopping a playback session (e.g., user stops continuous playback or view disappears).
    func stop() {
        currentUtterance = nil
        synthesizer.stopSpeaking(at: .immediate)
        audioPlayer?.stop()
        audioPlayer = nil
        isSpeaking = false
        speakingLanguage = nil
    }

    /// Deactivates the audio session to allow other apps to resume audio playback.
    ///
    /// Call this when fully stopping a playback session (not between consecutive sentences).
    /// Examples: user stops continuous playback, view disappears, app goes to background.
    func deactivateAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            // Non-fatal — just log.
            print("Failed to deactivate audio session: \(error.localizedDescription)")
        }
    }
}

extension SpeechService: AVSpeechSynthesizerDelegate {
    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            // Only process if this utterance is the current one (not an old cancelled one)
            guard utterance === self.currentUtterance, self.isSpeaking else { return }
            self.isSpeaking = false
            self.speechFinishedPublisher.send()  // Notify natural completion
        }
    }

    nonisolated func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            // Only process if this utterance is still the current one
            // If a new speech started, currentUtterance will be different
            guard utterance === self.currentUtterance else { return }
            self.isSpeaking = false
        }
    }
}

extension SpeechService: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            // Only process if this player is still the current one (not an old cancelled one)
            guard self.audioPlayer === player, self.isSpeaking else { return }
            self.isSpeaking = false
            self.speechFinishedPublisher.send()  // Notify natural completion
        }
    }
}
