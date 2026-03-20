import Cocoa
import WebKit
import Network

// MARK: – Google Auth Helper
// Authorization Code Flow:
//   1. 임시 로컬 포트 열기
//   2. WKWebView로 Google 인증 팝업
//   3. redirect_uri = http://127.0.0.1:{port} 로 code 수신
//   4. 서버 /auth/google 에 code + redirectUri 전달 → accessToken 획득

enum GoogleAuthError: LocalizedError {
    case serverNotConfigured
    case cancelled
    case noCode
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .serverNotConfigured: return "Google 로그인이 서버에서 설정되지 않았습니다."
        case .cancelled:           return "Google 로그인이 취소됐습니다."
        case .noCode:              return "인증 코드를 받지 못했습니다."
        case .serverError(let m):  return m
        }
    }
}

@MainActor
class GoogleAuthHelper: NSObject {

    private static var authWindow: NSWindow?
    private static var localServer: LocalHTTPServer?
    private static var continuation: CheckedContinuation<String, Error>?

    static func signIn(serverURL: String) async throws -> String {
        // 1. 서버에서 Google Client ID 가져오기
        guard let infoURL = URL(string: "\(serverURL)/auth/google-client-id") else {
            throw GoogleAuthError.serverNotConfigured
        }
        let (infoData, _) = try await URLSession.shared.data(from: infoURL)
        struct ClientIDResp: Decodable { let googleClientId: String? }
        let idResp = try JSONDecoder().decode(ClientIDResp.self, from: infoData)
        guard let clientId = idResp.googleClientId, !clientId.isEmpty else {
            throw GoogleAuthError.serverNotConfigured
        }

        // 2. 고정 포트로 로컬 HTTP 서버 시작
        let fixedPort = 9842
        let server = LocalHTTPServer()
        try server.start(port: fixedPort)
        self.localServer = server
        let redirectUri = "http://127.0.0.1:\(fixedPort)"

        // 3. Google 인증 URL
        var comps = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        comps.queryItems = [
            .init(name: "client_id",     value: clientId),
            .init(name: "redirect_uri",  value: redirectUri),
            .init(name: "response_type", value: "code"),
            .init(name: "scope",         value: "openid email profile"),
            .init(name: "access_type",   value: "online"),
            .init(name: "prompt",        value: "select_account"),
        ]
        guard let authURL = comps.url else { throw GoogleAuthError.noCode }

        // 4. WKWebView 팝업
        return try await withCheckedThrowingContinuation { cont in
            self.continuation = cont

            server.onCode = { code in
                Task { @MainActor in
                    self.authWindow?.close()
                    self.authWindow = nil
                    self.localServer?.stop()
                    self.localServer = nil
                    await self.exchangeCode(code, redirectUri: redirectUri, serverURL: serverURL)
                }
            }

            let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 480, height: 640))
            webView.load(URLRequest(url: authURL))

            let win = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 480, height: 640),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            win.title = "ModuShare – Google 로그인"
            win.contentView = webView
            win.center()
            win.isReleasedWhenClosed = false
            self.authWindow = win

            // 창 닫기 = 취소
            NotificationCenter.default.addObserver(
                forName: NSWindow.willCloseNotification,
                object: win,
                queue: .main
            ) { _ in
                self.localServer?.stop()
                self.localServer = nil
                if self.continuation != nil {
                    self.continuation?.resume(throwing: GoogleAuthError.cancelled)
                    self.continuation = nil
                }
            }

            win.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    private static func exchangeCode(_ code: String, redirectUri: String, serverURL: String) async {
        do {
            guard let url = URL(string: "\(serverURL)/auth/google") else {
                continuation?.resume(throwing: GoogleAuthError.serverError("잘못된 서버 URL"))
                continuation = nil
                return
            }
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONEncoder().encode(["code": code, "redirectUri": redirectUri])

            let (data, response) = try await URLSession.shared.data(for: req)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                let errBody = try? JSONDecoder().decode([String: String].self, from: data)
                throw GoogleAuthError.serverError(errBody?["error"] ?? "Google 로그인 실패 (\(http.statusCode))")
            }

            struct Resp: Decodable { let accessToken: String }
            let resp = try JSONDecoder().decode(Resp.self, from: data)
            AuthManager.shared.setTokenFromGoogle(resp.accessToken)
            continuation?.resume(returning: resp.accessToken)
            continuation = nil
        } catch {
            continuation?.resume(throwing: error)
            continuation = nil
        }
    }
}

// MARK: – Simple local HTTP server (code 수신용)

class LocalHTTPServer {
    private var serverSocket: Int32 = -1
    var onCode: ((String) -> Void)?

    func start(port: Int) throws {
        serverSocket = socket(AF_INET, SOCK_STREAM, 0)
        guard serverSocket >= 0 else { throw GoogleAuthError.noCode }

        var opt: Int32 = 1
        setsockopt(serverSocket, SOL_SOCKET, SO_REUSEADDR, &opt, socklen_t(MemoryLayout<Int32>.size))

        var addr = sockaddr_in()
        addr.sin_family = UInt8(AF_INET)
        addr.sin_port = UInt16(port).bigEndian
        addr.sin_addr.s_addr = INADDR_ANY

        let bindResult = withUnsafeMutablePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                bind(serverSocket, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        guard bindResult == 0 else { throw GoogleAuthError.noCode }
        guard listen(serverSocket, 1) == 0 else { throw GoogleAuthError.noCode }

        // 백그라운드에서 연결 대기
        let sock = serverSocket
        DispatchQueue.global(qos: .userInitiated).async {
            let clientSocket = accept(sock, nil, nil)
            guard clientSocket >= 0 else { return }
            defer { close(clientSocket) }

            // HTTP 요청 읽기
            var buffer = [UInt8](repeating: 0, count: 4096)
            let bytesRead = recv(clientSocket, &buffer, buffer.count, 0)
            let request = String(bytes: buffer.prefix(bytesRead), encoding: .utf8) ?? ""

            // 응답 전송
            let html = "<html><body><p>로그인 완료. 이 창을 닫아도 됩니다.</p></body></html>"
            let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: \(html.utf8.count)\r\nConnection: close\r\n\r\n\(html)"
            _ = response.withCString { send(clientSocket, $0, strlen($0), 0) }

            // URL에서 code 파라미터 추출
            if let line = request.components(separatedBy: "\r\n").first,
               let path = line.components(separatedBy: " ").dropFirst().first,
               let urlComps = URLComponents(string: "http://localhost\(path)"),
               let code = urlComps.queryItems?.first(where: { $0.name == "code" })?.value {
                DispatchQueue.main.async {
                    self.onCode?(code)
                }
            }
        }
    }

    func stop() {
        if serverSocket >= 0 {
            close(serverSocket)
            serverSocket = -1
        }
    }
}
