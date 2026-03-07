import SwiftUI

/// A persistent mini-player that displays at the bottom of the screen during playback.
///
/// Shows the current sentence, playback progress, and control buttons.
/// Tapping opens the full player sheet for queue management.
struct MiniPlayerView: View {
    @EnvironmentObject private var playbackManager: GlobalPlaybackManager
    @EnvironmentObject private var settings: SettingsManager

    @State private var showingFullPlayer = false

    var body: some View {
        HStack(spacing: 12) {
            // Current sentence info - tappable to expand
            Button {
                showingFullPlayer = true
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    if let item = playbackManager.currentItem {
                        currentSentenceText(for: item)
                        HStack(spacing: 4) {
                            Text(item.word.word)
                                .font(.caption)
                                .foregroundColor(.secondary)
                            Text(progressText)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    } else {
                        Text("No playback")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)

            // Playback controls - sibling buttons, not nested
            HStack(spacing: 16) {
                Button {
                    playbackManager.previous()
                } label: {
                    Image(systemName: "backward.fill")
                        .font(.title3)
                        .foregroundColor(.primary)
                }
                .buttonStyle(.plain)
                .disabled(playbackManager.currentIndex == 0)

                Button {
                    if playbackManager.isPlaying {
                        playbackManager.stop()
                    } else {
                        playbackManager.resume()
                    }
                } label: {
                    Image(systemName: playbackManager.isPlaying ? "pause.fill" : "play.fill")
                        .font(.title2)
                        .foregroundColor(.primary)
                }
                .buttonStyle(.plain)

                Button {
                    playbackManager.next()
                } label: {
                    Image(systemName: "forward.fill")
                        .font(.title3)
                        .foregroundColor(.primary)
                }
                .buttonStyle(.plain)
                .disabled(playbackManager.currentIndex >= playbackManager.queue.count - 1)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.regularMaterial)
        .overlay(alignment: .top) { Divider() }
        .sheet(isPresented: $showingFullPlayer) {
            FullPlayerView()
        }
    }

    // MARK: - Helper Views

    @ViewBuilder
    private func currentSentenceText(for item: QueueItem) -> some View {
        let mode = settings.playbackMode
        let step = playbackManager.currentStep

        // Determine which text to show based on current step
        let (text, isJapanese): (String, Bool) = {
            switch mode {
            case .bilingual:
                switch step {
                case 0, 2:
                    return (item.sentence.english, false)
                case 1:
                    return (item.sentence.japanese, true)
                default:
                    return (item.sentence.english, false)
                }
            case .englishOnly:
                return (item.sentence.english, false)
            }
        }()

        Text(text)
            .font(.subheadline)
            .fontWeight(.medium)
            .foregroundColor(isJapanese ? .orange : .blue)
            .lineLimit(1)
    }

    private var progressText: String {
        let current = playbackManager.currentIndex + 1
        let total = playbackManager.queue.count
        return "\(current)/\(total)"
    }
}

#Preview {
    VStack {
        Spacer()
        MiniPlayerView()
    }
    .environmentObject(GlobalPlaybackManager(speechService: .shared, settings: .shared))
    .environmentObject(SettingsManager.shared)
}
