import Cocoa
import UserNotifications

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    private var statusItem: NSStatusItem!
    private var syncManager: SyncManager!
    private var loginWindowController: NSWindowController?
    private var sharePrefsWindowController: NSWindowController?

    func applicationDidFinishLaunching(_ aNotification: Notification) {
        // Hide from Dock (also set via LSUIElement in Info.plist)
        NSApp.setActivationPolicy(.accessory)

        syncManager = SyncManager()

        setupMenuBar()

        NotificationCenter.default.addObserver(
            self,
            selector: #selector(syncStatusDidChange),
            name: .syncStatusChanged,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(menuBarFlashDidChange(_:)),
            name: .menuBarFlash,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(versionMismatchDidOccur(_:)),
            name: .versionMismatch,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(updateAvailableDidOccur(_:)),
            name: .updateAvailable,
            object: nil
        )
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(fileTransferReceived(_:)),
            name: .fileTransferReceived,
            object: nil
        )

        // Start periodic update checks
        AutoUpdater.shared.startPeriodicChecks()

        // If not authenticated, show login window
        if !AuthManager.shared.isAuthenticated {
            showLoginWindow()
        } else {
            syncManager.start()
        }
    }

    // MARK: – Menu Bar Setup

    private func setupMenuBar() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

        if let button = statusItem.button {
            button.title = "📋"
            button.toolTip = "ModuShare"
        }

        updateMenu()
    }

    func updateMenu() {
        let menu = NSMenu()

        // Status line
        let statusItem = NSMenuItem(
            title: syncManager?.isSyncEnabled == true ? "● Sync Enabled" : "○ Sync Disabled",
            action: nil,
            keyEquivalent: ""
        )
        statusItem.isEnabled = false
        menu.addItem(statusItem)

        let connectionItem = NSMenuItem(
            title: syncManager?.isConnected == true ? "Connected" : "Disconnected",
            action: nil,
            keyEquivalent: ""
        )
        connectionItem.isEnabled = false
        menu.addItem(connectionItem)

        menu.addItem(.separator())

        // Toggle sync
        if syncManager?.isSyncEnabled == true {
            menu.addItem(withTitle: "Disable Sync", action: #selector(disableSync), keyEquivalent: "")
        } else {
            menu.addItem(withTitle: "Enable Sync", action: #selector(enableSync), keyEquivalent: "")
        }

        if AuthManager.shared.isAuthenticated {
            menu.addItem(withTitle: "파일 보내기…", action: #selector(sendFile), keyEquivalent: "")
            menu.addItem(withTitle: "공유 관리…", action: #selector(showSharePreferences), keyEquivalent: "")
        }

        menu.addItem(.separator())

        // Account
        if AuthManager.shared.isAuthenticated {
            let emailItem = NSMenuItem(
                title: AuthManager.shared.userEmail ?? "로그인됨",
                action: nil,
                keyEquivalent: ""
            )
            emailItem.isEnabled = false
            menu.addItem(emailItem)
            menu.addItem(withTitle: "Sign Out", action: #selector(signOut), keyEquivalent: "")
        } else {
            menu.addItem(withTitle: "Sign In…", action: #selector(showLoginWindowAction), keyEquivalent: "")
        }

        menu.addItem(.separator())

        // Auto Update toggle
        let autoUpdateItem = NSMenuItem(
            title: AutoUpdater.shared.isAutoUpdateEnabled ? "자동 업데이트: 켜짐" : "자동 업데이트: 꺼짐",
            action: #selector(toggleAutoUpdate),
            keyEquivalent: ""
        )
        menu.addItem(autoUpdateItem)

        menu.addItem(withTitle: "지금 업데이트 확인", action: #selector(checkForUpdateNow), keyEquivalent: "")

        menu.addItem(.separator())

        for item in menu.items {
            item.target = self
        }

        let quitItem = NSMenuItem(title: "Quit ModuShare", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        quitItem.target = NSApp
        menu.addItem(quitItem)

        self.statusItem.menu = menu
    }

    // MARK: – Notification handlers

    @objc private func fileTransferReceived(_ notification: Notification) {
        guard let info = notification.object as? [String: String],
              let fileUrl = info["fileUrl"], !fileUrl.isEmpty,
              let fileName = info["fileName"] else { return }
        Task {
            await MainActor.run {
                let panel = NSSavePanel()
                panel.nameFieldStringValue = fileName
                panel.title = "파일 저장"
                panel.begin { response in
                    guard response == .OK, let saveUrl = panel.url else { return }
                    Task {
                        guard let token = AuthManager.shared.accessToken,
                              let url = URL(string: fileUrl) else { return }
                        var req = URLRequest(url: url)
                        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
                        do {
                            let (data, _) = try await URLSession.shared.data(for: req)
                            try data.write(to: saveUrl)
                            NSWorkspace.shared.activateFileViewerSelecting([saveUrl])
                        } catch {
                            await MainActor.run {
                                let alert = NSAlert()
                                alert.messageText = "다운로드 실패"
                                alert.informativeText = error.localizedDescription
                                alert.runModal()
                            }
                        }
                    }
                }
            }
        }
    }

    @objc private func syncStatusDidChange() {
        updateMenu()
    }

    @objc private func menuBarFlashDidChange(_ notification: Notification) {
        if let icon = notification.object as? String,
           let button = statusItem.button {
            button.title = icon
        }
    }

    @objc private func versionMismatchDidOccur(_ notification: Notification) {
        // VERSION_MISMATCH: already handled by AutoUpdater periodic check.
        // If autoUpdate is off, open browser; if on, AutoUpdater will handle it.
        if !AutoUpdater.shared.isAutoUpdateEnabled,
           let urlString = notification.object as? String,
           let url = URL(string: urlString) {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func updateAvailableDidOccur(_ notification: Notification) {
        if let urlString = notification.object as? String,
           let url = URL(string: urlString) {
            NSWorkspace.shared.open(url)
        }
    }

    @objc private func toggleAutoUpdate() {
        AutoUpdater.shared.isAutoUpdateEnabled.toggle()
        updateMenu()
    }

    @objc private func checkForUpdateNow() {
        Task {
            let result = await AutoUpdater.shared.checkForUpdate()
            if result == nil {
                // No update available — show a brief notification
                let content = UNMutableNotificationContent()
                content.title = "ModuShare"
                content.body = "현재 최신 버전(v\(AutoUpdater.shared.currentVersion))입니다."
                content.sound = .default
                let req = UNNotificationRequest(identifier: "modushare.update.uptodate", content: content, trigger: nil)
                UNUserNotificationCenter.current().add(req)
            }
        }
    }

    // MARK: – Actions

    @objc private func enableSync() {
        syncManager.enable()
        updateMenu()
    }

    @objc private func disableSync() {
        syncManager.disable()
        updateMenu()
    }

    @objc private func showLoginWindowAction() {
        showLoginWindow()
    }

    @objc private func showSharePreferences() {
        // 매번 새로 만들어야 viewDidLoad → loadPartners() 가 호출됨
        let vc = SharePreferencesViewController()
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 420),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "ModuShare – 공유 관리"
        window.contentViewController = vc
        window.center()
        sharePrefsWindowController = NSWindowController(window: window)
        sharePrefsWindowController?.showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func signOut() {
        Task {
            await AuthManager.shared.logout()
            syncManager.stop()
            await MainActor.run { self.updateMenu() }
        }
    }

    @objc private func sendFile() {
        let panel = NSOpenPanel()
        panel.title = "파일 선택 (최대 5MB)"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.begin { [weak self] response in
            guard response == .OK, let url = panel.url else { return }
            let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
            let fileSize = attrs?[.size] as? Int ?? 0
            if fileSize > 5 * 1024 * 1024 {
                DispatchQueue.main.async {
                    let alert = NSAlert()
                    alert.messageText = "파일 크기 초과"
                    alert.informativeText = "5MB 이하의 파일만 전송할 수 있습니다."
                    alert.runModal()
                }
                return
            }
            Task { await self?.uploadAndSendFile(url: url, fileSize: fileSize) }
        }
    }

    private func uploadAndSendFile(url: URL, fileSize: Int) async {
        guard let token = AuthManager.shared.accessToken,
              let serverURL = URL(string: "\(AuthManager.shared.serverURL)/files/send") else { return }

        var request = URLRequest(url: serverURL)
        request.httpMethod = "POST"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")

        guard let fileData = try? Data(contentsOf: url) else { return }
        let fileName = url.lastPathComponent
        let mimeType = url.mimeType

        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
            await MainActor.run {
                if statusCode == 201 {
                    let content = UNMutableNotificationContent()
                    content.title = "ModuShare"
                    content.body = "\"\(fileName)\" 파일을 전송했습니다."
                    content.sound = .default
                    let req = UNNotificationRequest(identifier: "modushare.filesent", content: content, trigger: nil)
                    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, _ in
                        guard granted else { return }
                        UNUserNotificationCenter.current().add(req)
                    }
                } else {
                    let alert = NSAlert()
                    alert.messageText = "전송 실패"
                    alert.informativeText = "파일 전송에 실패했습니다."
                    alert.runModal()
                }
            }
        } catch {
            await MainActor.run {
                let alert = NSAlert()
                alert.messageText = "전송 실패"
                alert.informativeText = error.localizedDescription
                alert.runModal()
            }
        }
    }

    func showLoginWindow() {
        if loginWindowController == nil {
            let vc = LoginViewController()
            vc.onLoginSuccess = { [weak self] in
                self?.loginWindowController?.close()
                self?.loginWindowController = nil
                self?.syncManager.start()
                DispatchQueue.main.async { self?.updateMenu() }
            }
            let window = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 400, height: 440),
                styleMask: [.titled, .closable],
                backing: .buffered,
                defer: false
            )
            window.title = "ModuShare – Sign In"
            window.contentViewController = vc
            window.center()
            loginWindowController = NSWindowController(window: window)
        }
        loginWindowController?.showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}
