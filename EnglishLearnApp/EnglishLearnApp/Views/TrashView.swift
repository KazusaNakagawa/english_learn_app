import SwiftUI

struct TrashView: View {
    @ObservedObject private var dataManager = WordDataManager.shared
    @State private var wordToDelete: Word? = nil
    @State private var showingDeleteConfirm = false

    @State private var selection = SelectionState()
    @State private var showingBatchDeleteConfirm = false

    var body: some View {
        Group {
            if dataManager.trashedWords.isEmpty {
                EmptyListView(
                    systemImage: "trash",
                    title: "ゴミ箱は空です",
                    message: "削除した単語は10日間ここに保管されます"
                )
            } else {
                List {
                    ForEach(dataManager.trashedWords) { word in
                        if selection.isSelecting {
                            SelectableListRow(id: word.id, selection: selection) {
                                wordRow(word)
                            }
                        } else {
                            wordRow(word)
                                .swipeActions(edge: .leading) {
                                    Button {
                                        WordDataManager.shared.restoreFromTrash(wordId: word.id)
                                    } label: {
                                        Label("元に戻す", systemImage: "arrow.uturn.backward")
                                    }
                                    .tint(.green)
                                }
                                .swipeActions(edge: .trailing) {
                                    Button(role: .destructive) {
                                        wordToDelete = word
                                        showingDeleteConfirm = true
                                    } label: {
                                        Label("完全削除", systemImage: "trash.fill")
                                    }
                                }
                        }
                    }
                }
                .safeAreaInset(edge: .bottom) {
                    if selection.isSelecting {
                        trashActionBar
                    }
                }
            }
        }
        .navigationTitle("ゴミ箱")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if selection.isSelecting {
                    let allSelected = !dataManager.trashedWords.isEmpty && dataManager.trashedWords.allSatisfy { selection.selectedIDs.contains($0.id) }
                    Button(allSelected ? "すべて解除" : "すべて選択") {
                        selection.selectedIDs = allSelected ? [] : Set(dataManager.trashedWords.map(\.id))
                    }
                } else if !dataManager.trashedWords.isEmpty {
                    Button("選択") { selection.isSelecting = true }
                }
            }
            ToolbarItem(placement: .navigationBarLeading) {
                if selection.isSelecting {
                    Button("キャンセル") { selection.exitSelectionMode() }
                }
            }
        }
        .confirmationDialog(
            "完全削除しますか？",
            isPresented: $showingDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("完全削除", role: .destructive) {
                if let word = wordToDelete {
                    WordDataManager.shared.permanentlyDelete(wordId: word.id)
                }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("この操作は取り消せません。")
        }
        .confirmationDialog(
            "\(selection.selectedIDs.count)件を完全削除しますか？",
            isPresented: $showingBatchDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("完全削除", role: .destructive) {
                WordDataManager.shared.permanentlyDelete(wordIds: Array(selection.selectedIDs))
                selection.exitSelectionMode()
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("この操作は取り消せません。")
        }
    }

    /// Renders a single word row with word text, meaning, and remaining days before deletion.
    private func wordRow(_ word: Word) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(word.word)
                .font(.headline)
            Text(word.meaning)
                .font(.subheadline)
                .foregroundColor(.secondary)
            if let deletedAt = word.deletedAt {
                Text(remainingDaysText(from: deletedAt))
                    .font(.caption)
                    .foregroundColor(.red)
            }
        }
        .padding(.vertical, 4)
    }

    /// Bottom action bar shown during selection mode with Restore and Permanent Delete actions.
    private var trashActionBar: some View {
        ActionBar {
            HStack(spacing: 0) {
                ActionBarButton(
                    "元に戻す",
                    systemImage: "arrow.uturn.backward",
                    isDisabled: selection.selectedIDs.isEmpty
                ) {
                    WordDataManager.shared.restoreFromTrash(wordIds: Array(selection.selectedIDs))
                    selection.exitSelectionMode()
                }
                .tint(.green)

                Divider().frame(height: 44)

                ActionBarButton(
                    "完全削除",
                    systemImage: "trash.fill",
                    role: .destructive,
                    isDisabled: selection.selectedIDs.isEmpty
                ) {
                    showingBatchDeleteConfirm = true
                }
            }
        }
    }

    /// Returns a localized string describing how many days remain before permanent deletion.
    private func remainingDaysText(from deletedAt: Date) -> String {
        let calendar = Calendar.current
        let expiryDate = calendar.date(byAdding: .day, value: 10, to: deletedAt)!
        let remaining = calendar.dateComponents([.day], from: Date(), to: expiryDate).day ?? 0
        let days = max(0, remaining)
        return "あと\(days)日で完全削除"
    }
}

#Preview {
    NavigationStack {
        TrashView()
    }
}
