import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: SettingsManager
    @State private var selectedTab = 0
    @State private var showingAddWordView = false

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                WordListView()
            }
            .tabItem {
                Label("学習", systemImage: "books.vertical")
            }
            .tag(0)

            NavigationStack {
                ArchiveView()
            }
            .tabItem {
                Label("アーカイブ", systemImage: "archivebox")
            }
            .tag(1)

            Color.clear
                .tabItem {
                    Label("追加", systemImage: "plus.circle.fill")
                }
                .tag(2)

            NavigationStack {
                TrashView()
            }
            .tabItem {
                Label("ゴミ箱", systemImage: "trash")
            }
            .tag(3)

            SettingsView()
                .tabItem {
                    Label("設定", systemImage: "gear")
                }
                .tag(4)
        }
        .onChange(of: selectedTab) { oldValue, newValue in
            if newValue == 2 {
                showingAddWordView = true
                selectedTab = oldValue
            }
        }
        .sheet(isPresented: $showingAddWordView) {
            AddWordView { newWord in
                WordDataManager.shared.addWord(newWord)
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(SettingsManager.shared)
}
