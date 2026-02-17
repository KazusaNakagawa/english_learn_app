import SwiftUI

@main
struct EnglishLearnAppApp: App {
    @StateObject private var settingsManager = SettingsManager.shared
    @AppStorage("hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some Scene {
        WindowGroup {
            if hasCompletedOnboarding {
                ContentView()
                    .environmentObject(settingsManager)
            } else {
                OnboardingView(hasCompletedOnboarding: $hasCompletedOnboarding)
                    .environmentObject(settingsManager)
            }
        }
    }
}
