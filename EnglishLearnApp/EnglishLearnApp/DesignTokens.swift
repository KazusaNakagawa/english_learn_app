import SwiftUI

// MARK: - Theme

enum Theme: String, CaseIterable {
    case light, dark, music

    var displayName: String {
        switch self {
        case .light: "Light"
        case .dark:  "Dark"
        case .music: "Music"
        }
    }

    /// The active theme, read from / written to SettingsManager.
    static var current: Theme {
        get { SettingsManager.shared.theme }
        set { SettingsManager.shared.theme = newValue }
    }
}

// MARK: - Semantic color container

struct DSColor {
    let light: Color
    let dark: Color
    let music: Color

    func resolved(for theme: Theme) -> Color {
        switch theme {
        case .light: return light
        case .dark:  return dark
        case .music: return music
        }
    }
}

// MARK: - Tokens

enum Tokens {

    // MARK: Color
    enum Colors {
        static let bg      = DSColor(
            light: .init(hex: "F2F2F7"),
            dark:  .init(hex: "1C1C1E"),
            music: .init(hex: "121212")
        )
        static let card    = DSColor(
            light: .white,
            dark:  .init(hex: "2C2C2E"),
            music: .init(hex: "181818")
        )
        static let border  = DSColor(
            light: .init(hex: "E5E5EA"),
            dark:  .white.opacity(0.08),
            music: .white.opacity(0.06)
        )
        static let text    = DSColor(
            light: .init(hex: "1C1C1E"),
            dark:  .white,
            music: .white
        )
        static let subtext = DSColor(
            light: .init(hex: "8E8E93"),
            dark:  .init(hex: "AEAEB2"),
            music: .init(hex: "B3B3B3")
        )
        static let accent  = DSColor(
            light: .init(hex: "007AFF"),
            dark:  .init(hex: "0A84FF"),
            music: .init(hex: "1ECB5C")
        )
        static let success = DSColor(
            light: .init(hex: "34C759"),
            dark:  .init(hex: "30D158"),
            music: .init(hex: "1ECB5C")
        )
        static let warning = DSColor(
            light: .init(hex: "FF9500"),
            dark:  .init(hex: "FF9F0A"),
            music: .init(hex: "FF9F0A")
        )
        static let danger  = DSColor(
            light: .init(hex: "FF3B30"),
            dark:  .init(hex: "FF453A"),
            music: .init(hex: "FF453A")
        )
        static let coverFallback = DSColor(
            light: .init(hex: "C7C7CC"),
            dark:  .init(hex: "3A3A3C"),
            music: .init(hex: "282828")
        )
    }

    // MARK: Typography
    enum Typography {
        static let largeTitle = Font.system(size: 34, weight: .bold)
        static let title      = Font.system(size: 22, weight: .semibold)
        static let body       = Font.system(size: 17, weight: .regular)
        static let caption    = Font.system(size: 12, weight: .regular)
        static let mono       = Font.system(size: 15, weight: .medium, design: .monospaced)
    }

    // MARK: Spacing
    enum Spacing {
        static let xs:   CGFloat = 4
        static let sm:   CGFloat = 8
        static let md:   CGFloat = 12
        static let lg:   CGFloat = 16
        static let xl20: CGFloat = 20
        static let xl:   CGFloat = 24
        static let xxl:  CGFloat = 32
    }

    // MARK: Radius
    enum Radius {
        static let sm:   CGFloat = 6
        static let md:   CGFloat = 12
        static let lg:   CGFloat = 16
        static let pill: CGFloat = 999
    }

    // MARK: Shadow
    enum Shadow {
        struct Config {
            let color: Color
            let radius: CGFloat
            let x: CGFloat
            let y: CGFloat
        }
        static let card     = Config(color: Color.black.opacity(0.20), radius: 12, x: 0, y: 4)
        static let mini     = Config(color: Color.black.opacity(0.15), radius: 8,  x: 0, y: 2)
        static let expanded = Config(color: Color.black.opacity(0.30), radius: 24, x: 0, y: 8)
    }
}

// MARK: - Color extensions

extension Color {
    /// Creates a `Color` from a 6-character hex string (e.g. `"1C1C1E"`).
    /// Falls back to black for any malformed input.
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: .alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let r = Double((int >> 16) & 0xFF) / 255
        let g = Double((int >> 8)  & 0xFF) / 255
        let b = Double( int        & 0xFF) / 255
        self.init(red: r, green: g, blue: b)
    }

    /// Resolves a semantic color token for the current theme.
    ///
    /// **Reactivity:** reads `Theme.current` at call time. To re-render on theme change,
    /// call this inside a view body that observes `SettingsManager.shared` (e.g. via
    /// `@EnvironmentObject`), or derive the color inside a `@ViewBuilder` context that
    /// re-evaluates when `SettingsManager` publishes a change.
    ///
    /// Usage inside a view body (re-evaluated on theme change):
    /// ```swift
    /// .foregroundStyle(Color.token(\.accent))
    /// ```
    static func token(_ kp: KeyPath<Tokens.Colors.Type, DSColor>) -> Color {
        Tokens.Colors.self[keyPath: kp].resolved(for: Theme.current)
    }
}

// MARK: - View extension

extension View {
    /// Applies a design-system shadow preset.
    func shadow(_ config: Tokens.Shadow.Config) -> some View {
        shadow(color: config.color, radius: config.radius, x: config.x, y: config.y)
    }
}

// MARK: - Swatch preview

#Preview("Design Tokens") {
    @Previewable @State var theme: Theme = .dark

    let colorTokens: [(String, KeyPath<Tokens.Colors.Type, DSColor>)] = [
        ("bg",           \.bg),
        ("card",         \.card),
        ("border",       \.border),
        ("text",         \.text),
        ("subtext",      \.subtext),
        ("accent",       \.accent),
        ("success",      \.success),
        ("warning",      \.warning),
        ("danger",       \.danger),
        ("coverFallback",\.coverFallback),
    ]

    ScrollView {
        VStack(alignment: .leading, spacing: Tokens.Spacing.md) {
            // Theme picker
            Picker("Theme", selection: $theme) {
                ForEach(Theme.allCases, id: \.self) { t in
                    Text(t.displayName).tag(t)
                }
            }
            .pickerStyle(.segmented)
            .padding(.bottom, Tokens.Spacing.sm)

            // Color swatches
            Text("Colors").font(Tokens.Typography.title)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140))], spacing: Tokens.Spacing.sm) {
                ForEach(colorTokens, id: \.0) { name, kp in
                    let color = Tokens.Colors.self[keyPath: kp].resolved(for: theme)
                    HStack(spacing: Tokens.Spacing.sm) {
                        RoundedRectangle(cornerRadius: Tokens.Radius.sm)
                            .fill(color)
                            .frame(width: 36, height: 36)
                            .overlay(
                                RoundedRectangle(cornerRadius: Tokens.Radius.sm)
                                    .stroke(Color.gray.opacity(0.3), lineWidth: 0.5)
                            )
                        Text(name).font(Tokens.Typography.caption)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }

            Divider()

            // Typography
            Text("Typography").font(Tokens.Typography.title)
            VStack(alignment: .leading, spacing: Tokens.Spacing.xs) {
                Text("largeTitle").font(Tokens.Typography.largeTitle)
                Text("title").font(Tokens.Typography.title)
                Text("body").font(Tokens.Typography.body)
                Text("caption").font(Tokens.Typography.caption)
                Text("mono 42").font(Tokens.Typography.mono)
            }

            Divider()

            // Spacing
            Text("Spacing").font(Tokens.Typography.title)
            ForEach([("xs", Tokens.Spacing.xs), ("sm", Tokens.Spacing.sm),
                     ("md", Tokens.Spacing.md), ("lg", Tokens.Spacing.lg),
                     ("xl20", Tokens.Spacing.xl20), ("xl", Tokens.Spacing.xl),
                     ("xxl", Tokens.Spacing.xxl)],
                    id: \.0) { name, value in
                HStack(spacing: Tokens.Spacing.sm) {
                    Rectangle()
                        .fill(Color.blue.opacity(0.5))
                        .frame(width: value, height: 16)
                    Text("\(name) \(Int(value))pt").font(Tokens.Typography.caption)
                }
            }

            Divider()

            // Radii
            Text("Radii").font(Tokens.Typography.title)
            HStack(spacing: Tokens.Spacing.md) {
                ForEach([("sm", Tokens.Radius.sm), ("md", Tokens.Radius.md),
                         ("lg", Tokens.Radius.lg)], id: \.0) { name, r in
                    VStack {
                        RoundedRectangle(cornerRadius: r)
                            .fill(Color.blue.opacity(0.3))
                            .frame(width: 60, height: 60)
                        Text(name).font(Tokens.Typography.caption)
                    }
                }
            }
        }
        .padding(Tokens.Spacing.lg)
    }
    .background(Tokens.Colors.bg.resolved(for: theme))
    .foregroundStyle(Tokens.Colors.text.resolved(for: theme))
    .onChange(of: theme) { _, newTheme in
        Theme.current = newTheme
    }
}

#Preview("Token API") {
    // Exercises Color.token(_:) singleton path — verifies reactivity wiring compiles.
    @Previewable @State var theme: Theme = .dark

    VStack(spacing: Tokens.Spacing.md) {
        Text("accent via Color.token")
            .foregroundStyle(Color.token(\.accent))
            .padding(Tokens.Spacing.md)
            .background(Color.token(\.card))
            .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.md))

        Text("danger via Color.token")
            .foregroundStyle(Color.token(\.danger))
            .padding(Tokens.Spacing.md)
            .background(Color.token(\.card))
            .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.md))

        Picker("Theme", selection: $theme) {
            ForEach(Theme.allCases, id: \.self) { Text($0.displayName).tag($0) }
        }
        .pickerStyle(.segmented)
    }
    .padding(Tokens.Spacing.lg)
    .background(Color.token(\.bg))
    .onChange(of: theme) { _, newTheme in Theme.current = newTheme }
}
