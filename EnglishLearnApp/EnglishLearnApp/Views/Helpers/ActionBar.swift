import SwiftUI

/// A bottom action bar that displays buttons horizontally with dividers.
///
/// Used across WordListView, ArchiveView, and TrashView to provide consistent
/// bottom action bars during selection mode.
struct ActionBar<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .background(.regularMaterial)
            .overlay(alignment: .top) { Divider() }
    }
}

/// A button designed for use within an ActionBar.
///
/// Provides consistent styling with centered label, max width, and vertical padding.
struct ActionBarButton: View {
    let title: String
    let systemImage: String
    let role: ButtonRole?
    let isDisabled: Bool
    let action: () -> Void

    init(
        _ title: String,
        systemImage: String,
        role: ButtonRole? = nil,
        isDisabled: Bool = false,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.role = role
        self.isDisabled = isDisabled
        self.action = action
    }

    var body: some View {
        Button(role: role, action: action) {
            Label(title, systemImage: systemImage)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
        }
        .disabled(isDisabled)
    }
}
