import Foundation

/// A service class that generates example sentences using the OpenAI API.
///
/// This class calls the OpenAI Chat Completions API to automatically generate
/// example sentences for a given English word.
///
/// ## Usage
/// ```swift
/// let service = OpenAIService()
/// let sentences = try await service.generateSentences(for: "rarity", meaning: "珍しさ")
/// ```
///
/// - Note: You must set `SettingsManager.shared.openAIAPIKey` before using this service.
class OpenAIService: ObservableObject {
    /// Indicates whether sentence generation is in progress.
    @Published var isLoading = false

    /// The most recent error message, or nil if no error occurred.
    @Published var errorMessage: String?

    /// The OpenAI API endpoint URL.
    private let endpoint = "https://api.openai.com/v1/chat/completions"

    // MARK: - API Request/Response Models

    /// The request body for the OpenAI API.
    struct OpenAIRequest: Codable {
        let model: String
        let messages: [Message]
        let response_format: ResponseFormat

        /// A chat message.
        struct Message: Codable {
            let role: String
            let content: String
        }

        /// The response format specification.
        struct ResponseFormat: Codable {
            let type: String
        }
    }

    /// The response from the OpenAI API.
    struct OpenAIResponse: Codable {
        let choices: [Choice]

        struct Choice: Codable {
            let message: MessageContent
        }

        struct MessageContent: Codable {
            let content: String
        }
    }

    /// The JSON structure of generated sentences returned by the API.
    struct GeneratedSentences: Codable {
        let sentences: [GeneratedSentence]

        struct GeneratedSentence: Codable {
            let english: String
            let japanese: String
            let category: String
        }
    }

    // MARK: - Public Methods

    /// Generates example sentences for the specified word.
    ///
    /// Calls the OpenAI API to generate example sentences using the specified English word.
    /// Each generated sentence includes an English sentence, Japanese translation, and category.
    ///
    /// - Parameters:
    ///   - word: The English word to include in the example sentences.
    ///   - meaning: The Japanese meaning of the word (used as context for the prompt).
    ///   - count: The number of sentences to generate (default: 20).
    /// - Returns: An array of generated `Sentence` objects.
    /// - Throws: `OpenAIError` for missing API key, network errors, or parsing failures.
    func generateSentences(for word: String, meaning: String, count: Int = 20) async throws -> [Sentence] {
        guard let apiKey = SettingsManager.shared.openAIAPIKey, !apiKey.isEmpty else {
            throw OpenAIError.missingAPIKey
        }

        await MainActor.run {
            isLoading = true
            errorMessage = nil
        }

        defer {
            Task { @MainActor in
                isLoading = false
            }
        }

        let systemPrompt = """
        あなたは英語学習アプリ用の例文を生成するアシスタントです。
        与えられた英単語を使った自然な例文を生成してください。
        以下の形式のJSON形式で返答してください：
        {
          "sentences": [
            {
              "english": "英文",
              "japanese": "日本語訳",
              "category": "カテゴリ"
            }
          ]
        }
        """

        let userPrompt = """
        「\(word)」（\(meaning)）を使った例文を\(count)個生成してください。

        条件：
        - 日常会話、ビジネス、学習など多様なシーンの例文を含めてください
        - カテゴリは「日常会話」「ビジネス」「学習・教育」「趣味・娯楽」「旅行」などから適切なものを選んでください
        - 自然で実用的な例文にしてください
        - 日本語訳は自然な日本語にしてください
        """

        let request = OpenAIRequest(
            model: "gpt-4o-mini",
            messages: [
                OpenAIRequest.Message(role: "system", content: systemPrompt),
                OpenAIRequest.Message(role: "user", content: userPrompt)
            ],
            response_format: OpenAIRequest.ResponseFormat(type: "json_object")
        )

        var urlRequest = URLRequest(url: URL(string: endpoint)!)
        urlRequest.httpMethod = "POST"
        urlRequest.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.httpBody = try JSONEncoder().encode(request)

        let (data, response) = try await URLSession.shared.data(for: urlRequest)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw OpenAIError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            if let errorBody = String(data: data, encoding: .utf8) {
                print("OpenAI API Error: \(errorBody)")
            }
            throw OpenAIError.apiError(statusCode: httpResponse.statusCode)
        }

        let openAIResponse = try JSONDecoder().decode(OpenAIResponse.self, from: data)

        guard let content = openAIResponse.choices.first?.message.content else {
            throw OpenAIError.noContent
        }

        guard let contentData = content.data(using: .utf8) else {
            throw OpenAIError.invalidJSON
        }

        let generatedSentences = try JSONDecoder().decode(GeneratedSentences.self, from: contentData)

        return generatedSentences.sentences.map { generated in
            Sentence(
                english: generated.english,
                japanese: generated.japanese,
                category: generated.category
            )
        }
    }

    // MARK: - Error Types

    /// Errors that can occur in the OpenAI service.
    enum OpenAIError: LocalizedError {
        /// The API key is not configured.
        case missingAPIKey
        /// Received an invalid response.
        case invalidResponse
        /// The API returned an error.
        case apiError(statusCode: Int)
        /// The response contains no content.
        case noContent
        /// Failed to parse JSON.
        case invalidJSON

        var errorDescription: String? {
            switch self {
            case .missingAPIKey:
                return "OpenAI APIキーが設定されていません。設定画面でAPIキーを入力してください。"
            case .invalidResponse:
                return "無効なレスポンスを受信しました。"
            case .apiError(let statusCode):
                return "API エラー (ステータスコード: \(statusCode))"
            case .noContent:
                return "レスポンスにコンテンツが含まれていません。"
            case .invalidJSON:
                return "JSONの解析に失敗しました。"
            }
        }
    }
}
