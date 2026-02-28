import Foundation
import Security

/// Service for securely storing and retrieving API keys from the iOS Keychain.
///
/// The Keychain provides encrypted storage that persists across app launches and
/// is protected by the device's security features. Keys stored here are:
/// - Encrypted at rest
/// - Accessible only when the device is unlocked
/// - Not included in unencrypted backups
///
/// ## Usage
/// ```swift
/// // Save an API key
/// KeychainService.shared.save(key: "sk-...", for: .openAI)
///
/// // Retrieve an API key
/// if let key = KeychainService.shared.retrieve(for: .openAI) {
///     // Use the key
/// }
///
/// // Delete an API key
/// KeychainService.shared.delete(for: .openAI)
/// ```
final class KeychainService {
    /// The shared singleton instance.
    static let shared = KeychainService()

    /// Keychain item identifiers for API keys.
    enum KeyType: String {
        case openAI = "com.englishlearnapp.openai-api-key"
    }

    private init() {}

    // MARK: - Public Methods

    /// Saves an API key to the Keychain.
    ///
    /// If a key already exists for the specified type, it will be updated.
    ///
    /// - Parameters:
    ///   - key: The API key string to store
    ///   - keyType: The type of key being stored
    /// - Returns: `true` if the save was successful, `false` otherwise
    @discardableResult
    func save(key: String, for keyType: KeyType) -> Bool {
        guard let data = key.data(using: .utf8) else { return false }

        // First, try to delete any existing item
        delete(for: keyType)

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keyType.rawValue,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    /// Retrieves an API key from the Keychain.
    ///
    /// - Parameter keyType: The type of key to retrieve
    /// - Returns: The API key string if found, `nil` otherwise
    func retrieve(for keyType: KeyType) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keyType.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess,
              let data = result as? Data,
              let key = String(data: data, encoding: .utf8) else {
            return nil
        }

        return key
    }

    /// Deletes an API key from the Keychain.
    ///
    /// - Parameter keyType: The type of key to delete
    /// - Returns: `true` if the deletion was successful or the item didn't exist, `false` on error
    @discardableResult
    func delete(for keyType: KeyType) -> Bool {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: keyType.rawValue
        ]

        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    /// Checks if an API key exists in the Keychain.
    ///
    /// - Parameter keyType: The type of key to check
    /// - Returns: `true` if a key exists, `false` otherwise
    func exists(for keyType: KeyType) -> Bool {
        retrieve(for: keyType) != nil
    }
}
