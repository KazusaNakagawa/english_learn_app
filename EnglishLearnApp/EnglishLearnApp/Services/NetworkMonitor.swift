import Foundation
import Network

/// Actor-based wrapper around NWPathMonitor to track network connectivity status.
///
/// Provides async access to network conditions for making smart prefetch decisions.
/// - Tracks connection status (connected/disconnected)
/// - Identifies cellular vs WiFi connections
actor NetworkMonitor {
    // MARK: - Shared Instance

    static let shared = NetworkMonitor()

    // MARK: - Properties

    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue(label: "com.englishlearnapp.networkmonitor")

    private(set) var isConnected = false
    private(set) var isCellular = false

    // MARK: - Initialization

    private init() {
        monitor.pathUpdateHandler = { [weak self] path in
            Task { [weak self] in
                await self?.updateStatus(path)
            }
        }
        monitor.start(queue: queue)
    }

    // MARK: - Private Methods

    /// Updates the connection status based on the network path.
    private func updateStatus(_ path: NWPath) {
        isConnected = path.status == .satisfied
        isCellular = path.usesInterfaceType(.cellular)
    }

    // MARK: - Public Methods

    /// Checks if network conditions are suitable for prefetching.
    /// - Returns: true if connected and not on a poor connection
    func isSuitableForPrefetch() -> Bool {
        // For now, prefetch on any connected network
        // Could add cellular restrictions if needed: !isCellular
        return isConnected
    }

    /// Stops monitoring network status. Call when no longer needed.
    func stopMonitoring() {
        monitor.cancel()
    }
}
