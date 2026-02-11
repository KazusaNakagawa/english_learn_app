import SwiftUI

struct EditWordView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var wordText: String
    @State private var meaning: String
    @State private var phonetic: String

    private let word: Word
    var onSave: ((Word) -> Void)?

    init(word: Word, onSave: ((Word) -> Void)? = nil) {
        self.word = word
        self.onSave = onSave
        _wordText = State(initialValue: word.word)
        _meaning = State(initialValue: word.meaning)
        _phonetic = State(initialValue: word.phonetic)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("単語情報")) {
                    TextField("英単語", text: $wordText)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()

                    TextField("意味", text: $meaning)

                    TextField("発音記号", text: $phonetic)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
            }
            .navigationTitle("単語を編集")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("キャンセル") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("保存") {
                        saveWord()
                    }
                    .disabled(wordText.isEmpty || meaning.isEmpty)
                }
            }
        }
    }

    private func saveWord() {
        var updated = word
        updated.word = wordText
        updated.meaning = meaning
        updated.phonetic = phonetic
        onSave?(updated)
        dismiss()
    }
}

#Preview {
    EditWordView(word: Word(word: "example", meaning: "例", phonetic: "ɪɡˈzæmpəl"))
}
