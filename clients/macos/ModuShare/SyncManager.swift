import Foundation
import Cocoa
import CryptoKit
import UserNotifications

// 512 KB limit for inline image transfer
private let maxInlineImageBytes = 512 * 1024

class SyncManager: NSObject {

    private let clipboardMonitor = ClipboardMonitor()
    private var wsClient: WebSocketClient?
    private let defaults = UserDefaults.standard
    private let deviceId: String

    private(set) var isSyncEnabled: Bool {
        get { defaults.bool(forKey: "syncEnabled") }
        set { defaults.set(newValue, forKey: "syncEnabled") }
    }

    private(set) var isConnected: Bool = false
    private var hasShownFirstCopyToast: Bool = false

    init(deviceId: String = UUID().uuidString) {
        self.deviceId = deviceId
        super.init()
        clipboardMonitor.onChange = { [weak self] content in
            self?.handleLocalClipboardChange(content)
        }
    }

    // MARK: – Lifecycle

    func start() {
        guard let token = AuthManager.shared.accessToken else { return }
        let serverURL = URL(string: AuthManager.shared.serverURL)!
        wsClient = WebSocketClient(serverURL: serverURL, token: token, deviceId: deviceId)
        wsClient?.delegate = self
        wsClient?.connect()

        if isSyncEnabled {
            clipboardMonitor.start()
        }
    }

    func stop() {
        clipboardMonitor.stop()
        wsClient?.disconnect()
        wsClient = nil
        isConnected = false
    }

    func enable() {
        isSyncEnabled = true
        clipboardMonitor.start()
        sendSyncToggle(enabled: true)
    }

    func disable() {
        isSyncEnabled = false
        clipboardMonitor.stop()
        sendSyncToggle(enabled: false)
    }

    // MARK: – Outbound (local -> server)

    private func handleLocalClipboardChange(_ content: ClipboardContent) {
        guard isSyncEnabled, isConnected else { return }

        if content.contentType == "text", let text = content.text {
            let msg = WSMessage(
                type: "CLIPBOARD_UPDATE",
                payload: WSPayload(contentType: "text", content: text),
                timestamp: Date().timeIntervalSince1970 * 1000,
                deviceId: deviceId
            )
            wsClient?.send(message: msg)

        } else if content.contentType == "image", let imageData = content.imageData {
            if imageData.count <= maxInlineImageBytes {
                let base64 = imageData.base64EncodedString()
                let msg = WSMessage(
                    type: "CLIPBOARD_UPDATE",
                    payload: WSPayload(contentType: "image", imageData: base64),
                    timestamp: Date().timeIntervalSince1970 * 1000,
                    deviceId: deviceId
                )
                wsClient?.send(message: msg)
            } else {
                // Upload image first, then send URL
                Task {
                    if let imageUrl = await uploadImage(imageData) {
                        let msg = WSMessage(
                            type: "CLIPBOARD_UPDATE",
                            payload: WSPayload(contentType: "image", imageUrl: imageUrl),
                            timestamp: Date().timeIntervalSince1970 * 1000,
                            deviceId: deviceId
                        )
                        wsClient?.send(message: msg)
                    }
                }
            }
        }
    }

    // MARK: – Inbound (server -> local)

    private func applyRemoteClipboardUpdate(_ payload: WSPayload) {
        let pasteboard = NSPasteboard.general

        if payload.contentType == "text", let text = payload.content {
            let hash = sha256(Data(text.utf8))
            clipboardMonitor.lastReceivedHash = hash
            pasteboard.clearContents()
            pasteboard.setString(text, forType: .string)

        } else if payload.contentType == "image" {
            if let base64 = payload.imageData,
               let imageData = Data(base64Encoded: base64) {
                let hash = sha256(imageData)
                clipboardMonitor.lastReceivedHash = hash
                if let image = NSImage(data: imageData) {
                    pasteboard.clearContents()
                    pasteboard.writeObjects([image])
                }
            } else if let imageUrl = payload.imageUrl {
                Task {
                    if let data = await downloadImage(from: imageUrl) {
                        let hash = sha256(data)
                        await MainActor.run {
                            self.clipboardMonitor.lastReceivedHash = hash
                        }
                        if let image = NSImage(data: data) {
                            await MainActor.run {
                                pasteboard.clearContents()
                                pasteboard.writeObjects([image])
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: – Image upload

    private func uploadImage(_ data: Data) async -> String? {
        guard let token = AuthManager.shared.accessToken,
              let url = URL(string: "\(AuthManager.shared.serverURL)/upload/image") else {
            return nil
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"clipboard.png\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(data)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        do {
            let (responseData, _) = try await URLSession.shared.data(for: request)
            let result = try JSONDecoder().decode([String: String].self, from: responseData)
            return result["imageUrl"]
        } catch {
            print("[sync] Image upload failed: \(error)")
            return nil
        }
    }

    // MARK: – Image download

    private func downloadImage(from urlString: String) async -> Data? {
        guard let token = AuthManager.shared.accessToken,
              let url = URL(string: urlString.hasPrefix("http") ? urlString : "\(AuthManager.shared.serverURL)\(urlString)") else {
            return nil
        }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        do {
            let (data, _) = try await URLSession.shared.data(for: request)
            return data
        } catch {
            return nil
        }
    }

    // MARK: – Sync toggle

    private func sendSyncToggle(enabled: Bool) {
        guard isConnected else { return }
        let msg = WSMessage(
            type: enabled ? "SYNC_ENABLE" : "SYNC_DISABLE",
            payload: nil,
            timestamp: Date().timeIntervalSince1970 * 1000,
            deviceId: deviceId
        )
        wsClient?.send(message: msg)
    }

    // MARK: – Helpers

    private func sha256(_ data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

// MARK: – WebSocketClientDelegate

extension SyncManager: WebSocketClientDelegate {
    func webSocketDidConnect(_ client: WebSocketClient) {
        isConnected = true
        NotificationCenter.default.post(name: .syncStatusChanged, object: nil)
    }

    func webSocketDidDisconnect(_ client: WebSocketClient, error: Error?) {
        isConnected = false
        NotificationCenter.default.post(name: .syncStatusChanged, object: nil)
    }

    func webSocketDidReceive(_ client: WebSocketClient, message: WSMessage) {
        switch message.type {
        case "PING":
            client.sendPong()

        case "CLIPBOARD_UPDATE":
            if let payload = message.payload {
                applyRemoteClipboardUpdate(payload)
            }

        case "CLIPBOARD_ACK":
            if !hasShownFirstCopyToast {
                hasShownFirstCopyToast = true
                let count = message.payload?.sharedWithCount ?? 0
                DispatchQueue.main.async {
                    self.showSharingToast(deviceCount: count)
                }
            }

        case "SYNC_ENABLE":
            isSyncEnabled = true
            NotificationCenter.default.post(name: .syncStatusChanged, object: nil)

        case "SYNC_DISABLE":
            isSyncEnabled = false
            NotificationCenter.default.post(name: .syncStatusChanged, object: nil)

        default:
            break
        }
    }

    // MARK: – Toast notification

    private func showSharingToast(deviceCount: Int) {
        let content = UNMutableNotificationContent()
        content.title = "ModuShare"
        if deviceCount > 0 {
            content.body = "\(deviceCount)개의 다른 기기와 공유되고 있습니다"
        } else {
            content.body = "클립보드 동기화가 활성화되어 있습니다"
        }
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "modushare.firstcopy",
            content: content,
            trigger: nil
        )

        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else { return }
            UNUserNotificationCenter.current().add(request)
        }
    }
}

// MARK: – Notification names

extension Notification.Name {
    static let syncStatusChanged = Notification.Name("com.modushare.syncStatusChanged")
}
