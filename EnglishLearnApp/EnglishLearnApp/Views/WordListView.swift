import SwiftUI

// MARK: - Sort Option

enum WordSortOption: String, CaseIterable {
    case alphabeticalAZ   = "alphabetical_az"
    case alphabeticalZA   = "alphabetical_za"
    case dateNewest       = "date_newest"
    case dateOldest       = "date_oldest"
    case mostSentences    = "most_sentences"
    case fewestSentences  = "fewest_sentences"

    var label: String {
        switch self {
        case .alphabeticalAZ:  return "A → Z"
        case .alphabeticalZA:  return "Z → A"
        case .dateNewest:      return "Newest first"
        case .dateOldest:      return "Oldest first"
        case .mostSentences:   return "Most sentences"
        case .fewestSentences: return "Fewest sentences"
        }
    }
}

// MARK: - WordListView

struct WordListView: View {
    @State private var words: [Word] = []
    @State private var searchText: String = ""
    @State private var wordToEdit: Word? = nil
    @State private var selectedLetter: Character? = nil

    @AppStorage("wordSortOption") private var sortOptionRaw: String = WordSortOption.alphabeticalAZ.rawValue

    @StateObject private var speechService = SpeechService()
    @EnvironmentObject private var settings: SettingsManager

    @State private var showingAddWordView = false

    // MARK: Selection mode
    @State private var isSelecting = false
    @State private var selectedIDs: Set<UUID> = []

    private var sortOption: WordSortOption {
        WordSortOption(rawValue: sortOptionRaw) ?? .alphabeticalAZ
    }

    private var availableLetters: [Character] {
        let letters = words.compactMap { $0.word.uppercased().first }
        return Array(Set(letters)).sorted()
    }

    private var filteredWords: [Word] {
        var result = words

        // Letter filter
        if let letter = selectedLetter {
            result = result.filter { $0.word.uppercased().first == letter }
        }

        // Search filter
        if !searchText.isEmpty {
            let query = searchText.lowercased()
            result = result.filter {
                $0.word.lowercased().contains(query) ||
                $0.meaning.lowercased().contains(query) ||
                $0.phonetic.lowercased().contains(query)
            }
        }

        // Sort
        switch sortOption {
        case .alphabeticalAZ:
            result.sort { $0.word.lowercased() < $1.word.lowercased() }
        case .alphabeticalZA:
            result.sort { $0.word.lowercased() > $1.word.lowercased() }
        case .dateNewest:
            result.sort { ($0.createdAt ?? .distantPast) > ($1.createdAt ?? .distantPast) }
        case .dateOldest:
            result.sort { ($0.createdAt ?? .distantPast) < ($1.createdAt ?? .distantPast) }
        case .mostSentences:
            result.sort { $0.sentences.count > $1.sentences.count }
        case .fewestSentences:
            result.sort { $0.sentences.count < $1.sentences.count }
        }

        return result
    }

    var body: some View {
        VStack(spacing: 0) {
            letterFilterBar
            List(filteredWords) { word in
                if isSelecting {
                    Button {
                        toggleSelection(word.id)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: selectedIDs.contains(word.id) ? "checkmark.circle.fill" : "circle")
                                .foregroundColor(selectedIDs.contains(word.id) ? .accentColor : .secondary)
                                .font(.title2)
                            WordRowView(word: word, speechService: speechService)
                        }
                    }
                    .buttonStyle(.plain)
                } else {
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
                        Button {
                            WordDataManager.shared.archive(wordId: word.id)
                            words = WordDataManager.shared.loadWords()
                        } label: {
                            Label("アーカイブ", systemImage: "archivebox")
                        }
                        .tint(.teal)
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
            }
            .searchable(text: $searchText, prompt: "単語・意味・発音記号で検索")
            .safeAreaInset(edge: .bottom) {
                if isSelecting {
                    wordListActionBar
                }
            }
        }
        .navigationTitle("英単語リスト")
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                if isSelecting {
                    Button("キャンセル") { exitSelectionMode() }
                } else {
                    HStack {
                        NavigationLink(destination: ArchiveView()) {
                            Image(systemName: "archivebox")
                        }
                        NavigationLink(destination: TrashView()) {
                            Image(systemName: "trash")
                        }
                    }
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                if isSelecting {
                    let allSelected = !filteredWords.isEmpty && filteredWords.allSatisfy { selectedIDs.contains($0.id) }
                    Button(allSelected ? "すべて解除" : "すべて選択") {
                        if allSelected {
                            selectedIDs = []
                        } else {
                            selectedIDs = Set(filteredWords.map(\.id))
                        }
                    }
                } else {
                    HStack {
                        sortMenu
                        Button { showingAddWordView = true } label: { Image(systemName: "plus") }
                        Button("選択") { isSelecting = true }
                    }
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

    private var wordListActionBar: some View {
        HStack(spacing: 0) {
            Button {
                WordDataManager.shared.archive(wordIds: Array(selectedIDs))
                words = WordDataManager.shared.loadWords()
                exitSelectionMode()
            } label: {
                Label("アーカイブ", systemImage: "archivebox")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
            }
            .disabled(selectedIDs.isEmpty)

            Divider().frame(height: 44)

            Button(role: .destructive) {
                WordDataManager.shared.moveToTrash(wordIds: Array(selectedIDs))
                words = WordDataManager.shared.loadWords()
                exitSelectionMode()
            } label: {
                Label("ゴミ箱へ", systemImage: "trash")
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

    // MARK: - Subviews

    private var letterFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                letterChip(nil, label: "All")
                ForEach(availableLetters, id: \.self) { letter in
                    letterChip(letter, label: String(letter))
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Color(.systemGroupedBackground))
    }

    private func letterChip(_ letter: Character?, label: String) -> some View {
        Button {
            selectedLetter = letter
        } label: {
            Text(label)
                .font(.subheadline.bold())
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selectedLetter == letter ? Color.accentColor : Color(.secondarySystemGroupedBackground))
                .foregroundColor(selectedLetter == letter ? .white : .primary)
                .cornerRadius(8)
        }
    }

    private var sortMenu: some View {
        Menu {
            ForEach(WordSortOption.allCases, id: \.self) { option in
                Button {
                    sortOptionRaw = option.rawValue
                } label: {
                    if sortOption == option {
                        Label(option.label, systemImage: "checkmark")
                    } else {
                        Text(option.label)
                    }
                }
            }
        } label: {
            Image(systemName: "arrow.up.arrow.down")
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

// MARK: - WordRowView

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

            HStack(spacing: 12) {
                Button(action: {
                    speechService.speak(word.word, voiceGender: speechService.voiceGender)
                }) {
                    Image(systemName: (speechService.isSpeaking && speechService.speakingLanguage != "ja-JP") ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                        .font(.title2)
                        .foregroundColor(.blue)
                }
                .buttonStyle(.borderless)

                Button(action: {
                    speechService.speak(word.meaning, language: "ja-JP", voiceGender: speechService.voiceGender)
                }) {
                    Image(systemName: (speechService.isSpeaking && speechService.speakingLanguage == "ja-JP") ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                        .font(.title2)
                        .foregroundColor(.orange)
                }
                .buttonStyle(.borderless)
            }
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    NavigationStack {
        WordListView()
    }
}
