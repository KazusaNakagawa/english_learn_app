import SwiftUI

struct ArchiveView: View {
    @State private var archivedWords: [Word] = []

    // MARK: Selection mode
    @State private var isSelecting = false
    @State private var selectedIDs: Set<UUID> = []

    var body: some View {
        Group {
            if archivedWords.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "archivebox")
                        .font(.system(size: 60))
                        .foregroundColor(.secondary)
                    Text("アーカイブは空です")
                        .font(.title2)
                        .foregroundColor(.secondary)
                    Text("習得済みの単語をアーカイブに移動できます")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(archivedWords) { word in
                        if isSelecting {
                            Button {
                                toggleSelection(word.id)
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: selectedIDs.contains(word.id) ? "checkmark.circle.fill" : "circle")
                                        .foregroundColor(selectedIDs.contains(word.id) ? .accentColor : .secondary)
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
                                        load()
                                    } label: {
                                        Label("元に戻す", systemImage: "arrow.uturn.backward")
                                    }
                                    .tint(.green)
                                }
                        }
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if isSelecting {
                        archiveActionBar
                    }
                }
            }
        }
        .navigationTitle("アーカイブ")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if isSelecting {
                    let allSelected = !archivedWords.isEmpty && archivedWords.allSatisfy { selectedIDs.contains($0.id) }
                    Button(allSelected ? "すべて解除" : "すべて選択") {
                        selectedIDs = allSelected ? [] : Set(archivedWords.map(\.id))
                    }
                } else if !archivedWords.isEmpty {
                    Button("選択") { isSelecting = true }
                }
            }
            ToolbarItem(placement: .navigationBarLeading) {
                if isSelecting {
                    Button("キャンセル") { exitSelectionMode() }
                }
            }
        }
        .onAppear { load() }
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
            WordDataManager.shared.unarchive(wordIds: Array(selectedIDs))
            load()
            exitSelectionMode()
        } label: {
            Label("元に戻す", systemImage: "arrow.uturn.backward")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
        }
        .buttonStyle(.borderless)
        .tint(.green)
        .disabled(selectedIDs.isEmpty)
        .background(.regularMaterial)
        .overlay(alignment: .top) { Divider() }
    }

    /// Toggles the selection state of a word by its ID.
    private func toggleSelection(_ id: UUID) {
        if selectedIDs.contains(id) { selectedIDs.remove(id) } else { selectedIDs.insert(id) }
    }

    /// Exits selection mode and clears all selected IDs.
    private func exitSelectionMode() {
        isSelecting = false
        selectedIDs = []
    }

    /// Loads archived words from the data manager.
    private func load() {
        archivedWords = WordDataManager.shared.loadArchivedWords()
    }
}

#Preview {
    NavigationStack {
        ArchiveView()
    }
}
