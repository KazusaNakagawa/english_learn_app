import SwiftUI

/// Presents a `UIActivityViewController` share sheet from within a SwiftUI view hierarchy.
///
/// Embed this in a `.background()` modifier rather than a `.sheet()`.
/// Hosting `UIActivityViewController` inside a SwiftUI `.sheet()` causes a black screen
/// because the two presentation layers conflict.
///
/// ## Usage
/// ```swift
/// .background(
///     Group {
///         if let url = exportURL {
///             ActivityPresenter(activityItems: [url], isPresented: $showShareSheet)
///         }
///     }
/// )
/// ```
struct ActivityPresenter: UIViewControllerRepresentable {
    let activityItems: [Any]
    @Binding var isPresented: Bool

    func makeUIViewController(context: Context) -> UIViewController {
        UIViewController()
    }

    func updateUIViewController(_ uiViewController: UIViewController, context: Context) {
        guard isPresented, uiViewController.presentedViewController == nil else { return }
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
        vc.completionWithItemsHandler = { _, _, _, _ in
            isPresented = false
        }
        uiViewController.present(vc, animated: true)
    }
}
