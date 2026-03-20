import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    private var statusItem: NSStatusItem!
    private var syncManager: SyncManager!
    private var loginWindowController: NSWindowController?

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

        menu.addItem(.separator())

        // Account
        if AuthManager.shared.isAuthenticated {
            menu.addItem(withTitle: "Sign Out", action: #selector(signOut), keyEquivalent: "")
        } else {
            menu.addItem(withTitle: "Sign In…", action: #selector(showLoginWindowAction), keyEquivalent: "")
        }

        menu.addItem(.separator())
        menu.addItem(withTitle: "Quit ModuShare", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        for item in menu.items {
            item.target = self
        }

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
                self?.updateMenu()
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
