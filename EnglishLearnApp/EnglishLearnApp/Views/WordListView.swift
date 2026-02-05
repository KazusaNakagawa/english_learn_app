import SwiftUI

/// A view that displays a list of vocabulary words.
///
/// This view shows all available words with their meanings and phonetics.
/// Users can tap on a word to navigate to its sentences or practice view,
/// and use the "+" button to add new words.
///
/// ## Features
/// - Displays words with meaning, phonetic, and sentence count
/// - Audio playback button for each word
/// - Navigation to sentence list or practice view
/// - Add new words via sheet presentation
struct WordListView: View {
    /// The list of words to display.
    @State private var words: [Word] = []

    /// The speech service for audio playback.
    @StateObject private var speechService = SpeechService()

    /// The shared settings manager.
    @EnvironmentObject private var settings: SettingsManager

    /// Controls the presentation of the add word view.
    @State private var showingAddWordView = false

    var body: some View {
        List(words) { word in
            NavigationLink(destination: destinationView(for: word)) {
                WordRowView(word: word, speechService: speechService)
            }
        }
        .navigationTitle("英単語リスト")
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    showingAddWordView = true
                }) {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingAddWordView) {
            AddWordView { newWord in
                words.append(newWord)
                WordDataManager.shared.saveWords(words)
            }
        }
        .onAppear {
            words = WordDataManager.shared.loadWords()
        }
    }

    /// Returns the appropriate destination view for the given word.
    ///
    /// - Parameter word: The word to navigate to.
    /// - Returns: `SentenceListView` if the word has sentences, otherwise `WordPracticeView`.
    @ViewBuilder
    private func destinationView(for word: Word) -> some View {
        if word.sentences.isEmpty {
            WordPracticeView(word: word)
        } else {
            SentenceListView(word: word)
        }
    }
}

/// A row view displaying a single word in the list.
///
/// Shows the word, phonetic transcription, meaning, sentence count badge,
/// and an audio playback button.
struct WordRowView: View {
    /// The word to display.
    let word: Word

    /// The speech service for audio playback.
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
