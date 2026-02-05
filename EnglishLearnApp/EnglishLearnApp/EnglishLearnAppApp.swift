import SwiftUI

@main
struct EnglishLearnAppApp: App {
    @StateObject private var settingsManager = SettingsManager.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(settingsManager)
        }
    }
}
