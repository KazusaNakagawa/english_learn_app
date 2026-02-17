import Foundation

/// A service class that generates example sentences using the OpenAI API.
///
/// This class calls the OpenAI Chat Completions API to automatically generate
/// example sentences for a given English word.
///
/// ## Usage
/// ```swift
/// let service = OpenAIService()
/// let content = try await service.generateContent(for: "rarity")
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

    /// The JSON structure returned by the API, including meaning, phonetic, and sentences.
    struct GeneratedContent: Codable {
        let meaning: String
        let phonetic: String
        let sentences: [GeneratedSentence]

        struct GeneratedSentence: Codable {
            let english: String
            let japanese: String
            let category: String
        }
    }

    // MARK: - Public Methods

    /// Generates meaning, phonetic transcription, and example sentences for the specified word.
    ///
    /// Calls the OpenAI API with a single request that returns the Japanese meaning,
    /// IPA phonetic notation, and example sentences for the given English word.
    ///
    /// - Parameters:
    ///   - word: The English word to look up and generate sentences for.
    ///   - count: The number of sentences to generate (default: 20).
    ///   - conditions: The prompt conditions to use. If nil, uses the active preset's conditions.
    /// - Returns: A `GeneratedContent` containing meaning, phonetic, and sentences.
    /// - Throws: `OpenAIError` for missing API key, network errors, or parsing failures.
    func generateContent(for word: String, count: Int = 20, conditions: String? = nil) async throws -> GeneratedContent {
        guard let apiKey = SettingsManager.shared.openAIAPIKey, !apiKey.isEmpty else {
            throw OpenAIError.missingAPIKey
        }

        await MainActor.run {
            isLoading = true
            errorMessage = nil
        }

        let resolvedConditions = conditions ?? SettingsManager.shared.activeConditions

        let systemPrompt = """
        あなたは英語学習アプリ用のアシスタントです。
        与えられた英単語について、日本語の意味・IPA発音記号・自然な例文を生成してください。
        以下の形式のJSON形式で返答してください：
        {
          "meaning": "日本語の意味（簡潔に）",
          "phonetic": "/IPA発音記号/",
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
        「\(word)」の意味・発音記号・例文を\(count)個生成してください。

        \(resolvedConditions)
        """

        let request = OpenAIRequest(
            model: SettingsManager.shared.openAIModel.rawValue,
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

        do {
            let (data, response) = try await URLSession.shared.data(for: urlRequest)

            guard let httpResponse = response as? HTTPURLResponse else {
                await MainActor.run { isLoading = false }
                throw OpenAIError.invalidResponse
            }

            guard httpResponse.statusCode == 200 else {
                if let errorBody = String(data: data, encoding: .utf8) {
                    print("OpenAI API Error: \(errorBody)")
                }
                await MainActor.run { isLoading = false }
                throw OpenAIError.apiError(statusCode: httpResponse.statusCode)
            }

            let openAIResponse = try JSONDecoder().decode(OpenAIResponse.self, from: data)

            guard let content = openAIResponse.choices.first?.message.content else {
                await MainActor.run { isLoading = false }
                throw OpenAIError.noContent
            }

            guard let contentData = content.data(using: .utf8) else {
                await MainActor.run { isLoading = false }
                throw OpenAIError.invalidJSON
            }

            let generatedContent = try JSONDecoder().decode(GeneratedContent.self, from: contentData)

            await MainActor.run { isLoading = false }

            return generatedContent
        } catch {
            await MainActor.run { isLoading = false }
            throw error
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
