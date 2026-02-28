import Foundation

/// A named set of conditions appended to the sentence-generation prompt.
struct PromptPreset: Codable, Identifiable, Equatable {
    let id: UUID
    var name: String
    var conditions: String
    let isBuiltIn: Bool

    init(id: UUID = UUID(), name: String, conditions: String, isBuiltIn: Bool = false) {
        self.id = id
        self.name = name
        self.conditions = conditions
        self.isBuiltIn = isBuiltIn
    }
}

extension PromptPreset {
    /// The five built-in presets shipped with the app.
    /// UUIDs are hardcoded and must never change after shipping.
    static let builtIns: [PromptPreset] = [
        PromptPreset(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
            name: "一般",
            conditions: """
            条件：
            - 日常会話、ビジネス、学習など多様なシーンの例文を含めてください
            - カテゴリは「日常会話」「ビジネス」「学習・教育」「趣味・娯楽」「旅行」などから適切なものを選んでください
            - 自然で実用的な例文にしてください
            - 日本語訳は自然な日本語にしてください
            """,
            isBuiltIn: true
        ),
        PromptPreset(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!,
            name: "ビジネス",
            conditions: """
            条件：
            - ビジネスシーンで使える例文を生成してください
            - カテゴリは「会議」「メール」「プレゼン」「交渉」「報告」などから適切なものを選んでください
            - フォーマルで丁寧な表現を使ってください
            - 日本語訳は自然なビジネス日本語にしてください
            """,
            isBuiltIn: true
        ),
        PromptPreset(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000003")!,
            name: "旅行",
            conditions: """
            条件：
            - 旅行シーンで使える例文を生成してください
            - カテゴリは「空港」「ホテル」「レストラン」「観光」「交通」などから適切なものを選んでください
            - 実際に旅行先で使える実用的な表現を使ってください
            - 日本語訳は自然な日本語にしてください
            """,
            isBuiltIn: true
        ),
        PromptPreset(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000004")!,
            name: "学術",
            conditions: """
            条件：
            - 学術・教育シーンで使える例文を生成してください
            - カテゴリは「論文」「講義」「研究」「議論」「発表」などから適切なものを選んでください
            - アカデミックな文体で書いてください
            - 日本語訳は自然な学術日本語にしてください
            """,
            isBuiltIn: true
        ),
        PromptPreset(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000005")!,
            name: "カジュアル",
            conditions: """
            条件：
            - 友人や家族との日常会話で使える例文を生成してください
            - カテゴリは「友人との会話」「SNS」「趣味」「娯楽」「食事」などから適切なものを選んでください
            - くだけた自然な表現を使ってください
            - 日本語訳は自然な口語日本語にしてください
            """,
            isBuiltIn: true
        )
    ]

    /// Convenience accessor for the default (general) preset.
    static var general: PromptPreset { builtIns[0] }
}
