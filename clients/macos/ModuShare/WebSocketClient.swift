import Foundation

// MARK: – Message types (mirrors shared/src/messageTypes.ts)

struct WSMessage: Codable {
    let type: String
    var payload: WSPayload?
    let timestamp: TimeInterval
    let deviceId: String
}

struct WSPayload: Codable {
    var contentType: String?
    var content: String?
    var imageData: String?
    var imageUrl: String?
    var itemId: String?
    var sharedWithCount: Int?
    var enabled: Bool?
    var code: String?
    var message: String?
    // CLIENT_HELLO
    var clientVersion: String?
    var platform: String?
    // VERSION_MISMATCH
    var myVersion: String?
    var peerVersion: String?
    var downloadUrl: String?
}

// MARK: – Delegate

protocol WebSocketClientDelegate: AnyObject {
    func webSocketDidConnect(_ client: WebSocketClient)
    func webSocketDidDisconnect(_ client: WebSocketClient, error: Error?)
    func webSocketDidReceive(_ client: WebSocketClient, message: WSMessage)
}

// MARK: – Client

class WebSocketClient: NSObject {

    weak var delegate: WebSocketClientDelegate?

    private var urlSession: URLSession!
    private var task: URLSessionWebSocketTask?
    private var serverURL: URL
    private var token: String
    private var deviceId: String

    private var reconnectTimer: Timer?
    private var backoffSeconds: TimeInterval = 1.0
    private let maxBackoff: TimeInterval = 30.0
    private var shouldReconnect = false
    private(set) var isConnected = false

    init(serverURL: URL, token: String, deviceId: String) {
        self.serverURL = serverURL
        self.token = token
        self.deviceId = deviceId
        super.init()
        urlSession = URLSession(configuration: .default, delegate: self, delegateQueue: nil)
    }

    func updateToken(_ newToken: String) {
        self.token = newToken
    }

    // MARK: – Connection

    func connect() {
        shouldReconnect = true
        guard !isConnected else { return }

        var wsURL = serverURL
        var components = URLComponents(url: wsURL, resolvingAgainstBaseURL: false)!
        components.scheme = components.scheme == "https" ? "wss" : "ws"
        wsURL = components.url!

        var request = URLRequest(url: wsURL)
        // Pass JWT via Sec-WebSocket-Protocol (standard browser WS auth pattern)
        request.setValue("modushare, \(token)", forHTTPHeaderField: "Sec-WebSocket-Protocol")

        task = urlSession.webSocketTask(with: request)
        task?.resume()
        receiveLoop()
    }

    func disconnect() {
        shouldReconnect = false
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
        isConnected = false
    }

    // MARK: – Send

    func send(message: WSMessage) {
        guard let data = try? JSONEncoder().encode(message),
              let json = String(data: data, encoding: .utf8) else { return }
        task?.send(.string(json)) { error in
            if let error = error {
                print("[ws] Send error: \(error)")
            }
        }
    }

    func sendPong() {
        let msg = WSMessage(type: "PONG", payload: nil, timestamp: Date().timeIntervalSince1970 * 1000, deviceId: deviceId)
        send(message: msg)
    }

    // MARK: – Receive loop

    private func receiveLoop() {
        task?.receive { [weak self] result in
            guard let self = self else { return }
            switch result {
            case .success(let message):
                switch message {
                case .string(let text):
                    if let data = text.data(using: .utf8),
                       let msg = try? JSONDecoder().decode(WSMessage.self, from: data) {
                        DispatchQueue.main.async {
                            self.delegate?.webSocketDidReceive(self, message: msg)
                        }
                    }
                case .data(let data):
                    if let msg = try? JSONDecoder().decode(WSMessage.self, from: data) {
                        DispatchQueue.main.async {
                            self.delegate?.webSocketDidReceive(self, message: msg)
                        }
                    }
                @unknown default:
                    break
                }
                self.receiveLoop()

            case .failure(let error):
                self.isConnected = false
                DispatchQueue.main.async {
                    self.delegate?.webSocketDidDisconnect(self, error: error)
                }
                self.scheduleReconnect()
            }
        }
    }

    // MARK: – Reconnect

    private func scheduleReconnect() {
        guard shouldReconnect else { return }
        DispatchQueue.main.async {
            print("[ws] Reconnecting in \(self.backoffSeconds)s…")
            self.reconnectTimer = Timer.scheduledTimer(withTimeInterval: self.backoffSeconds, repeats: false) { [weak self] _ in
                self?.connect()
            }
            self.backoffSeconds = min(self.backoffSeconds * 2, self.maxBackoff)
        }
    }
}

// MARK: – URLSessionWebSocketDelegate

extension WebSocketClient: URLSessionWebSocketDelegate {
    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didOpenWithProtocol protocol: String?) {
        isConnected = true
        backoffSeconds = 1.0
        DispatchQueue.main.async {
            self.delegate?.webSocketDidConnect(self)
        }
    }

    func urlSession(_ session: URLSession,
                    webSocketTask: URLSessionWebSocketTask,
                    didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
                    reason: Data?) {
        isConnected = false
        DispatchQueue.main.async {
            self.delegate?.webSocketDidDisconnect(self, error: nil)
        }
        scheduleReconnect()
    }
}
