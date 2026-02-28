import SwiftUI

/// Displays the result of a pronunciation check.
struct PronunciationResultView: View {
    let result: PronunciationResult
    var font: Font = .title3

    var body: some View {
        Text(result.message)
            .font(font)
            .fontWeight(.semibold)
            .foregroundColor(result.color)
            .padding()
            .frame(maxWidth: .infinity)
            .background(result.color.opacity(0.1))
            .cornerRadius(12)
            .padding(.horizontal)
    }
}
