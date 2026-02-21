import SwiftUI

/// A list row that displays a checkmark icon when in selection mode.
///
/// Used across WordListView, ArchiveView, and TrashView to provide consistent
/// selection UI with a checkmark circle icon and custom content.
struct SelectableListRow<Content: View>: View {
    let id: UUID
    let selection: SelectionState
    let content: Content

    private var isSelected: Bool {
        selection.selectedIDs.contains(id)
    }

    init(id: UUID, selection: SelectionState, @ViewBuilder content: () -> Content) {
        self.id = id
        self.selection = selection
        self.content = content()
    }

    var body: some View {
        Button {
            selection.toggle(id)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: isSelected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(isSelected ? Color.accentColor : Color.secondary)
                    .font(.title2)
                content
            }
        }
        .buttonStyle(.plain)
    }
}
