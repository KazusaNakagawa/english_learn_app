import Foundation

/// Application-level configuration constants.
///
/// Set VOICEVOX_BASE_URL to your deployed API Gateway endpoint.
/// This file should be listed in .gitignore and not committed with real values.
enum AppConfig {
    /// Base URL for the VOICEVOX engine API.
    /// Replace with your actual API Gateway endpoint after deploying the CDK stack.
    /// Example: "https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com"
    static let voicevoxBaseURL = ProcessInfo.processInfo.environment["VOICEVOX_BASE_URL"]
        ?? Bundle.main.object(forInfoDictionaryKey: "VOICEVOX_BASE_URL") as? String
        ?? ""
}
