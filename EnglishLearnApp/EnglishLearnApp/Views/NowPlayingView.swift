import SwiftUI

struct NowPlayingView: View {
    @EnvironmentObject private var playbackManager: GlobalPlaybackManager
    @EnvironmentObject private var wordDataManager: WordDataManager
    @Environment(\.dismiss) private var dismiss

    @State private var dragOffset: CGFloat = 0
    @State private var scrubProgress: Double? = nil
    @State private var showingQueue = false

    var body: some View {
        let word = playbackManager.currentItem?.word.word ?? ""
        let colors = CoverArtView.colors(for: word)

        ZStack {
            backgroundGradient(colors: colors)

            VStack(spacing: 0) {
                topChrome
                    .padding(.top, 4)

                Spacer()

                CoverArtView(word: word, size: 300, radius: 6)
                    .shadow(color: .black.opacity(0.45), radius: 20, x: 0, y: 16)

                Spacer()

                if let item = playbackManager.currentItem {
                    trackInfo(item: item)
                }

                scrubber
                    .padding(.top, 20)

                bigControls
                    .padding(.top, 24)

                footer
                    .padding(.top, 24)
                    .padding(.bottom, 16)
            }
            .padding(.horizontal, 24)
            .foregroundStyle(.white)
        }
        .offset(y: max(0, dragOffset))
        .gesture(
            DragGesture(minimumDistance: 10)
                .onChanged { value in
                    // Ignore primarily-horizontal drags (scrubber interaction)
                    guard abs(value.translation.height) > abs(value.translation.width) else { return }
                    if value.translation.height > 0 { dragOffset = value.translation.height }
                }
                .onEnded { value in
                    guard abs(value.translation.height) > abs(value.translation.width) else { return }
                    if value.translation.height > 120 {
                        dismiss()
                    } else {
                        withAnimation(.spring(duration: 0.3)) { dragOffset = 0 }
                    }
                }
        )
        .sheet(isPresented: $showingQueue) {
            FullPlayerView()
        }
    }

    // MARK: - Background

    private func backgroundGradient(colors: [Color]) -> some View {
        let a = colors.first ?? .black
        let b = colors.count > 1 ? colors[1] : a
        return LinearGradient(
            stops: [
                .init(color: a,                    location: 0),
                .init(color: b,                    location: 0.22),
                .init(color: Color(hex: "1A1A1A"), location: 0.75),
                .init(color: .black,               location: 1),
            ],
            startPoint: .top,
            endPoint: .bottom
        )
        .ignoresSafeArea()
    }

    // MARK: - Top Chrome

    private var topChrome: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("閉じる")

            Spacer()

            VStack(spacing: 2) {
                Text("再生中・プレイリスト")
                    .font(.system(size: 11, weight: .semibold))
                    .textCase(.uppercase)
                    .foregroundStyle(.white.opacity(0.7))
                Text(playbackManager.currentItem?.word.word ?? "")
                    .font(.system(size: 13, weight: .semibold))
                    .lineLimit(1)
            }

            Spacer()

            Menu {
                Button { showingQueue = true } label: {
                    Label("キューを表示", systemImage: "list.bullet")
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 18, weight: .semibold))
                    .frame(width: 44, height: 44)
            }
        }
    }

    // MARK: - Track Info

    private func trackInfo(item: QueueItem) -> some View {
        let isFav = wordDataManager.words.first(where: { $0.id == item.word.id })?.isFavorite
            ?? item.word.isFavorite

        return HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 6) {
                Text(item.word.word)
                    .font(.system(size: 24, weight: .heavy))
                    .lineLimit(1)
                Text(item.sentence.english)
                    .font(.system(size: 14))
                    .foregroundStyle(.white)
                    .lineLimit(2)
                Text(item.sentence.japanese)
                    .font(.system(size: 12))
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                wordDataManager.toggleFavorite(wordId: item.word.id)
            } label: {
                Image(systemName: isFav ? "heart.fill" : "heart")
                    .font(.system(size: 28))
                    .foregroundStyle(isFav ? Color.pink : .white)
            }
            .buttonStyle(.plain)
        }
        .padding(.top, 16)
    }

    // MARK: - Scrubber

    private var scrubber: some View {
        let displayProgress = scrubProgress ?? playbackManager.progress
        let elapsed = displayProgress * playbackManager.estimatedDurationSeconds
        let total   = playbackManager.estimatedDurationSeconds

        return VStack(spacing: 6) {
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(.white.opacity(0.25))
                        .frame(height: 4)
                    Capsule()
                        .fill(.white)
                        .frame(width: max(0, geo.size.width * displayProgress), height: 4)
                    Circle()
                        .fill(.white)
                        .frame(width: 12, height: 12)
                        .offset(x: max(0, geo.size.width * displayProgress - 6))
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            scrubProgress = max(0, min(1, value.location.x / geo.size.width))
                        }
                        .onEnded { value in
                            let p = max(0, min(1, value.location.x / geo.size.width))
                            playbackManager.seek(to: p)
                            scrubProgress = nil
                        }
                )
            }
            .frame(height: 12)
            .accessibilityLabel("再生位置")
            .accessibilityValue("\(Int(displayProgress * 100))%")
            .accessibilityAdjustableAction { direction in
                let step = 0.1
                switch direction {
                case .increment: playbackManager.seek(to: min(1, displayProgress + step))
                case .decrement: playbackManager.seek(to: max(0, displayProgress - step))
                @unknown default: break
                }
            }

            HStack {
                Text(formatTime(elapsed))
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.7))
                Spacer()
                Text(formatTime(total))
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundStyle(.white.opacity(0.7))
            }
        }
    }

    // MARK: - Big Controls

    private var bigControls: some View {
        HStack {
            // shuffle: pending proper implementation (Issue #166)
            Color.clear.frame(width: 20, height: 20)

            Spacer()

            Button { playbackManager.previous() } label: {
                Image(systemName: "backward.fill")
                    .font(.system(size: 28))
            }
            .disabled(playbackManager.currentIndex == 0)

            Spacer()

            Button {
                if playbackManager.isPlaying { playbackManager.pause() }
                else { playbackManager.resume() }
            } label: {
                Image(systemName: playbackManager.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(.black)
                    .frame(width: 72, height: 72)
                    .background(Circle().fill(.white))
                    .shadow(color: .black.opacity(0.3), radius: 9, x: 0, y: 6)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(playbackManager.isPlaying ? "一時停止" : "再生")
            .contentTransition(.symbolEffect(.replace))

            Spacer()

            Button { playbackManager.next() } label: {
                Image(systemName: "forward.fill")
                    .font(.system(size: 28))
            }
            .disabled(playbackManager.currentIndex >= playbackManager.queue.count - 1)

            Spacer()

            // repeat: pending proper implementation (Issue #167)
            Color.clear.frame(width: 20, height: 20)
        }
    }

    // MARK: - Footer

    private var footer: some View {
        HStack {
            HStack(spacing: 4) {
                Image(systemName: "iphone")
                    .font(.system(size: 14))
                Text("iPhone")
                    .font(.system(size: 13))
            }
            .foregroundStyle(.white.opacity(0.6))

            Spacer()

            Button {
                showingQueue = true
            } label: {
                Image(systemName: "list.bullet")
                    .font(.system(size: 20))
                    .foregroundStyle(.white.opacity(0.6))
            }
            .accessibilityLabel("キューを表示")
        }
        .padding(.horizontal, 4)
    }

    // MARK: - Helpers

    private func formatTime(_ seconds: Double) -> String {
        let s = Int(max(0, seconds))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

#Preview {
    NowPlayingView()
        .environmentObject(GlobalPlaybackManager(speechService: .shared, settings: .shared))
        .environmentObject(WordDataManager.shared)
        .environmentObject(SettingsManager.shared)
}
