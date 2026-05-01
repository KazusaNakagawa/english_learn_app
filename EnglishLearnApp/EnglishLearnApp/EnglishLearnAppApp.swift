import SwiftUI

@main
struct EnglishLearnAppApp: App {
    @StateObject private var settingsManager = SettingsManager.shared
    @StateObject private var wordDataManager = WordDataManager.shared
    @StateObject private var globalPlaybackManager = GlobalPlaybackManager(
        speechService: .shared,
        settings: .shared
    )
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some Scene {
        WindowGroup {
            if hasCompletedOnboarding {
                ContentView()
                    .environmentObject(settingsManager)
                    .environmentObject(wordDataManager)
                    .environmentObject(globalPlaybackManager)
            } else {
                OnboardingView(hasCompletedOnboarding: $hasCompletedOnboarding)
                    .environmentObject(settingsManager)
                    .environmentObject(wordDataManager)
                    .environmentObject(globalPlaybackManager)
            }
        }
    }
}
