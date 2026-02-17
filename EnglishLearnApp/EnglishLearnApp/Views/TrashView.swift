import SwiftUI

struct TrashView: View {
    @State private var trashedWords: [Word] = []
    @State private var wordToDelete: Word? = nil
    @State private var showingDeleteConfirm = false

    // MARK: Selection mode
    @State private var isSelecting = false
    @State private var selectedIDs: Set<UUID> = []
    @State private var showingBatchDeleteConfirm = false

    var body: some View {
        Group {
            if trashedWords.isEmpty {
                VStack(spacing: 16) {
                    Image(systemName: "trash")
                        .font(.system(size: 60))
                        .foregroundColor(.secondary)
                    Text("ゴミ箱は空です")
                        .font(.title2)
                        .foregroundColor(.secondary)
                    Text("削除した単語は10日間ここに保管されます")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(trashedWords) { word in
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
                                        WordDataManager.shared.restoreFromTrash(wordId: word.id)
                                        loadTrash()
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
                    if isSelecting {
                        trashActionBar
                    }
                }
            }
        }
        .navigationTitle("ゴミ箱")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                if isSelecting {
                    let allSelected = !trashedWords.isEmpty && trashedWords.allSatisfy { selectedIDs.contains($0.id) }
                    Button(allSelected ? "すべて解除" : "すべて選択") {
                        selectedIDs = allSelected ? [] : Set(trashedWords.map(\.id))
                    }
                } else {
                    Button("選択") { isSelecting = true }
                        .opacity(trashedWords.isEmpty ? 0 : 1)
                }
            }
            ToolbarItem(placement: .navigationBarLeading) {
                if isSelecting {
                    Button("キャンセル") { exitSelectionMode() }
                }
            }
        }
        .onAppear {
            loadTrash()
        }
        .confirmationDialog(
            "完全削除しますか？",
            isPresented: $showingDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("完全削除", role: .destructive) {
                if let word = wordToDelete {
                    WordDataManager.shared.permanentlyDelete(wordId: word.id)
                    loadTrash()
                }
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("この操作は取り消せません。")
        }
        .confirmationDialog(
            "\(selectedIDs.count)件を完全削除しますか？",
            isPresented: $showingBatchDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("完全削除", role: .destructive) {
                WordDataManager.shared.permanentlyDelete(wordIds: Array(selectedIDs))
                loadTrash()
                exitSelectionMode()
            }
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("この操作は取り消せません。")
        }
    }

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

    private var trashActionBar: some View {
        HStack(spacing: 0) {
            Button {
                WordDataManager.shared.restoreFromTrash(wordIds: Array(selectedIDs))
                loadTrash()
                exitSelectionMode()
            } label: {
                Label("元に戻す", systemImage: "arrow.uturn.backward")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .disabled(selectedIDs.isEmpty)

            Divider().frame(height: 44)

            Button(role: .destructive) {
                showingBatchDeleteConfirm = true
            } label: {
                Label("完全削除", systemImage: "trash.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .disabled(selectedIDs.isEmpty)
        }
        .background(.regularMaterial)
        .overlay(alignment: .top) { Divider() }
    }

    private func toggleSelection(_ id: UUID) {
        if selectedIDs.contains(id) { selectedIDs.remove(id) } else { selectedIDs.insert(id) }
    }

    private func exitSelectionMode() {
        isSelecting = false
        selectedIDs = []
    }

    private func loadTrash() {
        trashedWords = WordDataManager.shared.loadTrashWords()
    }

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
