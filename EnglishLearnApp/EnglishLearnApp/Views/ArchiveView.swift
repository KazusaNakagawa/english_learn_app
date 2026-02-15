import SwiftUI

struct ArchiveView: View {
    @State private var archivedWords: [Word] = []

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
        }
        .navigationTitle("アーカイブ")
        .onAppear { load() }
    }

    private func load() {
        archivedWords = WordDataManager.shared.loadArchivedWords()
    }
}

#Preview {
    NavigationStack {
        ArchiveView()
    }
}
