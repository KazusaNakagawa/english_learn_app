import Foundation
import CryptoKit
#if canImport(UIKit)
import UIKit
#endif

/// Actor-based service for background audio prefetching.
///
/// Proactively fetches and caches VOICEVOX audio to reduce perceived latency during playback.
/// Features:
/// - Background priority execution (low system impact)
/// - Network condition checking (skip on poor connectivity)
/// - Concurrent prefetch limiting (max 3 simultaneous)
/// - Duplicate fetch prevention
/// - Memory pressure handling
/// - Task cancellation support
actor PrefetchService {
    // MARK: - Shared Instance

    static let shared = PrefetchService()

    // MARK: - Constants

    private enum Constants {
        /// Maximum number of concurrent prefetch operations to avoid overwhelming the API
        static let maxConcurrentPrefetch = 3

        /// Delay between batch prefetch requests in nanoseconds (100ms)
        /// Staggers requests to respect API rate limits
        static let batchStaggerDelay: UInt64 = 100_000_000

        /// Enable debug logging for prefetch operations (DEBUG builds only)
        #if DEBUG
        static let enableDebugLogging = true
        #else
        static let enableDebugLogging = false
        #endif
    }

    // MARK: - Debug Logging

    private func log(_ message: String) {
        guard Constants.enableDebugLogging else { return }
        print("[PrefetchService] \(message)")
    }

    // MARK: - Properties

    /// Tracks active prefetch tasks by cache key for cancellation and duplicate prevention
    private var activeTasks: [String: Task<Void, Never>] = [:]

    /// Pending prefetch requests waiting for an available slot
    private var pendingQueue: [(text: String, speakerID: Int, cacheKey: String)] = []

    /// Tracks all scheduled cache keys (active + queued) to prevent duplicates
    private var scheduledKeys: Set<String> = []

    /// Memory warning observer token (nonisolated for simpler lifecycle management)
    private nonisolated(unsafe) var memoryWarningObserver: NSObjectProtocol?

    // MARK: - Initialization

    private init() {
        setupMemoryWarningObserver()
    }

    // MARK: - Public API

    /// Prefetches audio for a single text/speaker combination.
    ///
    /// - Parameters:
    ///   - text: The text to synthesize
    ///   - speakerID: The VOICEVOX speaker ID
    ///
    /// Returns early if:
    /// - Audio is already cached
    /// - A prefetch for this text/speaker is already in progress
    /// - Network conditions are unsuitable
    func prefetch(text: String, speakerID: Int) async {
        let cacheKey = await AudioCache.shared.cacheKey(text: text, speakerID: speakerID)

        // Early return if already scheduled (active or queued)
        guard !scheduledKeys.contains(cacheKey) else {
            log("Already scheduled '\(text.prefix(30))...' (speaker: \(speakerID))")
            return
        }

        // Early return if already cached
        if await AudioCache.shared.get(text: text, speakerID: speakerID) != nil {
            log("Cache hit for '\(text.prefix(30))...' (speaker: \(speakerID))")
            return
        }

        // Reserve this key immediately to prevent duplicates
        scheduledKeys.insert(cacheKey)

        // Check network conditions
        guard await NetworkMonitor.shared.isSuitableForPrefetch() else {
            log("Network unsuitable for prefetch")
            scheduledKeys.remove(cacheKey)
            return
        }

        // Check concurrent prefetch limit - queue if at capacity
        if activeTasks.count >= Constants.maxConcurrentPrefetch {
            log("Max concurrent prefetch limit reached (\(Constants.maxConcurrentPrefetch)), queueing request")
            pendingQueue.append((text, speakerID, cacheKey))
            return
        }

        log("Starting prefetch for '\(text.prefix(30))...' (speaker: \(speakerID))")
        startPrefetchTask(text: text, speakerID: speakerID, cacheKey: cacheKey)
    }

    /// Prefetches a batch of audio items with staggered starts.
    ///
    /// - Parameters:
    ///   - items: Array of (text, speakerID) tuples to prefetch
    ///   - maxItems: Maximum number of items to prefetch (default: all)
    func prefetchBatch(items: [(text: String, speakerID: Int)], maxItems: Int = .max) async {
        let itemsToPrefetch = items.prefix(maxItems)

        for item in itemsToPrefetch {
            // Check for cancellation before each iteration
            guard !Task.isCancelled else {
                log("Batch prefetch cancelled")
                return
            }

            await prefetch(text: item.text, speakerID: item.speakerID)

            // Stagger requests to avoid overwhelming the API
            // Propagate cancellation by using try/await instead of try?
            do {
                try await Task.sleep(nanoseconds: Constants.batchStaggerDelay)
            } catch {
                // CancellationError - stop batch processing
                log("Batch prefetch interrupted during sleep")
                return
            }
        }
    }

    /// Cancels a specific prefetch task.
    ///
    /// - Parameters:
    ///   - text: The text being prefetched
    ///   - speakerID: The speaker ID being prefetched
    func cancel(text: String, speakerID: Int) async {
        let cacheKey = await AudioCache.shared.cacheKey(text: text, speakerID: speakerID)

        // Remove from pending queue if queued
        if pendingQueue.contains(where: { $0.cacheKey == cacheKey }) {
            pendingQueue.removeAll { $0.cacheKey == cacheKey }
            scheduledKeys.remove(cacheKey)
        }

        // Cancel active task if running (removal happens in removeTask when task completes)
        activeTasks[cacheKey]?.cancel()
    }

    /// Cancels all active prefetch tasks and clears the pending queue.
    func cancelAll() {
        let activeCount = activeTasks.count
        let pendingCount = pendingQueue.count
        if activeCount > 0 || pendingCount > 0 {
            log("Cancelling \(activeCount) active and \(pendingCount) pending prefetch tasks")
        }

        // Clear pending queue and their scheduled keys
        for pending in pendingQueue {
            scheduledKeys.remove(pending.cacheKey)
        }
        pendingQueue.removeAll()

        // Cancel all active tasks (cleanup happens in removeTask when each completes)
        for task in activeTasks.values {
            task.cancel()
        }
    }

    // MARK: - Private Methods

    /// Performs the actual prefetch operation.
    private func performPrefetch(text: String, speakerID: Int, cacheKey: String) async {
        defer {
            // Always clean up task tracking
            Task { [weak self] in
                await self?.removeTask(cacheKey: cacheKey)
            }
        }

        // Check cancellation before expensive operation
        guard !Task.isCancelled else { return }

        // Fetch audio from VOICEVOX API
        guard let audioData = await fetchVoicevoxAudio(text: text, speakerID: speakerID) else {
            log("Prefetch failed for '\(text.prefix(30))...' (speaker: \(speakerID))")
            return
        }

        // Check cancellation before cache write
        guard !Task.isCancelled else {
            log("Prefetch cancelled before cache write for '\(text.prefix(30))...'")
            return
        }

        // Cache the audio data (idempotent operation)
        await AudioCache.shared.set(audioData, text: text, speakerID: speakerID)
        log("Prefetch completed for '\(text.prefix(30))...' (speaker: \(speakerID))")
    }

    /// Fetches audio data from VOICEVOX API using the two-step process.
    ///
    /// Step 1: POST /audio_query to generate query parameters
    /// Step 2: POST /synthesis to synthesize audio from the query
    ///
    /// - Parameters:
    ///   - text: The text to synthesize
    ///   - speakerID: The VOICEVOX speaker ID
    /// - Returns: Audio data on success, nil on failure
    private func fetchVoicevoxAudio(text: String, speakerID: Int) async -> Data? {
        let baseURL = AppConfig.voicevoxBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard !baseURL.isEmpty else { return nil }
        guard !AppConfig.voicevoxApiKey.isEmpty else {
            return nil
        }

        // Build URLs using URLComponents for safe parameter encoding
        guard let baseURLObj = URL(string: baseURL) else { return nil }

        // Build audio_query URL
        var queryComponents = URLComponents(url: baseURLObj.appendingPathComponent("audio_query"), resolvingAgainstBaseURL: false)
        queryComponents?.queryItems = [
            URLQueryItem(name: "text", value: text),
            URLQueryItem(name: "speaker", value: String(speakerID))
        ]
        guard let queryURL = queryComponents?.url else { return nil }

        // Build synthesis URL
        var synthComponents = URLComponents(url: baseURLObj.appendingPathComponent("synthesis"), resolvingAgainstBaseURL: false)
        synthComponents?.queryItems = [
            URLQueryItem(name: "speaker", value: String(speakerID))
        ]
        guard let synthURL = synthComponents?.url else { return nil }

        do {
            // Step 1: Generate audio query
            let (queryData, queryResponse) = try await performPOSTRequest(to: queryURL)
            guard isSuccessfulResponse(queryResponse) else {
                return nil
            }

            // Check cancellation between API calls
            guard !Task.isCancelled else { return nil }

            // Step 2: Synthesize audio from query
            let (audioData, synthResponse) = try await performPOSTRequest(
                to: synthURL,
                body: queryData,
                contentType: "application/json"
            )
            guard isSuccessfulResponse(synthResponse) else {
                return nil
            }

            guard !audioData.isEmpty else {
                return nil
            }

            return audioData
        } catch {
            // Silent failure - active playback will retry if needed
            return nil
        }
    }

    /// Performs a POST request with API key authentication.
    private func performPOSTRequest(to url: URL, body: Data? = nil, contentType: String? = nil) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        if let contentType {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        request.setValue(AppConfig.voicevoxApiKey, forHTTPHeaderField: "x-api-key")
        request.httpBody = body
        return try await URLSession.shared.data(for: request)
    }

    /// Validates an HTTP response for successful status code.
    private func isSuccessfulResponse(_ response: URLResponse?) -> Bool {
        guard let httpResponse = response as? HTTPURLResponse else { return false }
        return (200...299).contains(httpResponse.statusCode)
    }

    /// Starts a prefetch task and registers it in activeTasks.
    private func startPrefetchTask(text: String, speakerID: Int, cacheKey: String) {
        // Create background prefetch task
        // Use child Task (not Task.detached) to allow cancellation propagation
        let task: Task<Void, Never> = Task(priority: .background) { [weak self] in
            await self?.performPrefetch(text: text, speakerID: speakerID, cacheKey: cacheKey)
        }

        activeTasks[cacheKey] = task
    }

    /// Removes a task from the active task tracking and starts next queued task.
    private func removeTask(cacheKey: String) {
        activeTasks.removeValue(forKey: cacheKey)
        scheduledKeys.remove(cacheKey)

        // Start next queued task if available
        if !pendingQueue.isEmpty {
            let next = pendingQueue.removeFirst()
            log("Starting queued prefetch for '\(next.text.prefix(30))...' (speaker: \(next.speakerID))")
            startPrefetchTask(text: next.text, speakerID: next.speakerID, cacheKey: next.cacheKey)
        }
    }

    /// Sets up observer for memory warning notifications.
    private nonisolated func setupMemoryWarningObserver() {
        memoryWarningObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { [weak self] in
                await self?.cancelAll()
            }
        }
    }

    nonisolated deinit {
        if let observer = memoryWarningObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }
}
