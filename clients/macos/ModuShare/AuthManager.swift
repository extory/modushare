import Foundation
import Security

// MARK: – Keychain helpers

private enum Keychain {
    static let service = "com.modushare.app"

    static func save(key: String, value: String) {
        let data = Data(value.utf8)
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]
        SecItemDelete(query as CFDictionary)
        var attrs = query
        attrs[kSecValueData] = data
        SecItemAdd(attrs as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: – Response types

struct LoginResponse: Decodable {
    let accessToken: String
    let user: UserDTO
}

struct UserDTO: Decodable {
    let id: String
    let username: String
    let email: String
    let syncEnabled: Bool
}

struct RefreshResponse: Decodable {
    let accessToken: String
}

// MARK: – AuthManager

@MainActor
class AuthManager {
    static let shared = AuthManager()
    private init() {}

    private let defaults = UserDefaults.standard

    // ── Token access ──────────────────────────────────────────────────────────

    var accessToken: String? {
        get { Keychain.load(key: "access_token") }
        set {
            if let v = newValue { Keychain.save(key: "access_token", value: v) }
            else { Keychain.delete(key: "access_token") }
        }
    }

    var isAuthenticated: Bool { accessToken != nil && !(accessToken!.isEmpty) }

    // ── Server URL ────────────────────────────────────────────────────────────

    var serverURL: String {
        get { defaults.string(forKey: "serverURL") ?? "http://localhost:3010" }
        set { defaults.set(newValue, forKey: "serverURL") }
    }

    // ── Login ─────────────────────────────────────────────────────────────────

    func login(email: String, password: String) async throws -> UserDTO {
        guard let url = URL(string: "\(serverURL)/auth/login") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["email": email, "password": password])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            let errorBody = try? JSONDecoder().decode([String: String].self, from: data)
            throw NSError(domain: "AuthError", code: 401,
                          userInfo: [NSLocalizedDescriptionKey: errorBody?["error"] ?? "Login failed"])
        }

        let result = try JSONDecoder().decode(LoginResponse.self, from: data)
        accessToken = result.accessToken
        return result.user
    }

    // ── Token refresh ─────────────────────────────────────────────────────────

    func refreshToken() async throws {
        guard let url = URL(string: "\(serverURL)/auth/refresh") else {
            throw URLError(.badURL)
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            accessToken = nil
            throw NSError(domain: "AuthError", code: 401,
                          userInfo: [NSLocalizedDescriptionKey: "Token refresh failed"])
        }

        let result = try JSONDecoder().decode(RefreshResponse.self, from: data)
        accessToken = result.accessToken
    }

    // ── Google Login ──────────────────────────────────────────────────────────

    /// GoogleAuthHelper가 이미 서버와 통신해서 토큰을 받아왔으므로 저장만 합니다.
    func setTokenFromGoogle(_ token: String) {
        accessToken = token
    }

    /// LoginViewController에서 호출 — GoogleAuthHelper가 내부적으로 처리하므로 여기선 단순 래퍼
    func loginWithGoogle(credential: String) async throws -> UserDTO {
        // credential은 accessToken (GoogleAuthHelper에서 이미 서버 호출 완료)
        // accessToken은 setTokenFromGoogle에서 저장됨
        guard let url = URL(string: "\(serverURL)/auth/me") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(credential)", forHTTPHeaderField: "Authorization")
        let (data, _) = try await URLSession.shared.data(for: req)
        return try JSONDecoder().decode(UserDTO.self, from: data)
    }

    // ── Logout ────────────────────────────────────────────────────────────────

    func logout() async {
        if let token = accessToken,
           let url = URL(string: "\(serverURL)/auth/logout") {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            try? await URLSession.shared.data(for: request)
        }
        accessToken = nil
    }
}
