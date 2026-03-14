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
    // MARK: - Shared Instance

    static let shared = SpeechService()

    // MARK: - Constants

    private enum Constants {
        static let speechRate: Float = AVSpeechUtteranceDefaultSpeechRate * 0.8
        static let pitchMultiplier: Float = 1.0
        static let volume: Float = 1.0
        static let utteranceDelay: TimeInterval = 0.0
    }

    // MARK: - Properties

    private let synthesizer = AVSpeechSynthesizer()
    private var audioPlayer: AVAudioPlayer?
    private var currentUtterance: AVSpeechUtterance?

    /// Unique identifier for the current VOICEVOX request.
    /// Used to invalidate stale async tasks when stop() or new speak() is called.
    private var voicevoxRequestID = UUID()

    @Published var isSpeaking = false
    @Published var speakingLanguage: String? = nil

    /// Publisher that emits when speech finishes naturally (not cancelled).
    /// Use this instead of onChange(of: isSpeaking) for reliable completion detection.
    let speechFinishedPublisher = PassthroughSubject<Void, Never>()

    override init() {
        super.init()
        synthesizer.delegate = self
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

    /// Speaks the given text using language-specific voice settings from SettingsManager.
    ///
    /// This method automatically selects the appropriate voice based on the language:
    /// - For English ("en-US"): Uses englishVoiceGender setting
    /// - For Japanese ("ja-JP"): Uses japaneseVoiceGender setting
    ///
    /// This method stops any ongoing speech before starting new playback. It tracks
    /// the current utterance to prevent race conditions from stale delegate callbacks.
    ///
    /// - Parameters:
    ///   - text: The text to be spoken
    ///   - language: The language code (default: "en-US")
    ///   - isContinuousPlayback: Set to true when called from continuous playback to prevent stopping the session (default: false)
    func speak(_ text: String, language: String = "en-US", isContinuousPlayback: Bool = false) {
        // Only stop if actually playing to avoid putting synthesizer in unstable state
        if synthesizer.isSpeaking || audioPlayer?.isPlaying == true {
            stop()
        } else {
            // Reset state without calling stopSpeaking
            currentUtterance = nil
            audioPlayer = nil
            isSpeaking = false
            speakingLanguage = nil
        }

        // Only notify when starting individual playback (not continuous playback)
        // This allows continuous playback views to stop cleanly when user taps individual play buttons
        if !isContinuousPlayback {
            NotificationCenter.default.post(name: .speechServiceDidStartNewPlayback, object: nil)
        }

        speakingLanguage = language

        // Get the appropriate voice gender based on language
        let settings = SettingsManager.shared
        let voiceGender = language == "ja-JP" ? settings.japaneseVoiceGender : settings.englishVoiceGender

        if voiceGender == .zundamon {
            isSpeaking = true
            _ = activateAudioSession()
            let requestID = UUID()
            voicevoxRequestID = requestID
            Task { [weak self] in
                await self?.speakWithVoicevox(text, requestID: requestID)
            }
            return
        }

        let utterance = createUtterance(text: text, voiceGender: voiceGender, language: language)

        currentUtterance = utterance
        isSpeaking = true
        // Ensure audio session is active for background playback.
        // During continuous playback, avoid reconfiguring category to prevent interruption.
        let audioSession = AVAudioSession.sharedInstance()
        do {
            // Only set category if we're starting fresh (not during continuous playback)
            if !isContinuousPlayback || audioSession.category != .playback {
                try audioSession.setCategory(.playback, mode: .default)
            }
            try audioSession.setActive(true)
        } catch {
            print("Failed to configure audio session for native TTS: \(error.localizedDescription)")
        }

        // Small delay to allow audio session to fully activate before speaking
        // This fixes an issue where speak() fails silently on first call
        if !isContinuousPlayback {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { [weak self] in
                self?.synthesizer.speak(utterance)
            }
        } else {
            synthesizer.speak(utterance)
        }
    }

    /// Synthesizes speech using the VOICEVOX API and plays it via AVAudioPlayer.
    ///
    /// This method first checks the audio cache for previously synthesized audio.
    /// On cache miss, it fetches from the VOICEVOX API and caches the result.
    ///
    /// - Parameters:
    ///   - text: The text to be spoken
    ///   - requestID: The unique identifier for this request, used to invalidate stale tasks
    private func speakWithVoicevox(_ text: String, requestID: UUID) async {
        let speakerID = SettingsManager.shared.voicevoxStyle.rawValue

        // Check cache first
        if let cachedAudio = await AudioCache.shared.get(text: text, speakerID: speakerID) {
            // Verify request is still valid before playing
            guard requestID == voicevoxRequestID else { return }
            playAudioData(cachedAudio, text: text, speakerID: speakerID)
            return
        }

        // Cache miss - fetch from API
        guard let audioData = await fetchVoicevoxAudio(text: text, speakerID: speakerID) else {
            // Verify request is still valid before handling failure
            guard requestID == voicevoxRequestID else { return }
            handleVoicevoxFailure()
            return
        }

        // Verify request is still valid before caching and playing
        guard requestID == voicevoxRequestID else { return }

        // Cache the audio data for future playback
        await AudioCache.shared.set(audioData, text: text, speakerID: speakerID)

        playAudioData(audioData, text: text, speakerID: speakerID)
    }

    /// Fetches audio data from VOICEVOX API.
    ///
    /// Makes two HTTP requests to the VOICEVOX server:
    /// 1. POST /audio_query to generate query parameters
    /// 2. POST /synthesis to synthesize audio from the query
    ///
    /// - Parameters:
    ///   - text: The text to synthesize
    ///   - speakerID: The VOICEVOX speaker ID
    /// - Returns: Audio data on success, nil on failure
    private func fetchVoicevoxAudio(text: String, speakerID: Int) async -> Data? {
        let baseURL = AppConfig.voicevoxBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !baseURL.isEmpty else { return nil }
        guard !AppConfig.voicevoxApiKey.isEmpty else {
            print("VOICEVOX API key not configured in AppConfig")
            return nil
        }

        guard let encodedText = text.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed),
              let queryURL = URL(string: "\(baseURL)/audio_query?text=\(encodedText)&speaker=\(speakerID)"),
              let synthURL = URL(string: "\(baseURL)/synthesis?speaker=\(speakerID)") else {
            return nil
        }

        do {
            let (queryData, queryResponse) = try await performPOSTRequest(to: queryURL)
            guard isSuccessfulResponse(queryResponse) else {
                print("VOICEVOX audio_query failed: \((queryResponse as? HTTPURLResponse)?.statusCode ?? -1)")
                return nil
            }

            let (audioData, synthResponse) = try await performPOSTRequest(to: synthURL, body: queryData, contentType: "application/json")
            guard isSuccessfulResponse(synthResponse) else {
                print("VOICEVOX synthesis failed: \((synthResponse as? HTTPURLResponse)?.statusCode ?? -1)")
                return nil
            }

            guard !audioData.isEmpty else {
                print("VOICEVOX returned empty audio data")
                return nil
            }

            return audioData
        } catch {
            print("VOICEVOX error: \(error.localizedDescription)")
            return nil
        }
    }

    /// Plays audio data using AVAudioPlayer.
    ///
    /// If playback fails due to corrupt audio data, the cache entry is evicted
    /// to allow re-fetching on the next attempt.
    ///
    /// - Parameters:
    ///   - audioData: The audio data to play
    ///   - text: The original text (used for cache eviction on failure)
    ///   - speakerID: The VOICEVOX speaker ID (used for cache eviction on failure)
    private func playAudioData(_ audioData: Data, text: String, speakerID: Int) {
        do {
            audioPlayer = try AVAudioPlayer(data: audioData)
            audioPlayer?.delegate = self

            // Enable background playback and ensure audio session is active
            let audioSession = AVAudioSession.sharedInstance()
            try audioSession.setCategory(.playback, mode: .default)
            try audioSession.setActive(true)

            if !audioPlayer!.play() {
                // Playback failed to start - evict potentially corrupt cache entry
                print("AVAudioPlayer.play() returned false - evicting cache entry")
                Task {
                    await AudioCache.shared.evict(text: text, speakerID: speakerID)
                }
                handleVoicevoxFailure()
            }
        } catch {
            // Initialization failed - evict potentially corrupt cache entry
            print("AVAudioPlayer error: \(error.localizedDescription)")
            Task {
                await AudioCache.shared.evict(text: text, speakerID: speakerID)
            }
            handleVoicevoxFailure()
        }
    }

    /// Handles VOICEVOX playback failure by resetting state and notifying listeners.
    private func handleVoicevoxFailure() {
        isSpeaking = false
        speechFinishedPublisher.send()
    }

    // MARK: - Helper Methods

    /// Creates and configures an AVSpeechUtterance with standard settings.
    private func createUtterance(text: String, voiceGender: SettingsManager.VoiceGender, language: String) -> AVSpeechUtterance {
        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = getVoiceForGender(voiceGender, language: language)
        utterance.rate = Constants.speechRate
        utterance.pitchMultiplier = Constants.pitchMultiplier
        utterance.volume = Constants.volume
        // Pre-warm the utterance to avoid buffer warnings (iOS 17 workaround)
        utterance.preUtteranceDelay = Constants.utteranceDelay
        utterance.postUtteranceDelay = Constants.utteranceDelay
        return utterance
    }

    /// Validates an HTTP response for successful status code.
    private func isSuccessfulResponse(_ response: URLResponse?) -> Bool {
        guard let httpResponse = response as? HTTPURLResponse else { return false }
        return (200...299).contains(httpResponse.statusCode)
    }

    /// Performs a POST request to the specified URL with API key authentication.
    private func performPOSTRequest(to url: URL, body: Data? = nil, contentType: String? = nil) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if let contentType {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        // Add API key for backend authentication
        request.setValue(AppConfig.voicevoxApiKey, forHTTPHeaderField: "x-api-key")
        request.httpBody = body
        return try await URLSession.shared.data(for: request)
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
        voicevoxRequestID = UUID()  // Invalidate in-flight VOICEVOX requests
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
