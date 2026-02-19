import Foundation

/// Shared selection-mode state for list views.
///
/// Encapsulates `isSelecting`, `selectedIDs`, and the two common mutations
/// (toggle a single item, exit selection mode) so they don't have to be
/// duplicated across WordListView, ArchiveView, and TrashView.
@Observable
final class SelectionState {
    var isSelecting = false
    var selectedIDs: Set<UUID> = []

    func toggle(_ id: UUID) {
        if selectedIDs.contains(id) { selectedIDs.remove(id) } else { selectedIDs.insert(id) }
    }

    func exitSelectionMode() {
        isSelecting = false
        selectedIDs = []
    }
}
