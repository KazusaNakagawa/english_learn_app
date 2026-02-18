import SwiftUI

/// Presents a `UIActivityViewController` share sheet from within a SwiftUI view hierarchy.
///
/// Embed this in a `.background()` modifier rather than a `.sheet()`.
/// Hosting `UIActivityViewController` inside a SwiftUI `.sheet()` causes a black screen
/// because the two presentation layers conflict.
///
/// ## Usage
/// ```swift
/// .background {
///     if let url = exportURL {
///         ActivityPresenter(activityItems: [url], isPresented: $showShareSheet) {
///             exportURL = nil   // clear so the presenter is removed from the tree
///         }
///     }
/// }
/// ```
struct ActivityPresenter: UIViewControllerRepresentable {
    let activityItems: [Any]
    @Binding var isPresented: Bool
    /// Called on the main thread after the share sheet dismisses.
    var onDismiss: (() -> Void)? = nil

    func makeUIViewController(context: Context) -> UIViewController {
        UIViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        guard isPresented else {
            // Dismiss if the binding is cleared programmatically from outside.
            if uiViewController.presentedViewController is UIActivityViewController {
                uiViewController.dismiss(animated: true)
            }
            return
        }
        guard uiViewController.presentedViewController == nil else { return }
        let vc = UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
        // iPad requires a source view/rect; without it the app crashes.
        if let popover = vc.popoverPresentationController {
            popover.sourceView = uiViewController.view
            popover.sourceRect = CGRect(
                x: uiViewController.view.bounds.midX,
                y: uiViewController.view.bounds.midY,
                width: 0,
                height: 0
            )
            popover.permittedArrowDirections = []
        }
        vc.completionWithItemsHandler = { [onDismiss] _, _, _, _ in
            isPresented = false
            onDismiss?()
        }
        uiViewController.present(vc, animated: true)
    }
}
