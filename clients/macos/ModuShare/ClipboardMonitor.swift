import Cocoa
import CryptoKit

struct ClipboardContent {
    let contentType: String  // "text" or "image"
    let text: String?
    let imageData: Data?     // PNG data
}

class ClipboardMonitor {

    var onChange: ((ClipboardContent) -> Void)?

    private var lastChangeCount: Int = NSPasteboard.general.changeCount
    private var lastContentHash: String = ""
    private var timer: Timer?

    /// Set this from outside (e.g. SyncManager) when a remote clipboard update
    /// was just written locally, to prevent echo.
    var lastReceivedHash: String = ""

    // MARK: – Lifecycle

    func start() {
        guard timer == nil else { return }
        // Seed current state
        lastChangeCount = NSPasteboard.general.changeCount
        timer = Timer.scheduledTimer(
            withTimeInterval: 0.5,
            repeats: true
        ) { [weak self] _ in
            self?.poll()
        }
        RunLoop.main.add(timer!, forMode: .common)
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    // MARK: – Polling

    private func poll() {
        let pasteboard = NSPasteboard.general
        let currentChangeCount = pasteboard.changeCount
        guard currentChangeCount != lastChangeCount else { return }
        lastChangeCount = currentChangeCount

        if let text = pasteboard.string(forType: .string), !text.isEmpty {
            let hash = sha256(Data(text.utf8))
            guard hash != lastReceivedHash else {
                lastReceivedHash = ""
                return
            }
            lastContentHash = hash
            onChange?(ClipboardContent(contentType: "text", text: text, imageData: nil))

        } else if let pngData = extractPNG(from: pasteboard) {
            let hash = sha256(pngData)
            guard hash != lastReceivedHash else {
                lastReceivedHash = ""
                return
            }
            lastContentHash = hash
            onChange?(ClipboardContent(contentType: "image", text: nil, imageData: pngData))
        }
    }

    // MARK: – Helpers

    /// Extracts PNG data from pasteboard, checking multiple image types.
    /// macOS screenshots use .png directly; other sources may use .tiff.
    private func extractPNG(from pasteboard: NSPasteboard) -> Data? {
        // 1. Try PNG directly (macOS screenshots, web images)
        if let pngData = pasteboard.data(forType: .init("public.png")), !pngData.isEmpty {
            return pngData
        }
        // 2. Try TIFF → convert to PNG
        if let tiffData = pasteboard.data(forType: .tiff),
           let rep = NSBitmapImageRep(data: tiffData),
           let pngData = rep.representation(using: .png, properties: [:]) {
            return pngData
        }
        // 3. Try reading as NSImage (catches any remaining image types)
        if let images = pasteboard.readObjects(forClasses: [NSImage.self]) as? [NSImage],
           let image = images.first,
           let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) {
            let rep = NSBitmapImageRep(cgImage: cgImage)
            return rep.representation(using: .png, properties: [:])
        }
        return nil
    }

    private func sha256(_ data: Data) -> String {
        let digest = SHA256.hash(data: data)
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}
