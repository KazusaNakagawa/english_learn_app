import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: SettingsManager

    var body: some View {
        TabView {
            NavigationStack {
                WordListView()
            }
            .tabItem {
                Label("学習", systemImage: "books.vertical")
            }

            SettingsView()
                .tabItem {
                    Label("設定", systemImage: "gear")
                }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(SettingsManager.shared)
}
