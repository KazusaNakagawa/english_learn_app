import SwiftUI

/// A button that speaks text using SpeechService.
///
/// Automatically switches between `speaker.wave.2.fill` (idle) and
/// `speaker.wave.3.fill` (active) based on whether this language is currently
/// being spoken.
struct SpeechButton: View {
    enum Style {
        /// Full-width bar button used in SentencePracticeView.
        case fullWidth
        /// Compact pill button used in SentenceListView.
        case pill
    }

    let text: String
    let label: String
    let isJapanese: Bool
    let color: Color
    var style: Style = .fullWidth

    @ObservedObject var speechService: SpeechService

    private var isActive: Bool {
        speechService.isSpeaking &&
        (isJapanese ? speechService.speakingLanguage == "ja-JP"
                    : speechService.speakingLanguage != "ja-JP")
    }

    var body: some View {
        Button {
            if isJapanese {
                speechService.speak(text, language: "ja-JP")
            } else {
                speechService.speak(text, language: "en-US")
            }
        } label: {
            HStack {
                Image(systemName: isActive ? "speaker.wave.3.fill" : "speaker.wave.2.fill")
                    .font(style == .fullWidth ? .title2 : .body)
                Text(label)
                    .font(style == .fullWidth ? .headline : .body)
            }
            .padding(.horizontal, style == .fullWidth ? 0 : 16)
            .padding(.vertical, style == .fullWidth ? 0 : 8)
            .frame(maxWidth: style == .fullWidth ? .infinity : nil)
            .frame(height: style == .fullWidth ? 56 : nil)
            .background(color.opacity(0.1))
            .foregroundColor(color)
            .cornerRadius(style == .fullWidth ? 12 : 8)
        }
        .buttonStyle(.borderless)
        .padding(.horizontal, style == .fullWidth ? 16 : 0)
    }
}
