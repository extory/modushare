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
