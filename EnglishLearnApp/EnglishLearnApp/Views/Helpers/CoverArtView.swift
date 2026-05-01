import SwiftUI

// MARK: - Color palette

private let gradientPalettes: [[Color]] = [
    [Color(hue: 0.65, saturation: 0.70, brightness: 0.80), Color(hue: 0.75, saturation: 0.60, brightness: 0.90)],
    [Color(hue: 0.00, saturation: 0.70, brightness: 0.80), Color(hue: 0.08, saturation: 0.60, brightness: 0.90)],
    [Color(hue: 0.30, saturation: 0.70, brightness: 0.65), Color(hue: 0.42, saturation: 0.60, brightness: 0.78)],
    [Color(hue: 0.50, saturation: 0.70, brightness: 0.80), Color(hue: 0.60, saturation: 0.60, brightness: 0.90)],
    [Color(hue: 0.85, saturation: 0.65, brightness: 0.80), Color(hue: 0.95, saturation: 0.60, brightness: 0.90)],
    [Color(hue: 0.10, saturation: 0.80, brightness: 0.90), Color(hue: 0.15, saturation: 0.70, brightness: 0.80)],
]

/// Returns a deterministic LinearGradient for a word string.
func coverGradient(for word: String) -> LinearGradient {
    let index = abs(word.hashValue) % gradientPalettes.count
    let colors = gradientPalettes[index]
    return LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
}

/// Square cover art: gradient background + first-letter monogram.
struct CoverArtView: View {
    let word: String
    let size: CGFloat
    var radius: CGFloat = 8

    var body: some View {
        ZStack {
            coverGradient(for: word)
            Text(String((word.first ?? "?")).uppercased())
                .font(.system(size: size * 0.44, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: radius))
    }
}

#Preview {
    HStack(spacing: 12) {
        CoverArtView(word: "rarity", size: 56)
        CoverArtView(word: "experience", size: 56)
        CoverArtView(word: "these days", size: 56)
        CoverArtView(word: "ambiguous", size: 56)
    }
    .padding()
}
