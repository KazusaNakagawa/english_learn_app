import SwiftUI

/// A full-screen player view showing current playback and queue management.
///
/// Presented as a sheet from MiniPlayerView. Shows:
/// - Current word information
/// - Current sentence with step indicator
/// - Full queue with swipe-to-delete
struct FullPlayerView: View {
    @EnvironmentObject private var playbackManager: GlobalPlaybackManager
    @EnvironmentObject private var settings: SettingsManager
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Current playback section
                if let item = playbackManager.currentItem {
                    currentPlaybackSection(item: item)
                } else if let firstItem = playbackManager.queue.first {
                    // Show first item if not playing
                    currentPlaybackSection(item: firstItem)
                }

                Divider()
                    .padding(.vertical, 8)

                // Queue section
                queueSection
            }
            .navigationTitle("再生キュー")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("閉じる") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    if !playbackManager.queue.isEmpty {
                        Button("クリア", role: .destructive) {
                            playbackManager.clearQueue()
                            dismiss()
                        }
                    }
                }
            }
        }
    }

    // MARK: - Current Playback Section

    @ViewBuilder
    private func currentPlaybackSection(item: QueueItem) -> some View {
        VStack(spacing: 16) {
            // Word info
            VStack(spacing: 4) {
                Text(item.word.word)
                    .font(.title)
                    .fontWeight(.bold)

                Text(item.word.phonetic)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                Text(item.word.meaning)
                    .font(.body)
                    .foregroundColor(.blue)
            }
            .padding(.top, 20)

            // Current sentence
            VStack(spacing: 8) {
                Text(item.sentence.english)
                    .font(.body)
                    .fontWeight(.medium)
                    .foregroundColor(.blue)
                    .multilineTextAlignment(.center)

                Text(item.sentence.japanese)
                    .font(.subheadline)
                    .foregroundColor(.orange)
                    .multilineTextAlignment(.center)

                // Step indicator
                stepIndicator
            }
            .padding(.horizontal, 20)

            // Playback controls
            playbackControls
                .padding(.top, 8)
        }
    }

    private var stepIndicator: some View {
        let mode = settings.playbackMode
        let step = playbackManager.currentStep
        let totalSteps = mode.stepsPerItem

        return HStack(spacing: 4) {
            ForEach(0..<totalSteps, id: \.self) { index in
                Circle()
                    .fill(index == step ? Color.accentColor : Color.secondary.opacity(0.3))
                    .frame(width: 8, height: 8)
            }
        }
        .padding(.top, 4)
    }

    private var playbackControls: some View {
        HStack(spacing: 32) {
            Button {
                playbackManager.previous()
            } label: {
                Image(systemName: "backward.fill")
                    .font(.title)
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
                Image(systemName: playbackManager.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 56))
                    .foregroundColor(.accentColor)
            }
            .buttonStyle(.plain)

            Button {
                playbackManager.next()
            } label: {
                Image(systemName: "forward.fill")
                    .font(.title)
                    .foregroundColor(.primary)
            }
            .buttonStyle(.plain)
            .disabled(playbackManager.currentIndex >= playbackManager.queue.count - 1)
        }
        .padding(.vertical, 8)
    }

    // MARK: - Queue Section

    private var queueSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("キュー")
                    .font(.headline)
                Text("\(playbackManager.queue.count)件")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }
            .padding(.horizontal, 20)

            if playbackManager.queue.isEmpty {
                emptyQueueView
            } else {
                queueList
            }
        }
    }

    private var emptyQueueView: some View {
        VStack(spacing: 8) {
            Image(systemName: "music.note.list")
                .font(.largeTitle)
                .foregroundColor(.secondary)
            Text("キューが空です")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var queueList: some View {
        List {
            ForEach(playbackManager.queue.indices, id: \.self) { index in
                let item = playbackManager.queue[index]
                queueRow(item: item, index: index)
                    .listRowBackground(
                        index == playbackManager.currentIndex ? Color.accentColor.opacity(0.12) : nil
                    )
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            playbackManager.removeFromQueue(at: index)
                        } label: {
                            Label("削除", systemImage: "trash")
                        }
                    }
            }
        }
        .listStyle(.plain)
    }

    @ViewBuilder
    private func queueRow(item: QueueItem, index: Int) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(item.sentence.english)
                    .font(.subheadline)
                    .lineLimit(1)

                HStack(spacing: 4) {
                    Text(item.word.word)
                        .font(.caption)
                        .foregroundColor(.blue)
                    Text(item.sentence.japanese)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
            }

            Spacer()

            if index == playbackManager.currentIndex && playbackManager.isPlaying {
                Image(systemName: "speaker.wave.2.fill")
                    .foregroundColor(.accentColor)
                    .font(.caption)
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            // Tap to play from this item
            playbackManager.enqueue(playbackManager.queue, startIndex: index)
        }
    }
}

#Preview {
    FullPlayerView()
        .environmentObject(GlobalPlaybackManager(speechService: .shared, settings: .shared))
        .environmentObject(SettingsManager.shared)
}
