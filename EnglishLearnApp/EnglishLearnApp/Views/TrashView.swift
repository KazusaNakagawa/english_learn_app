import SwiftUI

struct TrashView: View {
    @State private var trashedWords: [Word] = []
    @State private var wordToDelete: Word? = nil
    @State private var showingDeleteConfirm = false

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
        }
        .navigationTitle("ゴミ箱")
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
