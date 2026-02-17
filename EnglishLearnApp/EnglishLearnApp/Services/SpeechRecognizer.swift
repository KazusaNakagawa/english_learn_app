import Speech
import AVFoundation

@MainActor
class SpeechRecognizer: ObservableObject {
    @Published var recognizedText = ""
    @Published var isRecording = false
    @Published var authorizationStatus: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    @Published var errorMessage: String?

    private let speechRecognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US"))
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let audioEngine = AVAudioEngine()

    init() {
        Task {
            await requestAuthorization()
        }
    }

    func requestAuthorization() async {
        authorizationStatus = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    func startRecording() {
        guard authorizationStatus == .authorized else {
            errorMessage = "音声認識の許可がありません"
            return
        }

        guard let speechRecognizer = speechRecognizer, speechRecognizer.isAvailable else {
            errorMessage = "音声認識が利用できません"
            return
        }

        recognizedText = ""
        errorMessage = nil

        do {
            try startAudioSession()
            try setupRecognition()
            isRecording = true
        } catch {
            errorMessage = "録音の開始に失敗しました: \(error.localizedDescription)"
        }
    }

    private func startAudioSession() throws {
        let audioSession = AVAudioSession.sharedInstance()
        try audioSession.setCategory(.record, mode: .measurement, options: .duckOthers)
        try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
    }

    private func setupRecognition() throws {
        recognitionTask?.cancel()
        recognitionTask = nil

        recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
        guard let recognitionRequest = recognitionRequest else {
            throw NSError(domain: "SpeechRecognizer", code: 1, userInfo: [NSLocalizedDescriptionKey: "認識リクエストの作成に失敗しました"])
        }

        recognitionRequest.shouldReportPartialResults = true

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)

        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            self?.recognitionRequest?.append(buffer)
        }

        audioEngine.prepare()
        try audioEngine.start()

        recognitionTask = speechRecognizer?.recognitionTask(with: recognitionRequest) { [weak self] result, error in
            Task { @MainActor in
                guard let self = self else { return }

                if let result = result {
                    self.recognizedText = result.bestTranscription.formattedString
                }

                if error != nil || result?.isFinal == true {
                    self.stopRecording()
                }
            }
        }
    }

    func stopRecording() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        isRecording = false

        let session = AVAudioSession.sharedInstance()
        try? session.setActive(false, options: .notifyOthersOnDeactivation)
        try? session.setCategory(.playback)
    }

    func checkPronunciation(expected: String) -> PronunciationResult {
        let normalizedExpected = expected.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedRecognized = recognizedText.lowercased().trimmingCharacters(in: .whitespacesAndNewlines)

        if normalizedRecognized.isEmpty {
            return .noInput
        }

        if normalizedRecognized == normalizedExpected {
            return .correct
        }

        if normalizedRecognized.contains(normalizedExpected) || normalizedExpected.contains(normalizedRecognized) {
            return .close
        }

        return .incorrect
    }
}

enum PronunciationResult {
    case correct
    case close
    case incorrect
    case noInput

    var message: String {
        switch self {
        case .correct:
            return "完璧です！🎉"
        case .close:
            return "惜しい！もう一度試してみましょう"
        case .incorrect:
            return "もう一度聞いて練習しましょう"
        case .noInput:
            return "音声が認識されませんでした"
        }
    }

    var color: String {
        switch self {
        case .correct:
            return "green"
        case .close:
            return "orange"
        case .incorrect, .noInput:
            return "red"
        }
    }
}
