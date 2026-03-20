import Cocoa

class LoginViewController: NSViewController {

    var onLoginSuccess: (() -> Void)?

    // MARK: – UI Elements

    private let titleLabel = NSTextField(labelWithString: "ModuShare")
    private let subtitleLabel = NSTextField(labelWithString: "Sign in to sync your clipboard")
    private let emailField = NSTextField()
    private let passwordField = NSSecureTextField()
    private let loginButton = NSButton(title: "Sign In", target: nil, action: nil)
    private let errorLabel = NSTextField(labelWithString: "")
    private let spinner = NSProgressIndicator()

    // MARK: – View lifecycle

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 380, height: 420))
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
        titleLabel.font = NSFont.boldSystemFont(ofSize: 28)
        titleLabel.alignment = .center
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)

        // Subtitle
        subtitleLabel.font = NSFont.systemFont(ofSize: 13)
        subtitleLabel.textColor = NSColor.secondaryLabelColor
        subtitleLabel.alignment = .center
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(subtitleLabel)

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
        errorLabel.font = NSFont.systemFont(ofSize: 12)
        errorLabel.alignment = .center
        errorLabel.isHidden = true
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
            titleLabel.topAnchor.constraint(equalTo: view.topAnchor, constant: 48),
            titleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),
            subtitleLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),

            emailField.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 36),
            emailField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 36),
            emailField.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -36),
            emailField.heightAnchor.constraint(equalToConstant: 30),

            passwordField.topAnchor.constraint(equalTo: emailField.bottomAnchor, constant: 12),
            passwordField.leadingAnchor.constraint(equalTo: emailField.leadingAnchor),
            passwordField.trailingAnchor.constraint(equalTo: emailField.trailingAnchor),
            passwordField.heightAnchor.constraint(equalToConstant: 30),

            errorLabel.topAnchor.constraint(equalTo: passwordField.bottomAnchor, constant: 10),
            errorLabel.leadingAnchor.constraint(equalTo: emailField.leadingAnchor),
            errorLabel.trailingAnchor.constraint(equalTo: emailField.trailingAnchor),

            loginButton.topAnchor.constraint(equalTo: errorLabel.bottomAnchor, constant: 16),
            loginButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            loginButton.widthAnchor.constraint(equalToConstant: 140),
            loginButton.heightAnchor.constraint(equalToConstant: 32),

            spinner.topAnchor.constraint(equalTo: loginButton.bottomAnchor, constant: 12),
            spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
        ])
    }

    // MARK: – Actions

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
        if loading {
            spinner.isHidden = false
            spinner.startAnimation(nil)
        } else {
            spinner.stopAnimation(nil)
            spinner.isHidden = true
        }
    }
}
