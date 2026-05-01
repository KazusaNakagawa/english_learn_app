import SwiftUI

struct WordListHeader: View {
    @Binding var query: String
    @Binding var letter: String  // "ALL" | "A"…"Z"

    private static let chips = ["ALL"] + (65...90).map { String(UnicodeScalar($0)!) }

    var body: some View {
        VStack(spacing: Tokens.Spacing.sm) {
            searchField
            letterStrip
        }
        .padding(.top, Tokens.Spacing.md)
        .padding(.bottom, Tokens.Spacing.sm)
        .padding(.horizontal, Tokens.Spacing.lg)
        .background(Color.token(\.bg))
    }

    private var searchField: some View {
        HStack(spacing: Tokens.Spacing.sm) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(Color.token(\.subtext))
            TextField("単語・意味・発音記号で検索", text: $query)
                .font(.system(size: 14))
                .foregroundStyle(Color.token(\.text))
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Color.token(\.subtext))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, Tokens.Spacing.md)
        .padding(.vertical, 10)
        .background(Color.token(\.card))
        .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.md))
    }

    private var letterStrip: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(Self.chips, id: \.self) { chip in
                        Button { letter = chip } label: {
                            Text(chip)
                                .font(.system(size: 13, weight: .semibold))
                                .frame(width: chip == "ALL" ? 44 : 36, height: 28)
                                .background(letter == chip ? Color.token(\.accent) : Color.token(\.card))
                                .foregroundStyle(letter == chip ? Color.white : Color.token(\.text))
                                .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.sm))
                        }
                        .id(chip)
                    }
                }
                .padding(.horizontal, Tokens.Spacing.lg)
            }
            .onChange(of: letter) { _, newLetter in
                withAnimation { proxy.scrollTo(newLetter, anchor: .center) }
            }
        }
    }
}

#Preview {
    @Previewable @State var query = ""
    @Previewable @State var letter = "ALL"

    WordListHeader(query: $query, letter: $letter)
        .background(Color.token(\.bg))
}
