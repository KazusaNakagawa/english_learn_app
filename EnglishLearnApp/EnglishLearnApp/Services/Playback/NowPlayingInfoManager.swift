import MediaPlayer

/// Manages Now Playing info displayed on lock screen and Control Center.
///
/// This manager provides a centralized, thread-safe interface for updating
/// the media metadata shown to users on the lock screen, Control Center,
/// and external devices like CarPlay.
enum NowPlayingInfoManager {
    /// Updates Now Playing info with the provided metadata.
    ///
    /// Sets the metadata displayed on lock screen and Control Center:
    /// - Title: Main text (usually the sentence being played)
    /// - Artist: Secondary text (word + step label)
    /// - Album: Additional context (word meaning)
    /// - Playback rate: 1.0 for playing, 0.0 for paused
    ///
    /// Thread-safe: Can be called from any thread.
    ///
    /// - Parameters:
    ///   - title: The main title (e.g., English sentence)
    ///   - artist: The artist/subtitle (e.g., "word - step")
    ///   - album: The album title (e.g., word meaning)
    ///   - playbackRate: 1.0 for playing, 0.0 for paused
    static func update(
        title: String,
        artist: String,
        album: String,
        playbackRate: Double = 1.0
    ) {
        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPMediaItemPropertyTitle] = title
        nowPlayingInfo[MPMediaItemPropertyArtist] = artist
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = album
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = playbackRate
        nowPlayingInfo[MPNowPlayingInfoPropertyMediaType] = MPNowPlayingInfoMediaType.audio.rawValue

        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }

    /// Clears all Now Playing info.
    ///
    /// Should be called when playback stops to remove stale metadata
    /// from lock screen and Control Center.
    ///
    /// Thread-safe: Can be called from any thread.
    static func clear() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
}
