import SwiftUI

struct WordListView: View {
    @State private var words: [Word] = []
    @StateObject private var speechService = SpeechService()
    @EnvironmentObject private var settings: SettingsManager

    var body: some View {
        List(words) { word in
            NavigationLink(destination: destinationView(for: word)) {
                WordRowView(word: word, speechService: speechService)
            }
        }
        .navigationTitle("英単語リスト")
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
