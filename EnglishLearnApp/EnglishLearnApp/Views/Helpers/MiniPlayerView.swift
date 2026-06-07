import SwiftUI

struct MiniPlayerView: View {
    @EnvironmentObject private var playbackManager: GlobalPlaybackManager
    @EnvironmentObject private var wordDataManager: WordDataManager
    @State private var showingFullPlayer = false

    var body: some View {
        if let item = playbackManager.currentItem {
            card(for: item)
                .padding(.horizontal, 8)
                .padding(.bottom, 6)
                .transition(.move(edge: .bottom).combined(with: .opacity))
                .fullScreenCover(isPresented: $showingFullPlayer) {
                    NowPlayingView()
                }
        }
    }

    // MARK: - Card

    private func card(for item: QueueItem) -> some View {
        let isFav = wordDataManager.words.first(where: { $0.id == item.word.id })?.isFavorite
            ?? item.word.isFavorite

        return Button { showingFullPlayer = true } label: {
            HStack(spacing: 10) {
                CoverArtView(word: item.word.word, size: 42, radius: 4)

                VStack(alignment: .leading, spacing: 1) {
                    Text(item.word.word)
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                    Text(item.sentence.english)
                        .font(.system(size: 11))
                        .foregroundStyle(.white.opacity(0.78))
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.trailing, 8)

                Button {
                    wordDataManager.toggleFavorite(wordId: item.word.id)
                } label: {
                    Image(systemName: isFav ? "heart.fill" : "heart")
                        .font(.system(size: 18))
                        .foregroundStyle(isFav ? Color.pink : .white)
                }
                .buttonStyle(.plain)

                Button {
                    if playbackManager.isPlaying { playbackManager.pause() }
                    else { playbackManager.resume() }
                } label: {
                    Image(systemName: playbackManager.isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 20))
                        .foregroundStyle(.white)
                        .contentTransition(.symbolEffect(.replace))
                }
                .buttonStyle(.plain)
            }
            .padding(.leading, 8)
            .padding(.trailing, 10)
            .padding(.vertical, 8)
            .background(
                CoverArtView.gradient(for: item.word.word).overlay(Color.black.opacity(0.18))
            )
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(alignment: .bottom) {
                ProgressLine(progress: playbackManager.progress)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 3)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Progress Line

private struct ProgressLine: View {
    let progress: Double

    var body: some View {
        GeometryReader { geo in
            Capsule()
                .fill(.white.opacity(0.55))
                .frame(width: geo.size.width * progress, height: 2)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .frame(height: 2)
    }
}

#Preview {
    VStack {
        Spacer()
        MiniPlayerView()
    }
    .environmentObject(GlobalPlaybackManager(speechService: .shared, settings: .shared))
    .environmentObject(WordDataManager.shared)
}
