import MediaPlayer

/// Manages remote command center handlers for lock screen and Control Center playback controls.
///
/// This manager centralizes the setup and teardown of remote command handlers,
/// preventing duplicate registrations and ensuring proper cleanup.
/// Remote commands allow users to control playback from:
/// - Lock screen
/// - Control Center
/// - External devices (AirPods, CarPlay, etc.)
final class RemoteCommandCenterManager {
    // MARK: - Types

    typealias CommandHandler = () -> Void

    // MARK: - Properties

    private var playCommandToken: Any?
    private var pauseCommandToken: Any?
    private var nextCommandToken: Any?
    private var previousCommandToken: Any?

    private let commandCenter: MPRemoteCommandCenter

    // MARK: - Initialization

    /// Creates a new remote command center manager.
    ///
    /// - Parameter commandCenter: The remote command center to manage (default: shared)
    init(commandCenter: MPRemoteCommandCenter = .shared()) {
        self.commandCenter = commandCenter
    }

    // MARK: - Setup

    /// Sets up remote command handlers with the provided closures.
    ///
    /// This method is idempotent - calling it multiple times will remove old handlers
    /// before adding new ones, preventing duplicate registrations.
    ///
    /// All handlers are dispatched to the main queue automatically to ensure
    /// thread-safe UI updates.
    ///
    /// - Parameters:
    ///   - onPlay: Closure to call when play command is triggered
    ///   - onPause: Closure to call when pause command is triggered
    ///   - onNext: Closure to call when next track command is triggered
    ///   - onPrevious: Closure to call when previous track command is triggered
    func setup(
        onPlay: @escaping CommandHandler,
        onPause: @escaping CommandHandler,
        onNext: @escaping CommandHandler,
        onPrevious: @escaping CommandHandler
    ) {
        // Remove existing handlers first to prevent duplicates
        cleanup()

        // Play command
        playCommandToken = commandCenter.playCommand.addTarget { [weak self] _ in
            guard self != nil else { return .commandFailed }
            DispatchQueue.main.async {
                onPlay()
            }
            return .success
        }

        // Pause command
        pauseCommandToken = commandCenter.pauseCommand.addTarget { [weak self] _ in
            guard self != nil else { return .commandFailed }
            DispatchQueue.main.async {
                onPause()
            }
            return .success
        }

        // Next track command
        nextCommandToken = commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            guard self != nil else { return .commandFailed }
            DispatchQueue.main.async {
                onNext()
            }
            return .success
        }

        // Previous track command
        previousCommandToken = commandCenter.previousTrackCommand.addTarget { [weak self] _ in
            guard self != nil else { return .commandFailed }
            DispatchQueue.main.async {
                onPrevious()
            }
            return .success
        }
    }

    /// Removes all remote command handlers and clears tokens.
    ///
    /// Safe to call multiple times. Should be called when the view disappears
    /// to prevent leaked handlers.
    func cleanup() {
        if let token = playCommandToken {
            commandCenter.playCommand.removeTarget(token)
            playCommandToken = nil
        }
        if let token = pauseCommandToken {
            commandCenter.pauseCommand.removeTarget(token)
            pauseCommandToken = nil
        }
        if let token = nextCommandToken {
            commandCenter.nextTrackCommand.removeTarget(token)
            nextCommandToken = nil
        }
        if let token = previousCommandToken {
            commandCenter.previousTrackCommand.removeTarget(token)
            previousCommandToken = nil
        }
    }

    // MARK: - Deinitialization

    deinit {
        cleanup()
    }
}
