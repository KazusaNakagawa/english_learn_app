import Foundation

enum Tab: Int, CaseIterable, Identifiable {
    case learn = 0
    case archive = 1
    case add = 2
    case trash = 3
    case settings = 4

    var id: Int { rawValue }

    var icon: String {
        switch self {
        case .learn:    "books.vertical.fill"
        case .archive:  "archivebox.fill"
        case .add:      "plus"
        case .trash:    "trash.fill"
        case .settings: "gearshape.fill"
        }
    }

    var label: String {
        switch self {
        case .learn:    "学習"
        case .archive:  "アーカイブ"
        case .add:      "追加"
        case .trash:    "ゴミ箱"
        case .settings: "設定"
        }
    }
}
