import Foundation

// MARK: - Import Errors

/// Error types that can occur during word list import.
enum WordImportError: LocalizedError {
    case fileNotReadable(String)
    case invalidJSONFormat(String)
    case missingRequiredFields(String)
    case invalidUUID(String, path: String)
    case emptyWordList
    case unknown(Error)

    var errorDescription: String? {
        switch self {
        case .fileNotReadable(let detail):
            return "ファイルの読み込みエラー\n\n\(detail)"
        case .invalidJSONFormat(let detail):
            return "JSON形式のエラー\n\n\(detail)\n\n正しいエクスポートファイルか確認してください。"
        case .missingRequiredFields(let detail):
            return "データ形式のエラー\n\n\(detail)\n\n必須フィールドが不足しています。"
        case .invalidUUID(let uuidString, let path):
            return "UUID形式のエラー\n\n無効なUUID: \"\(uuidString)\"\n場所: \(path)\n\nUUIDは「XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX」の形式で、0-9とA-Fのみを含む必要があります。\n\n修正方法:\n• 無効な文字（G-Z、記号など）を削除\n• または新しいUUIDを生成（uuidgenコマンド）"
        case .emptyWordList:
            return "インポートエラー\n\nファイルに単語データが含まれていません。"
        case .unknown(let error):
            return "予期しないエラー\n\n\(error.localizedDescription)"
        }
    }
}

// MARK: - Import Error Handler

/// Helper for converting decoding errors into user-friendly import errors.
enum ImportErrorHandler {

    /// Converts file read errors into WordImportError.
    static func handleFileReadError(_ error: Error) -> WordImportError {
        let nsError = error as NSError
        switch nsError.code {
        case NSFileReadNoSuchFileError:
            return .fileNotReadable("ファイルが見つかりません。")
        case NSFileReadNoPermissionError:
            return .fileNotReadable("ファイルへのアクセス権限がありません。")
        default:
            return .fileNotReadable(error.localizedDescription)
        }
    }

    /// Converts decoding errors into WordImportError with detailed context.
    static func handleDecodingError(_ error: Error, data: Data) -> WordImportError {
        guard let decodingError = error as? DecodingError else {
            return .unknown(error)
        }

        switch decodingError {
        case .dataCorrupted(let context):
            return handleDataCorrupted(context, data: data)
        case .keyNotFound(let key, let context):
            return handleKeyNotFound(key, context: context)
        case .typeMismatch(let type, let context):
            return handleTypeMismatch(type, context: context, data: data)
        case .valueNotFound(let type, let context):
            return handleValueNotFound(type, context: context)
        @unknown default:
            return .unknown(error)
        }
    }

    // MARK: - Specific Error Handlers

    private static func handleDataCorrupted(_ context: DecodingError.Context, data: Data) -> WordImportError {
        let description = context.debugDescription

        // Check for UUID-specific corruption
        if description.contains("UUID") {
            return handleUUIDError(context: context, data: data)
        }

        return .invalidJSONFormat("JSONファイルが破損しています。\n\(description)")
    }

    private static func handleKeyNotFound(_ key: CodingKey, context: DecodingError.Context) -> WordImportError {
        let path = formatPath(context.codingPath)
        return .missingRequiredFields("必須キー '\(key.stringValue)' が見つかりません。\nパス: \(path)")
    }

    private static func handleTypeMismatch(_ type: Any.Type, context: DecodingError.Context, data: Data) -> WordImportError {
        let path = formatPath(context.codingPath)

        // Check for UUID type mismatch
        if type == UUID.self {
            return handleUUIDError(context: context, data: data)
        }

        return .invalidJSONFormat("型が一致しません。'\(type)' が期待されています。\nパス: \(path)")
    }

    private static func handleValueNotFound(_ type: Any.Type, context: DecodingError.Context) -> WordImportError {
        let path = formatPath(context.codingPath)
        return .missingRequiredFields("値が見つかりません。'\(type)' が期待されています。\nパス: \(path)")
    }

    // MARK: - UUID Error Handling

    private static func handleUUIDError(context: DecodingError.Context, data: Data) -> WordImportError {
        let path = formatPath(context.codingPath)

        // Try to extract the invalid UUID value
        if let jsonObject = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let invalidValue = JSONPathExtractor.extractValue(from: jsonObject, path: context.codingPath) {
            return .invalidUUID("\(invalidValue)", path: path.isEmpty ? "id" : path)
        }

        return .invalidUUID("(取得できませんでした)", path: path.isEmpty ? "id" : path)
    }

    // MARK: - Path Formatting

    private static func formatPath(_ codingPath: [CodingKey]) -> String {
        codingPath.map { $0.stringValue }.joined(separator: " → ")
    }
}

// MARK: - JSON Path Extractor

/// Helper for extracting values from JSON objects using a coding path.
enum JSONPathExtractor {

    /// Extracts a value from a JSON object by following a coding path.
    static func extractValue(from json: Any, path: [CodingKey]) -> Any? {
        var current: Any = json

        for key in path {
            if let dict = current as? [String: Any] {
                guard let next = dict[key.stringValue] else { return nil }
                current = next
            } else if let array = current as? [Any], let index = key.intValue {
                guard index < array.count else { return nil }
                current = array[index]
            } else {
                return nil
            }
        }

        return current
    }
}
