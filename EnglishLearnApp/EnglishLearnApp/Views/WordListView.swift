import SwiftUI
import MediaPlayer

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
    @ObservedObject private var dataManager = WordDataManager.shared
    @State private var searchText: String = ""
    @State private var wordToEdit: Word? = nil
    @State private var selectedLetter: Character? = nil
    @State private var selectedCategory: String? = nil

    @AppStorage("wordSortOption") private var sortOptionRaw: String = WordSortOption.alphabeticalAZ.rawValue

    @StateObject private var speechService = SpeechService()
    @EnvironmentObject private var settings: SettingsManager

    @State private var selection = SelectionState()

    // MARK: - Continuous playback for all words
    @State private var isPlayingAllWords = false
    @State private var playingFlatIndex: Int = 0  // Index into allWordSentences
    @State private var playingStep: Int = 0       // 0=EN, 1=JA, 2=EN (bilingual) or 0=EN, 1=EN (English-only)
    @State private var playbackGeneration = 0      // Invalidate old async tasks
    @State private var expectedGeneration = 0
    @State private var playCommandToken: Any? = nil
    @State private var pauseCommandToken: Any? = nil
    @State private var nextCommandToken: Any? = nil
    @State private var previousCommandToken: Any? = nil

    private var sortOption: WordSortOption {
        WordSortOption(rawValue: sortOptionRaw) ?? .alphabeticalAZ
    }

    private var availableLetters: [Character] {
        let letters = dataManager.words.compactMap { $0.word.uppercased().first }
        return Array(Set(letters)).sorted()
    }

    /// Unique categories from all active words' sentences, sorted.
    private var availableCategories: [String] {
        let cats = dataManager.words.flatMap { $0.sentences.map { $0.category } }
        return Array(Set(cats)).sorted()
    }

    private var filteredWords: [Word] {
        var result = dataManager.words

        // Letter filter
        if let letter = selectedLetter {
            result = result.filter { $0.word.uppercased().first == letter }
        }

        // Category filter: keep words that have at least one sentence in the selected category
        if let category = selectedCategory {
            result = result.filter { $0.sentences.contains { $0.category.contains(category) } }
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

    /// Flattens all words and their sentences into a single array for continuous playback.
    ///
    /// Each element is a tuple of (Word, Sentence) representing one playback unit.
    /// Only includes words that have at least one sentence.
    ///
    /// - Returns: Array of (Word, Sentence) tuples in display order
    private var allWordSentences: [(Word, Sentence)] {
        filteredWords.flatMap { word in
            word.sentences.map { sentence in
                (word, sentence)
            }
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            letterFilterBar
            if !availableCategories.isEmpty {
                categoryFilterBar
            }
            List(filteredWords) { word in
                if selection.isSelecting {
                    SelectableListRow(id: word.id, selection: selection) {
                        WordRowView(word: word, speechService: speechService)
                    }
                } else {
                    NavigationLink(destination: destinationView(for: word)) {
                        WordRowView(word: word, speechService: speechService)
                    }
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            WordDataManager.shared.moveToTrash(wordId: word.id)
                        } label: {
                            Label("ゴミ箱へ", systemImage: "trash")
                        }
                        Button {
                            WordDataManager.shared.archive(wordId: word.id)
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
                if selection.isSelecting {
                    wordListActionBar
                }
            }
        }
        .navigationTitle("英単語リスト")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                if selection.isSelecting {
                    Button("キャンセル") { selection.exitSelectionMode() }
                }
            }
            ToolbarItem(placement: .navigationBarTrailing) {
                if selection.isSelecting {
                    let allSelected = !filteredWords.isEmpty && filteredWords.allSatisfy { selection.selectedIDs.contains($0.id) }
                    Button(allSelected ? "すべて解除" : "すべて選択") {
                        selection.selectedIDs = allSelected ? [] : Set(filteredWords.map(\.id))
                    }
                } else {
                    HStack {
                        // Play all words button
                        if !allWordSentences.isEmpty {
                            Button {
                                if isPlayingAllWords {
                                    stopPlayAllWords()
                                } else {
                                    startPlayAllWords()
                                }
                            } label: {
                                Image(systemName: isPlayingAllWords ? "stop.fill" : "play.fill")
                                    .foregroundColor(isPlayingAllWords ? .red : .blue)
                            }
                        }
                        sortMenu
                        if !filteredWords.isEmpty {
                            Button("選択") { selection.isSelecting = true }
                        }
                    }
                }
            }
        }
        .sheet(item: $wordToEdit) { word in
            EditWordView(word: word) { updatedWord in
                WordDataManager.shared.updateWord(updatedWord)
            }
        }
        // Intentionally only clears selectedIDs; isSelecting stays true so the
        // user can continue selecting from the newly filtered results.
        .onChange(of: searchText) { _, _ in selection.selectedIDs = [] }
        .onChange(of: selectedLetter) { _, _ in selection.selectedIDs = [] }
        .onChange(of: selectedCategory) { _, _ in selection.selectedIDs = [] }
        // Continuous playback event handlers
        .onReceive(speechService.speechFinishedPublisher) { _ in
            guard isPlayingAllWords else { return }
            guard expectedGeneration == playbackGeneration else { return }

            let capturedGeneration = playbackGeneration
            Task {
                try? await Task.sleep(nanoseconds: 800_000_000)  // 0.8s delay
                await MainActor.run {
                    guard capturedGeneration == playbackGeneration else { return }
                    advancePlaybackAllWords()
                }
            }
        }
        .onAppear {
            setupRemoteCommandCenter()
        }
        .onChange(of: settings.playbackMode) { _, _ in
            if isPlayingAllWords {
                playbackGeneration += 1
                playingStep = 0
                speakCurrentStepAllWords()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .speechServiceDidStartNewPlayback)) { _ in
            if isPlayingAllWords {
                playbackGeneration += 1
                isPlayingAllWords = false
                playingStep = 0
                clearNowPlayingInfo()
            }
        }
        .onDisappear {
            stopPlayAllWords()
            let commandCenter = MPRemoteCommandCenter.shared()
            if let t = playCommandToken { commandCenter.playCommand.removeTarget(t) }
            if let t = pauseCommandToken { commandCenter.pauseCommand.removeTarget(t) }
            if let t = nextCommandToken { commandCenter.nextTrackCommand.removeTarget(t) }
            if let t = previousCommandToken { commandCenter.previousTrackCommand.removeTarget(t) }
            playCommandToken = nil
            pauseCommandToken = nil
            nextCommandToken = nil
            previousCommandToken = nil
        }
    }

    /// Bottom action bar shown during selection mode with Archive and Trash actions.
    private var wordListActionBar: some View {
        ActionBar {
            HStack(spacing: 0) {
                ActionBarButton(
                    "アーカイブ",
                    systemImage: "archivebox",
                    isDisabled: selection.selectedIDs.isEmpty
                ) {
                    WordDataManager.shared.archive(wordIds: Array(selection.selectedIDs))
                    selection.exitSelectionMode()
                }

                Divider().frame(height: 44)

                ActionBarButton(
                    "ゴミ箱へ",
                    systemImage: "trash",
                    role: .destructive,
                    isDisabled: selection.selectedIDs.isEmpty
                ) {
                    WordDataManager.shared.moveToTrash(wordIds: Array(selection.selectedIDs))
                    selection.exitSelectionMode()
                }
            }
        }
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

    private var categoryFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                categoryChip(nil, label: "すべて")
                ForEach(availableCategories, id: \.self) { category in
                    categoryChip(category, label: category)
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(Color(.systemGroupedBackground))
        .overlay(alignment: .top) { Divider() }
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

    private func categoryChip(_ category: String?, label: String) -> some View {
        Button {
            selectedCategory = category
        } label: {
            Text(label)
                .font(.subheadline.bold())
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selectedCategory == category ? Color.orange : Color(.secondarySystemGroupedBackground))
                .foregroundColor(selectedCategory == category ? .white : .primary)
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

    // MARK: - Continuous Playback Logic

    /// Starts continuous playback across all words and their sentences.
    private func startPlayAllWords() {
        guard !allWordSentences.isEmpty else { return }

        // Increment generation to invalidate pending tasks
        playbackGeneration += 1
        let currentGen = playbackGeneration

        // Stop current playback
        isPlayingAllWords = false
        playingStep = 0
        speechService.stop()

        Task { @MainActor in
            guard currentGen == playbackGeneration else { return }

            playingFlatIndex = 0
            isPlayingAllWords = true
            playingStep = 0
            speakCurrentStepAllWords()
        }
    }

    /// Stops continuous playback of all words.
    private func stopPlayAllWords() {
        playbackGeneration += 1
        isPlayingAllWords = false
        playingStep = 0
        speechService.stop()
        speechService.deactivateAudioSession()
        clearNowPlayingInfo()
    }

    /// Speaks the text for the current sentence and playback step.
    private func speakCurrentStepAllWords() {
        guard playingFlatIndex < allWordSentences.count else {
            stopPlayAllWords()
            return
        }

        expectedGeneration = playbackGeneration

        let (word, sentence) = allWordSentences[playingFlatIndex]

        switch settings.playbackMode {
        case .bilingual:
            switch playingStep {
            case 0, 2:
                speechService.speak(sentence.english, voiceGender: settings.voiceGender, isContinuousPlayback: true)
            case 1:
                speechService.speak(sentence.japanese, language: "ja-JP", voiceGender: settings.voiceGender, isContinuousPlayback: true)
            default:
                break
            }
        case .englishOnly:
            speechService.speak(sentence.english, voiceGender: settings.voiceGender, isContinuousPlayback: true)
        }

        updateNowPlayingInfoAllWords()
    }

    /// Advances to the next playback step or sentence.
    private func advancePlaybackAllWords() {
        let maxSteps = settings.playbackMode == .bilingual ? 3 : 2
        let nextStep = playingStep + 1

        if nextStep < maxSteps {
            playingStep = nextStep
            speakCurrentStepAllWords()
        } else {
            let nextIdx = playingFlatIndex + 1
            if nextIdx < allWordSentences.count {
                playingFlatIndex = nextIdx
                playingStep = 0
                speakCurrentStepAllWords()
            } else {
                // All done
                isPlayingAllWords = false
                playingStep = 0
                clearNowPlayingInfo()
            }
        }
    }

    /// Sets up remote command center for lock screen controls.
    private func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()

        playCommandToken = commandCenter.playCommand.addTarget { _ in
            if !self.isPlayingAllWords {
                self.startPlayAllWords()
                return .success
            }
            return .commandFailed
        }

        pauseCommandToken = commandCenter.pauseCommand.addTarget { _ in
            if self.isPlayingAllWords {
                self.stopPlayAllWords()
                return .success
            }
            return .commandFailed
        }

        nextCommandToken = commandCenter.nextTrackCommand.addTarget { _ in
            if self.isPlayingAllWords && self.playingFlatIndex + 1 < self.allWordSentences.count {
                self.playbackGeneration += 1
                self.playingFlatIndex += 1
                self.playingStep = 0
                self.speakCurrentStepAllWords()
                return .success
            }
            return .commandFailed
        }

        previousCommandToken = commandCenter.previousTrackCommand.addTarget { _ in
            if self.isPlayingAllWords && self.playingFlatIndex > 0 {
                self.playbackGeneration += 1
                self.playingFlatIndex -= 1
                self.playingStep = 0
                self.speakCurrentStepAllWords()
                return .success
            }
            return .commandFailed
        }
    }

    /// Updates Now Playing info for lock screen/Control Center.
    private func updateNowPlayingInfoAllWords() {
        guard playingFlatIndex < allWordSentences.count else { return }

        let (word, sentence) = allWordSentences[playingFlatIndex]
        let maxSteps = settings.playbackMode == .bilingual ? 3 : 2
        let clampedStep = min(max(playingStep, 0), maxSteps - 1)

        let stepLabel: String
        if settings.playbackMode == .bilingual {
            stepLabel = ["English (1st)", "Japanese", "English (2nd)"][clampedStep]
        } else {
            stepLabel = ["English (1st)", "English (2nd)"][clampedStep]
        }

        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPMediaItemPropertyTitle] = sentence.english
        nowPlayingInfo[MPMediaItemPropertyArtist] = "\(word.word) - \(stepLabel)"
        nowPlayingInfo[MPMediaItemPropertyAlbumTitle] = word.meaning
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlayingAllWords ? 1.0 : 0.0
        nowPlayingInfo[MPNowPlayingInfoPropertyMediaType] = MPNowPlayingInfoMediaType.audio.rawValue

        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }

    /// Clears Now Playing info.
    private func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
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

// MARK: - Badge Overlay

extension View {
    /// Overlays a numeric badge at the top-trailing corner of any view.
    /// Caps at "99+" to prevent the badge from overflowing narrow icons.
    func badgeOverlay(_ count: Int, accessibilityLabel: String = "") -> some View {
        overlay(alignment: .topTrailing) {
            if count > 0 {
                let label = count < 100 ? "\(count)" : "99+"
                Text(label)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .background(Color.accentColor)
                    .clipShape(Capsule())
                    .offset(x: 8, y: -6)
                    .accessibilityLabel(accessibilityLabel.isEmpty ? label : accessibilityLabel)
            }
        }
    }
}
