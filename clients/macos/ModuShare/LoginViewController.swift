import Cocoa

class LoginViewController: NSViewController {

    var onLoginSuccess: (() -> Void)?

    // MARK: – UI Elements

    private let titleLabel     = NSTextField(labelWithString: "ModuShare")
    private let subtitleLabel  = NSTextField(labelWithString: "Sign in to sync your clipboard")
    private let googleButton   = NSButton(title: "  Google로 로그인", target: nil, action: nil)
    private let dividerLeft    = NSBox()
    private let dividerLabel   = NSTextField(labelWithString: "또는 이메일로 로그인")
    private let dividerRight   = NSBox()
    private let emailField     = NSTextField()
    private let passwordField  = NSSecureTextField()
    private let loginButton    = NSButton(title: "Sign In", target: nil, action: nil)
    private let errorLabel     = NSTextField(labelWithString: "")
    private let spinner        = NSProgressIndicator()

    // MARK: – View lifecycle

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 380, height: 520))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }

    // MARK: – UI Setup

    private func setupUI() {
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        // Title
        titleLabel.font = NSFont.boldSystemFont(ofSize: 26)
        titleLabel.alignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)

        // Subtitle
        subtitleLabel.font = NSFont.systemFont(ofSize: 12)
        subtitleLabel.textColor = NSColor.secondaryLabelColor
        subtitleLabel.alignment = .center
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(subtitleLabel)

        // Google button
        googleButton.bezelStyle = .rounded
        googleButton.target = self
        googleButton.action = #selector(handleGoogleLogin)
        googleButton.translatesAutoresizingMaskIntoConstraints = false
        // Google 로고 이미지 (SF Symbol 대체)
        if let img = NSImage(systemSymbolName: "globe", accessibilityDescription: nil) {
            googleButton.image = img
        }
        googleButton.imagePosition = .imageLeft
        view.addSubview(googleButton)

        // Divider
        dividerLeft.boxType = .separator
        dividerLeft.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(dividerLeft)

        dividerLabel.font = NSFont.systemFont(ofSize: 11)
        dividerLabel.textColor = NSColor.tertiaryLabelColor
        dividerLabel.alignment = .center
        dividerLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(dividerLabel)

        dividerRight.boxType = .separator
        dividerRight.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(dividerRight)

        // Email
        emailField.placeholderString = "Email address"
        emailField.bezelStyle = .roundedBezel
        emailField.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(emailField)

        // Password
        passwordField.placeholderString = "Password"
        passwordField.bezelStyle = .roundedBezel
        passwordField.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(passwordField)

        // Error label
        errorLabel.textColor = NSColor.systemRed
        errorLabel.font = NSFont.systemFont(ofSize: 11)
        errorLabel.alignment = .center
        errorLabel.isHidden = true
        errorLabel.maximumNumberOfLines = 2
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorLabel)

        // Spinner
        spinner.style = .spinning
        spinner.isIndeterminate = true
        spinner.isHidden = true
        spinner.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(spinner)

        // Login button
        loginButton.bezelStyle = .rounded
        loginButton.keyEquivalent = "\r"
        loginButton.target = self
        loginButton.action = #selector(handleLogin)
        loginButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(loginButton)

        NSLayoutConstraint.activate([
            titleLabel.topAnchor.constraint(equalTo: view.topAnchor, constant: 36),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 6),
            subtitleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            // Google button
            googleButton.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 24),
            googleButton.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 36),
            googleButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -36),
            googleButton.heightAnchor.constraint(equalToConstant: 32),

            // Divider
            dividerLeft.centerYAnchor.constraint(equalTo: dividerLabel.centerYAnchor),
            dividerLeft.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 36),
            dividerLeft.trailingAnchor.constraint(equalTo: dividerLabel.leadingAnchor, constant: -8),
            dividerLeft.heightAnchor.constraint(equalToConstant: 1),

            dividerLabel.topAnchor.constraint(equalTo: googleButton.bottomAnchor, constant: 20),
            dividerLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            dividerRight.centerYAnchor.constraint(equalTo: dividerLabel.centerYAnchor),
            dividerRight.leadingAnchor.constraint(equalTo: dividerLabel.trailingAnchor, constant: 8),
            dividerRight.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -36),
            dividerRight.heightAnchor.constraint(equalToConstant: 1),

            // Email / Password
            emailField.topAnchor.constraint(equalTo: dividerLabel.bottomAnchor, constant: 16),
            emailField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 36),
            emailField.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -36),
            emailField.heightAnchor.constraint(equalToConstant: 28),

            passwordField.topAnchor.constraint(equalTo: emailField.bottomAnchor, constant: 10),
            passwordField.leadingAnchor.constraint(equalTo: emailField.leadingAnchor),
            passwordField.trailingAnchor.constraint(equalTo: emailField.trailingAnchor),
            passwordField.heightAnchor.constraint(equalToConstant: 28),

            errorLabel.topAnchor.constraint(equalTo: passwordField.bottomAnchor, constant: 8),
            errorLabel.leadingAnchor.constraint(equalTo: emailField.leadingAnchor),
            errorLabel.trailingAnchor.constraint(equalTo: emailField.trailingAnchor),

            loginButton.topAnchor.constraint(equalTo: errorLabel.bottomAnchor, constant: 12),
            loginButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loginButton.widthAnchor.constraint(equalToConstant: 140),
            loginButton.heightAnchor.constraint(equalToConstant: 30),

            spinner.topAnchor.constraint(equalTo: loginButton.bottomAnchor, constant: 10),
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
    }

    // MARK: – Google Login

    @objc private func handleGoogleLogin() {
        setLoading(true)
        errorLabel.isHidden = true

        Task {
            do {
                let token = try await GoogleAuthHelper.signIn(serverURL: AuthManager.shared.serverURL)
                // token = Google ID token credential
                let user = try await AuthManager.shared.loginWithGoogle(credential: token)
                await MainActor.run {
                    self.setLoading(false)
                    self.onLoginSuccess?()
                }
            } catch {
                await MainActor.run {
                    self.setLoading(false)
                    self.showError(error.localizedDescription)
                }
            }
        }
    }

    // MARK: – Email Login

    @objc private func handleLogin() {
        let email = emailField.stringValue.trimmingCharacters(in: .whitespaces)
        let password = passwordField.stringValue

        guard !email.isEmpty, !password.isEmpty else {
            showError("Please enter your email and password.")
            return
        }

        setLoading(true)
        errorLabel.isHidden = true

        Task {
            do {
                _ = try await AuthManager.shared.login(email: email, password: password)
                await MainActor.run {
                    self.setLoading(false)
                    self.onLoginSuccess?()
                }
            } catch {
                await MainActor.run {
                    self.setLoading(false)
                    self.showError(error.localizedDescription)
                }
            }
        }
    }

    private func showError(_ message: String) {
        errorLabel.stringValue = message
        errorLabel.isHidden = false
    }

    private func setLoading(_ loading: Bool) {
        loginButton.isEnabled = !loading
        googleButton.isEnabled = !loading
        if loading {
            spinner.isHidden = false
            spinner.startAnimation(nil)
        } else {
            spinner.stopAnimation(nil)
            spinner.isHidden = true
        }
    }
}
