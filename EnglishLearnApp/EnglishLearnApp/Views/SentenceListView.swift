import SwiftUI

struct SentenceListView: View {
    let word: Word
    @StateObject private var speechService = SpeechService()
    @EnvironmentObject private var settings: SettingsManager

    var groupedSentences: [(String, [Sentence])] {
        let grouped = Dictionary(grouping: word.sentences) { $0.category }
        return grouped.sorted { $0.key < $1.key }
    }

    var body: some View {
        List {
            // 単語情報セクション
            Section {
                VStack(alignment: .center, spacing: 8) {
                    Text(word.word)
                        .font(.largeTitle)
                        .fontWeight(.bold)

                    Text(word.phonetic)
                        .font(.title3)
                        .foregroundColor(.secondary)

                    Text(word.meaning)
                        .font(.title3)
                        .foregroundColor(.blue)

                    HStack(spacing: 12) {
                        SpeechButton(
                            text: word.word, label: "英語を聞く",
                            isJapanese: false, color: .blue, style: .pill,
                            speechService: speechService, voiceGender: settings.voiceGender
                        )
                        SpeechButton(
                            text: word.meaning, label: "日本語を聞く",
                            isJapanese: true, color: .orange, style: .pill,
                            speechService: speechService, voiceGender: settings.voiceGender
                        )
                    }
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }

            // 例文セクション（カテゴリ別）
            ForEach(groupedSentences, id: \.0) { category, sentences in
                Section(header: Text(category)) {
                    ForEach(sentences) { sentence in
                        NavigationLink(destination: SentencePracticeView(sentence: sentence, word: word)) {
                            SentenceRowView(sentence: sentence, speechService: speechService)
                        }
                    }
                }
            }
        }
        .navigationTitle("例文一覧")
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct SentenceRowView: View {
    let sentence: Sentence
    @ObservedObject var speechService: SpeechService

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(sentence.english)
                .font(.body)

            Text(sentence.japanese)
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .padding(.vertical, 4)
    }
}

#Preview {
    NavigationStack {
        SentenceListView(word: Word(
            word: "rarity",
            meaning: "珍しさ・希少性",
            phonetic: "ˈrer.ə.t̬i",
            sentences: [
                Sentence(english: "True friendship is a rarity.", japanese: "本当の友情は珍しい。", category: "一般的な使い方")
            ]
        ))
    }
}
