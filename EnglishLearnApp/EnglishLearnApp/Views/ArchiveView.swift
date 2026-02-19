import SwiftUI

struct ArchiveView: View {
    @ObservedObject private var dataManager = WordDataManager.shared

    @State private var selection = SelectionState()

    var body: some View {
        Group {
            if dataManager.archivedWords.isEmpty {
                EmptyListView(
                    systemImage: "archivebox",
                    title: "アーカイブは空です",
                    message: "習得済みの単語をアーカイブに移動できます"
                )
            } else {
                List {
                    ForEach(dataManager.archivedWords) { word in
                        if selection.isSelecting {
                            Button {
                                selection.toggle(word.id)
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: selection.selectedIDs.contains(word.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(selection.selectedIDs.contains(word.id) ? .accentColor : .secondary)
                                        .font(.title2)
                                    wordRow(word)
                                }
                            }
                            .buttonStyle(.plain)
                        } else {
                            wordRow(word)
                                .swipeActions(edge: .leading) {
                                    Button {
                                        WordDataManager.shared.unarchive(wordId: word.id)
                                    } label: {
                                        Label("元に戻す", systemImage: "arrow.uturn.backward")
                                    }
                                    .tint(.green)
                                }
                        }
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if selection.isSelecting {
                        archiveActionBar
                    }
                }
            }
        }
        .navigationTitle("アーカイブ")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if selection.isSelecting {
                    let allSelected = !dataManager.archivedWords.isEmpty && dataManager.archivedWords.allSatisfy { selection.selectedIDs.contains($0.id) }
                    Button(allSelected ? "すべて解除" : "すべて選択") {
                        selection.selectedIDs = allSelected ? [] : Set(dataManager.archivedWords.map(\.id))
                    }
                } else if !dataManager.archivedWords.isEmpty {
                    Button("選択") { selection.isSelecting = true }
                }
            }
            ToolbarItem(placement: .navigationBarLeading) {
                if selection.isSelecting {
                    Button("キャンセル") { selection.exitSelectionMode() }
                }
            }
        }
    }

    /// Renders a single word row with word text, phonetic, meaning, and archive date.
    private func wordRow(_ word: Word) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(word.word)
                .font(.headline)
            Text(word.phonetic)
                .font(.subheadline)
                .foregroundColor(.secondary)
            Text(word.meaning)
                .font(.subheadline)
                .foregroundColor(.blue)
            if let archivedAt = word.archivedAt {
                Text("アーカイブ日: \(archivedAt.formatted(date: .abbreviated, time: .omitted))")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    /// Bottom action bar shown during selection mode with an Unarchive action.
    private var archiveActionBar: some View {
        Button {
            WordDataManager.shared.unarchive(wordIds: Array(selection.selectedIDs))
            selection.exitSelectionMode()
        } label: {
            Label("元に戻す", systemImage: "arrow.uturn.backward")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
        }
        .buttonStyle(.borderless)
        .tint(.green)
        .disabled(selection.selectedIDs.isEmpty)
        .background(.regularMaterial)
        .overlay(alignment: .top) { Divider() }
    }

}

#Preview {
    NavigationStack {
        ArchiveView()
    }
}
