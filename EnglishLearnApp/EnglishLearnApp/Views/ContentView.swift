import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var settings: SettingsManager
    @EnvironmentObject private var globalPlaybackManager: GlobalPlaybackManager
    @State private var selectedTab: Tab = .learn
    @State private var showingAddWordView = false

    var body: some View {
        ZStack {
            NavigationStack { WordListView() }
                .opacity(selectedTab == .learn ? 1 : 0)
                .allowsHitTesting(selectedTab == .learn)

            NavigationStack { ArchiveView() }
                .opacity(selectedTab == .archive ? 1 : 0)
                .allowsHitTesting(selectedTab == .archive)

            NavigationStack { TrashView() }
                .opacity(selectedTab == .trash ? 1 : 0)
                .allowsHitTesting(selectedTab == .trash)

            SettingsView()
                .opacity(selectedTab == .settings ? 1 : 0)
                .allowsHitTesting(selectedTab == .settings)
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 0) {
                if !globalPlaybackManager.queue.isEmpty {
                    MiniPlayerView()
                }
                TabBar(selected: $selectedTab, presentingAdd: $showingAddWordView)
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
        .environmentObject(GlobalPlaybackManager(speechService: .shared, settings: .shared))
}
