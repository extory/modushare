import Cocoa

// MARK: – DTO

struct SharePartner: Decodable {
    let id: String
    let userId: String
    let username: String
    let email: String
}

// MARK: – ShareManager API helper

actor ShareAPI {
    static func listPartners() async throws -> [SharePartner] {
        guard let token = await AuthManager.shared.accessToken,
              let url = URL(string: "\(await AuthManager.shared.serverURL)/share") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, _) = try await URLSession.shared.data(for: req)
        struct Resp: Decodable { let partners: [SharePartner] }
        return try JSONDecoder().decode(Resp.self, from: data).partners
    }

    static func addPartner(email: String) async throws -> SharePartner {
        guard let token = await AuthManager.shared.accessToken,
              let url = URL(string: "\(await AuthManager.shared.serverURL)/share") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try JSONEncoder().encode(["email": email])
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let errBody = try? JSONDecoder().decode([String: String].self, from: data)
            throw NSError(domain: "ShareError", code: http.statusCode,
                          userInfo: [NSLocalizedDescriptionKey: errBody?["error"] ?? "추가 실패"])
        }
        return try JSONDecoder().decode(SharePartner.self, from: data)
    }

    static func removePartner(targetId: String) async throws {
        guard let token = await AuthManager.shared.accessToken,
              let url = URL(string: "\(await AuthManager.shared.serverURL)/share/\(targetId)") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        _ = try await URLSession.shared.data(for: req)
    }
}

// MARK: – SharePreferencesViewController

class SharePreferencesViewController: NSViewController {

    private var partners: [SharePartner] = []

    private let scrollView = NSScrollView()
    private let tableView  = NSTableView()
    private let emailField = NSTextField()
    private let addButton  = NSButton(title: "추가", target: nil, action: nil)
    private let errorLabel = NSTextField(labelWithString: "")

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 440, height: 380))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        loadPartners()
    }

    // MARK: – UI Setup

    private func setupUI() {
        view.wantsLayer = true
        view.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor

        // Title
        let title = NSTextField(labelWithString: "공유 대상 관리")
        title.font = NSFont.boldSystemFont(ofSize: 16)
        title.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(title)

        // Email field
        emailField.placeholderString = "공유할 이메일 주소 입력"
        emailField.bezelStyle = .roundedBezel
        emailField.translatesAutoresizingMaskIntoConstraints = false
        emailField.target = self
        emailField.action = #selector(handleAdd)
        view.addSubview(emailField)

        // Add button
        addButton.bezelStyle = .rounded
        addButton.target = self
        addButton.action = #selector(handleAdd)
        addButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(addButton)

        // Error label
        errorLabel.textColor = NSColor.systemRed
        errorLabel.font = NSFont.systemFont(ofSize: 11)
        errorLabel.isHidden = true
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorLabel)

        // Table
        let nameCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("name"))
        nameCol.title = "사용자"
        nameCol.width = 160

        let emailCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("email"))
        emailCol.title = "이메일"
        emailCol.width = 180

        let removeCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("remove"))
        removeCol.title = ""
        removeCol.width = 60

        tableView.addTableColumn(nameCol)
        tableView.addTableColumn(emailCol)
        tableView.addTableColumn(removeCol)
        tableView.delegate = self
        tableView.dataSource = self
        tableView.rowHeight = 28
        tableView.headerView = NSTableHeaderView()

        scrollView.documentView = tableView
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .bezelBorder
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: view.topAnchor, constant: 20),
            title.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),

            emailField.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 16),
            emailField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            emailField.trailingAnchor.constraint(equalTo: addButton.leadingAnchor, constant: -8),
            emailField.heightAnchor.constraint(equalToConstant: 26),

            addButton.centerYAnchor.constraint(equalTo: emailField.centerYAnchor),
            addButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            addButton.widthAnchor.constraint(equalToConstant: 64),

            errorLabel.topAnchor.constraint(equalTo: emailField.bottomAnchor, constant: 4),
            errorLabel.leadingAnchor.constraint(equalTo: emailField.leadingAnchor),
            errorLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            scrollView.topAnchor.constraint(equalTo: errorLabel.bottomAnchor, constant: 8),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            scrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -20),
        ])
    }

    // MARK: – Data

    private func loadPartners() {
        Task {
            do {
                let list = try await ShareAPI.listPartners()
                await MainActor.run {
                    self.partners = list
                    self.tableView.reloadData()
                }
            } catch {
                // Silently ignore load errors
            }
        }
    }

    @objc private func handleAdd() {
        let email = emailField.stringValue.trimmingCharacters(in: .whitespaces)
        guard !email.isEmpty else {
            showError("이메일을 입력해주세요.")
            return
        }
        // 간단한 이메일 형식 검사
        guard email.contains("@"), email.contains(".") else {
            showError("올바른 이메일 형식이 아닙니다.")
            return
        }

        addButton.isEnabled = false
        errorLabel.isHidden = true

        Task {
            do {
                let partner = try await ShareAPI.addPartner(email: email)
                await MainActor.run {
                    self.emailField.stringValue = ""
                    self.partners.insert(partner, at: 0)
                    self.tableView.reloadData()
                    self.addButton.isEnabled = true
                    self.errorLabel.isHidden = true
                }
            } catch let error as NSError {
                await MainActor.run {
                    // 서버 에러 메시지 그대로 표시 (한국어 메시지 포함)
                    let msg: String
                    switch error.code {
                    case 404: msg = "등록되지 않은 이메일입니다. 가입 여부를 확인해주세요."
                    case 409: msg = "이미 공유 중인 사용자입니다."
                    case 400: msg = error.localizedDescription
                    default:  msg = "오류가 발생했습니다: \(error.localizedDescription)"
                    }
                    self.showError(msg)
                    self.addButton.isEnabled = true
                }
            }
        }
    }

    private func showError(_ msg: String) {
        errorLabel.stringValue = msg
        errorLabel.isHidden = false
    }

    func removePartner(at row: Int) {
        let partner = partners[row]
        Task {
            try? await ShareAPI.removePartner(targetId: partner.userId)
            await MainActor.run {
                self.partners.remove(at: row)
                self.tableView.reloadData()
            }
        }
    }
}

// MARK: – NSTableViewDataSource / Delegate

extension SharePreferencesViewController: NSTableViewDataSource, NSTableViewDelegate {
    func numberOfRows(in tableView: NSTableView) -> Int { partners.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let partner = partners[row]
        let id = tableColumn?.identifier.rawValue ?? ""

        if id == "remove" {
            let btn = NSButton(title: "제거", target: self, action: #selector(removeRow(_:)))
            btn.bezelStyle = .rounded
            btn.tag = row
            btn.font = NSFont.systemFont(ofSize: 11)
            return btn
        }

        let cell = NSTextField(labelWithString: id == "name" ? partner.username : partner.email)
        cell.font = NSFont.systemFont(ofSize: 12)
        cell.textColor = id == "email" ? NSColor.secondaryLabelColor : NSColor.labelColor
        return cell
    }

    @objc private func removeRow(_ sender: NSButton) {
        removePartner(at: sender.tag)
    }
}
