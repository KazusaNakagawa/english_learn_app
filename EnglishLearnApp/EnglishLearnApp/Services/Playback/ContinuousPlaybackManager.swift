import Foundation
import Observation

/// Generic continuous playback manager that handles state and logic for playing through a sequence of items.
///
/// This manager consolidates the duplicated playback logic previously spread across
/// WordListView and SentenceListView. It handles:
/// - Playback state (playing/stopped, current index, current step)
/// - Generation-based cancellation to prevent race conditions
/// - Playback advancement through steps and items
///
/// **Thread Safety:** All methods must be called from the main thread.
///
/// Generic parameter T represents the item type being played (e.g., Sentence or (Word, Sentence)).
@Observable
final class ContinuousPlaybackManager<Item> {
    // MARK: - State

    /// Whether continuous playback is currently active.
    private(set) var isPlaying: Bool = false

    /// Current index in the items array.
    private(set) var currentIndex: Int = 0

    /// Current playback step within an item (0-based).
    /// For bilingual mode: 0=EN, 1=JA, 2=EN (3 steps)
    /// For English-only mode: 0=EN, 1=EN (2 steps)
    private(set) var currentStep: Int = 0

    /// Playback generation counter for invalidating stale async tasks.
    /// Incremented when starting/stopping playback to ensure old completion
    /// callbacks don't affect the new session.
    private(set) var playbackGeneration: Int = 0

    /// Expected generation value when speech started.
    /// Checked on speech completion to validate this is still the active session.
    private(set) var expectedGeneration: Int = 0

    // MARK: - Configuration

    /// Current playback mode determining step sequence.
    var playbackMode: SettingsManager.PlaybackMode

    /// Items to play through.
    private(set) var items: [Item] = []

    /// Callback invoked when speech should be performed for an item at a specific step.
    /// Parameters: (item, step)
    private let speechHandler: (Item, Int) -> Void

    /// Callback invoked when playback completes all items.
    private let completionHandler: () -> Void

    // MARK: - Initialization

    /// Creates a new continuous playback manager.
    ///
    /// - Parameters:
    ///   - playbackMode: The initial playback mode (bilingual or English-only)
    ///   - speechHandler: Closure called when speech should be performed for an item at a step
    ///   - completionHandler: Closure called when all items have been played
    init(
        playbackMode: SettingsManager.PlaybackMode,
        speechHandler: @escaping (Item, Int) -> Void,
        completionHandler: @escaping () -> Void = {}
    ) {
        self.playbackMode = playbackMode
        self.speechHandler = speechHandler
        self.completionHandler = completionHandler
    }

    // MARK: - Public Methods

    /// Starts continuous playback from the beginning or a specific index.
    ///
    /// This method increments the playback generation to invalidate any pending
    /// async tasks from previous sessions, preventing race conditions.
    ///
    /// - Parameters:
    ///   - items: Array of items to play
    ///   - startIndex: Index to start from (default: 0)
    func start(items: [Item], startIndex: Int = 0) {
        guard !items.isEmpty, startIndex >= 0, startIndex < items.count else { return }

        // Increment generation to invalidate pending tasks
        playbackGeneration += 1

        self.items = items
        currentIndex = startIndex
        currentStep = 0
        isPlaying = true
        expectedGeneration = playbackGeneration

        speechHandler(items[currentIndex], currentStep)
    }

    /// Stops continuous playback and clears state.
    ///
    /// Increments the generation counter to ensure any in-flight completion
    /// callbacks from the previous session are ignored.
    func stop() {
        playbackGeneration += 1
        isPlaying = false
        currentIndex = 0
        currentStep = 0
        items = []
    }

    /// Advances to the next playback step or item.
    ///
    /// Called after speech completion. Progresses through the playback cycle:
    /// - Bilingual: EN→JA→EN (3 steps per item)
    /// - English-only: EN→EN (2 steps per item)
    ///
    /// When all steps for an item complete, moves to the next item.
    /// When all items complete, stops playback and calls completion handler.
    func advance() {
        guard isPlaying else { return }

        let maxSteps = playbackMode.stepsPerItem
        let nextStep = currentStep + 1

        if nextStep < maxSteps {
            // More steps remain within the current item
            currentStep = nextStep
            expectedGeneration = playbackGeneration
            speechHandler(items[currentIndex], currentStep)
        } else {
            // Move to the next item
            let nextIndex = currentIndex + 1
            if nextIndex < items.count {
                currentIndex = nextIndex
                currentStep = 0
                expectedGeneration = playbackGeneration
                speechHandler(items[currentIndex], currentStep)
            } else {
                // All items done
                stop()
                completionHandler()
            }
        }
    }

    /// Skips to the next item, restarting from step 0.
    ///
    /// Increments the generation counter to invalidate any pending completion handlers.
    /// Returns false if already at the last item.
    @discardableResult
    func next() -> Bool {
        guard isPlaying, currentIndex + 1 < items.count else { return false }

        playbackGeneration += 1
        currentIndex += 1
        currentStep = 0
        expectedGeneration = playbackGeneration
        speechHandler(items[currentIndex], currentStep)

        return true
    }

    /// Skips to the previous item, restarting from step 0.
    ///
    /// Increments the generation counter to invalidate any pending completion handlers.
    /// Returns false if already at the first item.
    @discardableResult
    func previous() -> Bool {
        guard isPlaying, currentIndex > 0 else { return false }

        playbackGeneration += 1
        currentIndex -= 1
        currentStep = 0
        expectedGeneration = playbackGeneration
        speechHandler(items[currentIndex], currentStep)

        return true
    }

    /// Validates if a speech completion event is for the current playback session.
    ///
    /// This should be called when speech finishes to check if the completion
    /// is still valid (generation hasn't changed during speech).
    ///
    /// - Parameter generation: The generation value captured when speech started
    /// - Returns: true if the generation matches and playback is still active
    func isValidCompletion(generation: Int) -> Bool {
        return isPlaying && generation == playbackGeneration
    }

    /// Updates playback mode and restarts current item from step 0 if playing.
    ///
    /// - Parameter mode: The new playback mode
    func updatePlaybackMode(_ mode: SettingsManager.PlaybackMode) {
        self.playbackMode = mode

        if isPlaying {
            playbackGeneration += 1
            currentStep = 0
            expectedGeneration = playbackGeneration
            speechHandler(items[currentIndex], currentStep)
        }
    }
}
