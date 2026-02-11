import SwiftUI

struct WordListView: View {
    @State private var words: [Word] = []
    @State private var searchText: String = ""
    @State private var wordToEdit: Word? = nil

    @StateObject private var speechService = SpeechService()
    @EnvironmentObject private var settings: SettingsManager

    @State private var showingAddWordView = false

    private var filteredWords: [Word] {
        if searchText.isEmpty {
            return words
        }
        let query = searchText.lowercased()
        return words.filter {
            $0.word.lowercased().contains(query) ||
            $0.meaning.lowercased().contains(query) ||
            $0.phonetic.lowercased().contains(query)
        }
    }

    var body: some View {
        List(filteredWords) { word in
            NavigationLink(destination: destinationView(for: word)) {
                WordRowView(word: word, speechService: speechService)
            }
            .swipeActions(edge: .trailing) {
                Button(role: .destructive) {
                    WordDataManager.shared.moveToTrash(wordId: word.id)
                    words = WordDataManager.shared.loadWords()
                } label: {
                    Label("ゴミ箱へ", systemImage: "trash")
                }
            }
            .swipeActions(edge: .leading) {
                Button {
                    wordToEdit = word
                } label: {
                    Label("編集", systemImage: "pencil")
                }
                .tint(.orange)
            }
        }
        .searchable(text: $searchText, prompt: "単語・意味・発音記号で検索")
        .navigationTitle("英単語リスト")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    showingAddWordView = true
                }) {
                    Image(systemName: "plus")
                }
            }
            ToolbarItem(placement: .navigationBarLeading) {
                NavigationLink(destination: TrashView()) {
                    Image(systemName: "trash")
                }
            }
        }
        .sheet(isPresented: $showingAddWordView) {
            AddWordView { newWord in
                let all = WordDataManager.shared.loadAllWords() + [newWord]
                WordDataManager.shared.saveAllWords(all)
                words = WordDataManager.shared.loadWords()
            }
        }
        .sheet(item: $wordToEdit) { word in
            EditWordView(word: word) { updatedWord in
                WordDataManager.shared.updateWord(updatedWord)
                words = WordDataManager.shared.loadWords()
            }
        }
        .onAppear {
            words = WordDataManager.shared.loadWords()
        }
    }

    @ViewBuilder
    private func destinationView(for word: Word) -> some View {
        if word.sentences.isEmpty {
            WordPracticeView(word: word)
        } else {
            SentenceListView(word: word)
        }
    }
}

struct WordRowView: View {
    let word: Word
    @ObservedObject var speechService: SpeechService

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(word.word)
                        .font(.headline)

                    if !word.sentences.isEmpty {
                        Text("\(word.sentences.count)例文")
                            .font(.caption)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.2))
                            .foregroundColor(.orange)
                            .cornerRadius(4)
                    }
                }

                Text(word.phonetic)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Text(word.meaning)
                    .font(.subheadline)
                    .foregroundColor(.blue)
            }

            Spacer()

            Button(action: {
                speechService.speak(word.word, voiceGender: speechService.voiceGender)
            }) {
                Image(systemName: speechService.isSpeaking ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                    .font(.title2)
                    .foregroundColor(.blue)
            }
            .buttonStyle(.borderless)
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    NavigationStack {
        WordListView()
    }
}
