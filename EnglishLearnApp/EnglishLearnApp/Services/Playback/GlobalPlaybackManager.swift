import Foundation
import Combine

/// Global playback manager that provides app-wide continuous playback with a persistent mini-player.
///
/// This manager wraps `ContinuousPlaybackManager<QueueItem>` and exposes state for SwiftUI views.
/// It handles:
/// - Queue management (enqueue, remove, clear)
/// - Speech completion via publisher subscription
/// - Remote command center integration
/// - Now Playing info updates
///
/// **Usage:** Inject as an `@EnvironmentObject` from the app root.
@MainActor
final class GlobalPlaybackManager: ObservableObject {
    // MARK: - Constants

    private enum Constants {
        /// Default VOICEVOX speaker ID for English TTS
        /// Note: Only used when englishVoiceGender is set to .zundamon
        static let englishSpeakerID = 3

        /// Prefetch lookahead for bilingual mode (3 steps per item = longer playback)
        static let bilingualPrefetchLookahead = 1

        /// Prefetch lookahead for English-only mode (2 steps per item = shorter playback)
        static let englishOnlyPrefetchLookahead = 2
    }

    // MARK: - Published State

    /// The current playback queue.
    @Published private(set) var queue: [QueueItem] = []

    /// Current index in the queue.
    @Published private(set) var currentIndex: Int = 0

    /// Current playback step within an item (0=EN, 1=JA, 2=EN for bilingual).
    @Published private(set) var currentStep: Int = 0

    /// Whether playback is currently active.
    @Published private(set) var isPlaying: Bool = false

    // MARK: - Dependencies

    private let speechService: SpeechService
    private let settings: SettingsManager
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Internal Manager

    private var internalManager: ContinuousPlaybackManager<QueueItem>?
    private let remoteCommandManager = RemoteCommandCenterManager()

    // MARK: - Initialization

    /// Creates a new global playback manager.
    ///
    /// - Parameters:
    ///   - speechService: The shared speech service for TTS
    ///   - settings: The settings manager for playback mode preferences
    init(speechService: SpeechService, settings: SettingsManager) {
        self.speechService = speechService
        self.settings = settings

        setupSpeechFinishedSubscription()
        setupRemoteCommandHandlers()
        setupPlaybackModeObserver()
    }

    // MARK: - Setup

    private func setupSpeechFinishedSubscription() {
        speechService.speechFinishedPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in
                self?.handleSpeechFinished()
            }
            .store(in: &cancellables)
    }

    private func setupRemoteCommandHandlers() {
        remoteCommandManager.setup(
            onPlay: { [weak self] in
                guard let self, !self.isPlaying, !self.queue.isEmpty else { return }
                self.resume()
            },
            onPause: { [weak self] in
                self?.pause()
            },
            onNext: { [weak self] in
                self?.next()
            },
            onPrevious: { [weak self] in
                self?.previous()
            }
        )
    }

    private func setupPlaybackModeObserver() {
        settings.$playbackMode
            .dropFirst()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] newMode in
                self?.internalManager?.updatePlaybackMode(newMode)
                self?.syncStateFromManager()
            }
            .store(in: &cancellables)
    }

    // MARK: - Public Methods

    /// The current item in the queue (playing or paused).
    /// Returns the item at currentIndex if queue has items, regardless of playback state.
    var currentItem: QueueItem? {
        guard !queue.isEmpty, currentIndex < queue.count else { return nil }
        return queue[currentIndex]
    }

    /// Checks if the given queue matches the currently playing queue.
    ///
    /// Useful for views to determine if they "own" the current playback.
    ///
    /// - Parameter items: Queue items to compare against current queue
    /// - Returns: true if the items match the current queue (same IDs in same order)
    func isPlayingQueue(_ items: [QueueItem]) -> Bool {
        guard isPlaying else { return false }
        let currentIDs = queue.map { $0.id }
        let givenIDs = items.map { $0.id }
        return currentIDs == givenIDs
    }

    /// Enqueues items and starts playback from the specified index.
    ///
    /// This replaces any existing queue and starts fresh playback.
    ///
    /// - Parameters:
    ///   - items: The items to enqueue
    ///   - startIndex: The index to start from (default: 0)
    func enqueue(_ items: [QueueItem], startIndex: Int = 0) {
        guard !items.isEmpty, items.indices.contains(startIndex) else { return }

        // Invalidate pending completion work tied to the previous manager
        internalManager?.stop()
        speechService.stop()

        // Create or recreate the internal manager
        internalManager = ContinuousPlaybackManager(
            playbackMode: settings.playbackMode,
            speechHandler: { [weak self] item, step in
                self?.handleSpeech(for: item, step: step)
            },
            completionHandler: { [weak self] in
                self?.handlePlaybackCompletion()
            }
        )

        queue = items
        internalManager?.start(items: items, startIndex: startIndex)
        syncStateFromManager()
    }

    /// Resumes playback from the current position.
    ///
    /// Only works if there are items in the queue and playback is not active.
    func resume() {
        guard !queue.isEmpty, !isPlaying else { return }

        // Restart from current index
        internalManager?.start(items: queue, startIndex: currentIndex)
        syncStateFromManager()
    }

    /// Pauses playback while maintaining queue and Now Playing info.
    ///
    /// Unlike `stop()`, this keeps the Now Playing metadata visible on the lock screen
    /// with playbackRate set to 0, allowing easy resume from the same position.
    func pause() {
        guard isPlaying else { return }

        internalManager?.stop()
        speechService.stop()
        speechService.deactivateAudioSession()

        // Update Now Playing to paused state (playbackRate = 0) instead of clearing
        if let item = currentItem {
            let stepLabel = settings.playbackMode.stepLabel(for: currentStep)
            NowPlayingInfoManager.update(
                title: item.sentence.english,
                artist: "\(item.word.word) - \(stepLabel)",
                album: item.word.meaning,
                playbackRate: 0.0
            )
        }

        syncStateFromManager()

        // Cancel all prefetch tasks when pausing
        Task { await PrefetchService.shared.cancelAll() }
    }

    /// Stops playback and clears state (but keeps the queue).
    func stop() {
        let wasPlaying = isPlaying
        internalManager?.stop()
        speechService.stop()
        speechService.deactivateAudioSession()
        NowPlayingInfoManager.clear()
        syncStateFromManager()

        // Only cancel prefetch tasks if this manager was actually playing
        // to avoid clearing view-level prefetch caches
        if wasPlaying {
            Task { await PrefetchService.shared.cancelAll() }
        }
    }

    /// Advances to the next item.
    func next() {
        guard internalManager?.next() == true else { return }
        syncStateFromManager()
    }

    /// Returns to the previous item.
    func previous() {
        guard internalManager?.previous() == true else { return }
        syncStateFromManager()
    }

    /// Removes an item from the queue at the specified index.
    ///
    /// Handles edge cases:
    /// - If removing the current item, advances to the next
    /// - If the queue becomes empty, stops playback
    /// - If removing before current index, adjusts current index
    func removeFromQueue(at index: Int) {
        guard index >= 0, index < queue.count else { return }
        let wasPlaying = isPlaying
        let currentItemID = currentItem?.id

        queue.remove(at: index)

        guard !queue.isEmpty else {
            clearQueue()
            return
        }

        if let currentItemID,
           let newIndex = queue.firstIndex(where: { $0.id == currentItemID }) {
            currentIndex = newIndex
        } else {
            currentIndex = min(currentIndex, queue.count - 1)
            currentStep = 0
        }

        if wasPlaying {
            enqueue(queue, startIndex: currentIndex)
        }
    }

    /// Moves items within the queue from one position to another.
    ///
    /// Adjusts currentIndex to track the currently playing item after the move.
    ///
    /// - Parameters:
    ///   - fromOffsets: The indices of items to move
    ///   - toOffset: The destination index
    func move(fromOffsets: IndexSet, toOffset: Int) {
        let wasPlaying = isPlaying
        let currentItemID = currentItem?.id

        queue.move(fromOffsets: fromOffsets, toOffset: toOffset)

        // Update currentIndex to track the moved item
        if let currentItemID,
           let newIndex = queue.firstIndex(where: { $0.id == currentItemID }) {
            currentIndex = newIndex
        }

        // Re-enqueue if playing to sync internal manager
        if wasPlaying {
            enqueue(queue, startIndex: currentIndex)
        }
    }

    /// Clears the entire queue and stops playback.
    func clearQueue() {
        stop()
        queue = []
        currentIndex = 0
        currentStep = 0
        isPlaying = false
    }

    // MARK: - Private Methods

    private func handleSpeech(for item: QueueItem, step: Int) {
        let mode = settings.playbackMode

        switch mode {
        case .bilingual:
            switch step {
            case 0, 2:
                speechService.speak(item.sentence.english, language: "en-US", isContinuousPlayback: true)
            case 1:
                speechService.speak(item.sentence.japanese, language: "ja-JP", isContinuousPlayback: true)
            default:
                break
            }
        case .englishOnly:
            speechService.speak(item.sentence.english, language: "en-US", isContinuousPlayback: true)
        }

        // Update Now Playing info
        let stepLabel = mode.stepLabel(for: step)
        NowPlayingInfoManager.update(
            title: item.sentence.english,
            artist: "\(item.word.word) - \(stepLabel)",
            album: item.word.meaning,
            playbackRate: 1.0
        )

        // Trigger prefetch on new item start (step 0)
        if step == 0 {
            prefetchUpcoming()
        }
    }

    private func handleSpeechFinished() {
        guard let manager = internalManager, manager.isPlaying else { return }

        // Capture generation for validation
        let generation = manager.playbackGeneration

        // Add delay before advancing (0.8 seconds)
        Task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            await MainActor.run {
                guard manager.isValidCompletion(generation: generation) else { return }
                manager.advance()
                syncStateFromManager()
            }
        }
    }

    private func handlePlaybackCompletion() {
        speechService.deactivateAudioSession()
        NowPlayingInfoManager.clear()
        syncStateFromManager()
    }

    private func syncStateFromManager() {
        guard let manager = internalManager else {
            isPlaying = false
            currentIndex = 0
            currentStep = 0
            return
        }

        isPlaying = manager.isPlaying
        currentIndex = manager.currentIndex
        currentStep = manager.currentStep

        // Sync queue if manager stopped
        if !manager.isPlaying && manager.items.isEmpty && !queue.isEmpty {
            // Manager was stopped - keep queue for resume capability
        }
    }

    // MARK: - Prefetching

    /// Prefetches audio for upcoming items in the queue.
    ///
    /// Strategy:
    /// - Bilingual mode (3 steps): prefetch N+1 only (longer playback time)
    /// - English-only mode (2 steps): prefetch N+1 and N+2 (shorter playback time)
    private func prefetchUpcoming() {
        Task {
            guard let nextItems = getNextItemsToPrefetch() else { return }

            let speakerID = settings.voicevoxStyle.rawValue
            var itemsToPrefetch: [(text: String, speakerID: Int)] = []

            for item in nextItems {
                // Prefetch English if using VOICEVOX for English
                if settings.englishVoiceGender == .zundamon {
                    itemsToPrefetch.append((item.sentence.english, Constants.englishSpeakerID))
                }

                // Prefetch Japanese if using VOICEVOX
                if settings.japaneseVoiceGender == .zundamon {
                    itemsToPrefetch.append((item.sentence.japanese, speakerID))
                }
            }

            await PrefetchService.shared.prefetchBatch(items: itemsToPrefetch)
        }
    }

    /// Returns the next items to prefetch based on playback mode.
    ///
    /// - Returns: Array of items to prefetch, or nil if at end of queue
    private func getNextItemsToPrefetch() -> [QueueItem]? {
        let nextIndex = currentIndex + 1
        guard nextIndex < queue.count else { return nil }

        // Bilingual (3 steps): N+1 only, English-only (2 steps): N+1 and N+2
        let maxLookahead = settings.playbackMode == .bilingual
            ? Constants.bilingualPrefetchLookahead
            : Constants.englishOnlyPrefetchLookahead
        let endIndex = min(nextIndex + maxLookahead, queue.count)

        return Array(queue[nextIndex..<endIndex])
    }
}
