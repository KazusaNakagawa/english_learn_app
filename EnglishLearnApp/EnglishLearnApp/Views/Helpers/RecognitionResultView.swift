import SwiftUI

/// Displays the speech-recognizer's transcription while the user is practicing.
struct RecognitionResultView: View {
    let recognizedText: String

    var body: some View {
        VStack(spacing: 8) {
            Text("認識結果:")
                .font(.caption)
                .foregroundColor(.secondary)
            Text(recognizedText)
                .font(.body)
                .fontWeight(.medium)
                .multilineTextAlignment(.center)
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(Color.gray.opacity(0.1))
        .cornerRadius(12)
        .padding(.horizontal)
    }
}
