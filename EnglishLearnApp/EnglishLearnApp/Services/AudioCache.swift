import Foundation
import CryptoKit

/// A two-tier cache (memory + disk) for VOICEVOX audio data.
///
/// Memory cache provides fast access for recently played audio.
/// Disk cache persists audio across app sessions, reducing API calls.
actor AudioCache {
    // MARK: - Shared Instance

    static let shared = AudioCache()

    // MARK: - Constants

    private enum Constants {
        static let maxMemoryCacheCount = 50
        static let maxDiskCacheSizeBytes: UInt64 = 50 * 1024 * 1024  // 50MB
        static let cacheDirectoryName = "VoicevoxAudioCache"
    }

    // MARK: - Properties

    private let memoryCache = NSCache<NSString, NSData>()
    private let fileManager = FileManager.default
    private let cacheDirectory: URL

    // MARK: - Initialization

    private init() {
        // Configure memory cache
        memoryCache.countLimit = Constants.maxMemoryCacheCount

        // Set up disk cache directory
        let cachesDirectory = fileManager.urls(for: .cachesDirectory, in: .userDomainMask).first!
        cacheDirectory = cachesDirectory.appendingPathComponent(Constants.cacheDirectoryName)

        // Create directory if needed
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    // MARK: - Public Methods

    /// Retrieves cached audio data for the given text and speaker.
    /// - Parameters:
    ///   - text: The text that was synthesized
    ///   - speakerID: The VOICEVOX speaker ID
    /// - Returns: Cached audio data if available, nil otherwise
    func get(text: String, speakerID: Int) -> Data? {
        let key = cacheKey(text: text, speakerID: speakerID)

        // Check memory cache first
        if let data = memoryCache.object(forKey: key as NSString) {
            return data as Data
        }

        // Fall back to disk cache
        let fileURL = cacheDirectory.appendingPathComponent(key)
        guard let data = try? Data(contentsOf: fileURL) else {
            return nil
        }

        // Promote to memory cache
        memoryCache.setObject(data as NSData, forKey: key as NSString)

        // Update access time for LRU
        try? fileManager.setAttributes(
            [.modificationDate: Date()],
            ofItemAtPath: fileURL.path
        )

        return data
    }

    /// Stores audio data in both memory and disk cache.
    /// - Parameters:
    ///   - data: The audio data to cache
    ///   - text: The text that was synthesized
    ///   - speakerID: The VOICEVOX speaker ID
    func set(_ data: Data, text: String, speakerID: Int) {
        let key = cacheKey(text: text, speakerID: speakerID)

        // Store in memory cache
        memoryCache.setObject(data as NSData, forKey: key as NSString)

        // Store on disk
        let fileURL = cacheDirectory.appendingPathComponent(key)
        try? data.write(to: fileURL, options: .atomic)

        // Enforce disk cache size limit
        enforceDiskCacheLimit()
    }

    /// Removes a specific cache entry from both memory and disk.
    ///
    /// Use this to evict potentially corrupt cache entries when playback fails.
    ///
    /// - Parameters:
    ///   - text: The text that was synthesized
    ///   - speakerID: The VOICEVOX speaker ID
    func evict(text: String, speakerID: Int) {
        let key = cacheKey(text: text, speakerID: speakerID)
        memoryCache.removeObject(forKey: key as NSString)
        let fileURL = cacheDirectory.appendingPathComponent(key)
        try? fileManager.removeItem(at: fileURL)
    }

    /// Clears all cached audio data from both memory and disk.
    func clearAll() {
        memoryCache.removeAllObjects()
        try? fileManager.removeItem(at: cacheDirectory)
        try? fileManager.createDirectory(at: cacheDirectory, withIntermediateDirectories: true)
    }

    /// Returns the current disk cache size in bytes.
    func diskCacheSize() -> UInt64 {
        guard let files = try? fileManager.contentsOfDirectory(
            at: cacheDirectory,
            includingPropertiesForKeys: [.fileSizeKey]
        ) else {
            return 0
        }

        return files.reduce(0) { total, url in
            let size = (try? url.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            return total + UInt64(size)
        }
    }

    // MARK: - Public Utility Methods

    /// Generates a cache key from text and speaker ID using SHA256.
    ///
    /// Exposed publicly to allow PrefetchService to track tasks by cache key
    /// without duplicating the hashing logic.
    ///
    /// - Parameters:
    ///   - text: The text that will be synthesized
    ///   - speakerID: The VOICEVOX speaker ID
    /// - Returns: A SHA256 hash-based cache key with .wav extension
    func cacheKey(text: String, speakerID: Int) -> String {
        let input = "\(text)-\(speakerID)"
        let hash = SHA256.hash(data: Data(input.utf8))
        return hash.compactMap { String(format: "%02x", $0) }.joined() + ".wav"
    }

    // MARK: - Private Methods

    /// Removes oldest files when disk cache exceeds size limit (LRU eviction).
    private func enforceDiskCacheLimit() {
        guard diskCacheSize() > Constants.maxDiskCacheSizeBytes else { return }

        guard let files = try? fileManager.contentsOfDirectory(
            at: cacheDirectory,
            includingPropertiesForKeys: [.contentModificationDateKey, .fileSizeKey]
        ) else {
            return
        }

        // Sort by modification date (oldest first)
        let sortedFiles = files.sorted { url1, url2 in
            let date1 = (try? url1.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            let date2 = (try? url2.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast
            return date1 < date2
        }

        // Remove oldest files until under limit
        var currentSize = diskCacheSize()
        for fileURL in sortedFiles {
            guard currentSize > Constants.maxDiskCacheSizeBytes else { break }

            let fileSize = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0
            try? fileManager.removeItem(at: fileURL)
            currentSize -= UInt64(fileSize)
        }
    }
}
