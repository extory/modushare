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
        guard let url = URL(string: "\(await AuthManager.shared.serverURL)/share") else {
            throw URLError(.badURL)
        }
        let (data, _) = try await AuthManager.shared.authenticatedData(for: URLRequest(url: url))
        struct Resp: Decodable { let partners: [SharePartner] }
        return try JSONDecoder().decode(Resp.self, from: data).partners
    }

    static func sendInvite(email: String) async throws {
        guard let url = URL(string: "\(await AuthManager.shared.serverURL)/share/invite") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(["email": email])
        let (data, response) = try await AuthManager.shared.authenticatedData(for: req)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            let errBody = try? JSONDecoder().decode([String: String].self, from: data)
            throw NSError(domain: "ShareError", code: http.statusCode,
                          userInfo: [NSLocalizedDescriptionKey: errBody?["error"] ?? "초대 실패"])
        }
    }

    static func listInvitations() async throws -> [[String: Any]] {
        guard let url = URL(string: "\(await AuthManager.shared.serverURL)/share/invitations") else {
            throw URLError(.badURL)
        }
        let (data, _) = try await AuthManager.shared.authenticatedData(for: URLRequest(url: url))
        struct InvResp: Decodable {
            struct Inv: Decodable {
                let id: String
                let fromId: String
                let fromUsername: String
                let fromEmail: String
                let createdAt: Int64
            }
            let invitations: [Inv]
        }
        let resp = try JSONDecoder().decode(InvResp.self, from: data)
        return resp.invitations.map {
            ["id": $0.id, "fromId": $0.fromId, "fromUsername": $0.fromUsername, "fromEmail": $0.fromEmail]
        }
    }

    struct HistoryItem: Decodable {
        let id: String
        let status: String
        // received
        let fromUsername: String?
        let fromEmail: String?
        // sent
        let toUsername: String?
        let toEmail: String?
        let createdAt: Int64
    }

    struct HistoryResp: Decodable {
        let received: [HistoryItem]
        let sent: [HistoryItem]
    }

    static func fetchHistory() async throws -> HistoryResp {
        guard let url = URL(string: "\(await AuthManager.shared.serverURL)/share/history") else {
            throw URLError(.badURL)
        }
        let (data, _) = try await AuthManager.shared.authenticatedData(for: URLRequest(url: url))
        return try JSONDecoder().decode(HistoryResp.self, from: data)
    }

    static func acceptInvitation(id: String) async throws {
        guard let url = URL(string: "\(await AuthManager.shared.serverURL)/share/invitations/\(id)/accept") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = "{}".data(using: .utf8)
        _ = try await AuthManager.shared.authenticatedData(for: req)
    }

    static func rejectInvitation(id: String) async throws {
        guard let url = URL(string: "\(await AuthManager.shared.serverURL)/share/invitations/\(id)/reject") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = "{}".data(using: .utf8)
        _ = try await AuthManager.shared.authenticatedData(for: req)
    }

    static func removePartner(targetId: String) async throws {
        guard let url = URL(string: "\(await AuthManager.shared.serverURL)/share/\(targetId)") else {
            throw URLError(.badURL)
        }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        _ = try await AuthManager.shared.authenticatedData(for: req)
    }
}

// MARK: – Invitation DTO

struct Invitation {
    let id: String
    let fromUsername: String
    let fromEmail: String
}

// MARK: – SharePreferencesViewController

class SharePreferencesViewController: NSViewController {

    private var partners: [SharePartner] = []
    private var invitations: [Invitation] = []
    private var sentHistory: [ShareAPI.HistoryItem] = []
    private var receivedHistory: [ShareAPI.HistoryItem] = []

    private let scrollView    = NSScrollView()
    private let tableView     = NSTableView()
    private let invScrollView = NSScrollView()
    private let invTableView  = NSTableView()
    private let sentScrollView = NSScrollView()
    private let sentTableView  = NSTableView()
    private let recvHistScrollView = NSScrollView()
    private let recvHistTableView  = NSTableView()
    private let emailField    = NSTextField()
    private let inviteButton  = NSButton(title: "초대", target: nil, action: nil)
    private let errorLabel    = NSTextField(labelWithString: "")
    private let invLabel      = NSTextField(labelWithString: "받은 초대 (대기 중)")
    private let sentLabel     = NSTextField(labelWithString: "보낸 초대 히스토리")
    private let recvHistLabel = NSTextField(labelWithString: "받은 초대 히스토리")

    override func loadView() {
        view = NSView(frame: NSRect(x: 0, y: 0, width: 460, height: 720))
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
        loadAll()
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
        emailField.placeholderString = "초대할 이메일 주소 입력"
        emailField.bezelStyle = .roundedBezel
        emailField.translatesAutoresizingMaskIntoConstraints = false
        emailField.target = self
        emailField.action = #selector(handleInvite)
        view.addSubview(emailField)

        // Invite button
        inviteButton.bezelStyle = .rounded
        inviteButton.target = self
        inviteButton.action = #selector(handleInvite)
        inviteButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(inviteButton)

        // Error label
        errorLabel.textColor = NSColor.systemRed
        errorLabel.font = NSFont.systemFont(ofSize: 11)
        errorLabel.isHidden = true
        errorLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(errorLabel)

        // Partners table
        let nameCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("name"))
        nameCol.title = "사용자"
        nameCol.width = 150

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
        tableView.tag = 0

        scrollView.documentView = tableView
        scrollView.hasVerticalScroller = true
        scrollView.borderType = .bezelBorder
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scrollView)

        // Invitations section label
        invLabel.font = NSFont.boldSystemFont(ofSize: 13)
        invLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(invLabel)

        // Invitations table
        let fromCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("from"))
        fromCol.title = "보낸 사람"
        fromCol.width = 200

        let acceptCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("accept"))
        acceptCol.title = ""
        acceptCol.width = 55

        let rejectCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("reject"))
        rejectCol.title = ""
        rejectCol.width = 55

        invTableView.addTableColumn(fromCol)
        invTableView.addTableColumn(acceptCol)
        invTableView.addTableColumn(rejectCol)
        invTableView.delegate = self
        invTableView.dataSource = self
        invTableView.rowHeight = 28
        invTableView.headerView = NSTableHeaderView()
        invTableView.tag = 1

        invScrollView.documentView = invTableView
        invScrollView.hasVerticalScroller = true
        invScrollView.borderType = .bezelBorder
        invScrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(invScrollView)

        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: view.topAnchor, constant: 20),
            title.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),

            emailField.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 16),
            emailField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            emailField.trailingAnchor.constraint(equalTo: inviteButton.leadingAnchor, constant: -8),
            emailField.heightAnchor.constraint(equalToConstant: 26),

            inviteButton.centerYAnchor.constraint(equalTo: emailField.centerYAnchor),
            inviteButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            inviteButton.widthAnchor.constraint(equalToConstant: 64),

            errorLabel.topAnchor.constraint(equalTo: emailField.bottomAnchor, constant: 4),
            errorLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            errorLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),

            scrollView.topAnchor.constraint(equalTo: errorLabel.bottomAnchor, constant: 8),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            scrollView.heightAnchor.constraint(equalToConstant: 160),

            invLabel.topAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: 16),
            invLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),

            invScrollView.topAnchor.constraint(equalTo: invLabel.bottomAnchor, constant: 8),
            invScrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            invScrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            invScrollView.heightAnchor.constraint(equalToConstant: 100),

            sentLabel.topAnchor.constraint(equalTo: invScrollView.bottomAnchor, constant: 16),
            sentLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),

            sentScrollView.topAnchor.constraint(equalTo: sentLabel.bottomAnchor, constant: 8),
            sentScrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            sentScrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            sentScrollView.heightAnchor.constraint(equalToConstant: 100),

            recvHistLabel.topAnchor.constraint(equalTo: sentScrollView.bottomAnchor, constant: 16),
            recvHistLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),

            recvHistScrollView.topAnchor.constraint(equalTo: recvHistLabel.bottomAnchor, constant: 8),
            recvHistScrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            recvHistScrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            recvHistScrollView.bottomAnchor.constraint(equalTo: view.bottomAnchor, constant: -20),
        ])

        // Sent history table (tag=2)
        sentLabel.font = NSFont.boldSystemFont(ofSize: 13)
        sentLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(sentLabel)

        let sentNameCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("name"))
        sentNameCol.title = "받는 사람"; sentNameCol.width = 200
        let sentStatusCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("status"))
        sentStatusCol.title = "상태"; sentStatusCol.width = 80
        sentTableView.addTableColumn(sentNameCol)
        sentTableView.addTableColumn(sentStatusCol)
        sentTableView.delegate = self; sentTableView.dataSource = self
        sentTableView.rowHeight = 26; sentTableView.headerView = NSTableHeaderView()
        sentTableView.tag = 2
        sentScrollView.documentView = sentTableView
        sentScrollView.hasVerticalScroller = true; sentScrollView.borderType = .bezelBorder
        sentScrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(sentScrollView)

        // Received history table (tag=3)
        recvHistLabel.font = NSFont.boldSystemFont(ofSize: 13)
        recvHistLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(recvHistLabel)

        let recvNameCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("name"))
        recvNameCol.title = "보낸 사람"; recvNameCol.width = 200
        let recvStatusCol = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("status"))
        recvStatusCol.title = "상태"; recvStatusCol.width = 80
        recvHistTableView.addTableColumn(recvNameCol)
        recvHistTableView.addTableColumn(recvStatusCol)
        recvHistTableView.delegate = self; recvHistTableView.dataSource = self
        recvHistTableView.rowHeight = 26; recvHistTableView.headerView = NSTableHeaderView()
        recvHistTableView.tag = 3
        recvHistScrollView.documentView = recvHistTableView
        recvHistScrollView.hasVerticalScroller = true; recvHistScrollView.borderType = .bezelBorder
        recvHistScrollView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(recvHistScrollView)
    }

    // MARK: – Data

    private func loadAll() {
        Task {
            async let partnerList = ShareAPI.listPartners()
            async let invList = ShareAPI.listInvitations()
            async let history = ShareAPI.fetchHistory()
            let (p, i, h) = (try? await partnerList, try? await invList, try? await history)
            await MainActor.run {
                self.partners = p ?? []
                self.invitations = (i ?? []).compactMap { dict in
                    guard let id = dict["id"] as? String,
                          let name = dict["fromUsername"] as? String,
                          let email = dict["fromEmail"] as? String else { return nil }
                    return Invitation(id: id, fromUsername: name, fromEmail: email)
                }
                self.sentHistory = h?.sent ?? []
                self.receivedHistory = h?.received ?? []
                self.tableView.reloadData()
                self.invTableView.reloadData()
                self.sentTableView.reloadData()
                self.recvHistTableView.reloadData()
            }
        }
    }

    @objc private func handleInvite() {
        let email = emailField.stringValue.trimmingCharacters(in: .whitespaces)
        guard !email.isEmpty else { showError("이메일을 입력해주세요."); return }
        guard email.contains("@"), email.contains(".") else {
            showError("올바른 이메일 형식이 아닙니다."); return
        }

        inviteButton.isEnabled = false
        errorLabel.isHidden = true

        Task {
            do {
                try await ShareAPI.sendInvite(email: email)
                await MainActor.run {
                    self.emailField.stringValue = ""
                    self.inviteButton.isEnabled = true
                    self.errorLabel.stringValue = "초대를 보냈습니다."
                    self.errorLabel.textColor = NSColor.systemGreen
                    self.errorLabel.isHidden = false
                }
            } catch let error as NSError {
                await MainActor.run {
                    let msg: String
                    switch error.code {
                    case 404: msg = "등록되지 않은 이메일입니다."
                    case 409: msg = error.localizedDescription
                    default:  msg = error.localizedDescription
                    }
                    self.errorLabel.textColor = NSColor.systemRed
                    self.showError(msg)
                    self.inviteButton.isEnabled = true
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

    func acceptInvitation(at row: Int) {
        let inv = invitations[row]
        Task {
            do {
                try await ShareAPI.acceptInvitation(id: inv.id)
                await MainActor.run {
                    self.invitations.remove(at: row)
                    self.invTableView.reloadData()
                }
                loadAll()  // refresh partners list
            } catch {}
        }
    }

    func rejectInvitation(at row: Int) {
        let inv = invitations[row]
        Task {
            try? await ShareAPI.rejectInvitation(id: inv.id)
            await MainActor.run {
                self.invitations.remove(at: row)
                self.invTableView.reloadData()
            }
        }
    }
}

// MARK: – NSTableViewDataSource / Delegate

extension SharePreferencesViewController: NSTableViewDataSource, NSTableViewDelegate {
    func numberOfRows(in tableView: NSTableView) -> Int {
        switch tableView.tag {
        case 0: return partners.count
        case 1: return invitations.count
        case 2: return sentHistory.count
        case 3: return receivedHistory.count
        default: return 0
        }
    }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        let colId = tableColumn?.identifier.rawValue ?? ""

        if tableView.tag == 0 {
            // Partners table
            let partner = partners[row]
            if colId == "remove" {
                let btn = NSButton(title: "제거", target: self, action: #selector(removeRow(_:)))
                btn.bezelStyle = .rounded
                btn.tag = row
                btn.font = NSFont.systemFont(ofSize: 11)
                return btn
            }
            let text = colId == "name" ? partner.username : partner.email
            let cell = NSTextField(labelWithString: text)
            cell.font = NSFont.systemFont(ofSize: 12)
            cell.textColor = colId == "email" ? NSColor.secondaryLabelColor : NSColor.labelColor
            return cell

        } else if tableView.tag == 1 {
            // Invitations table
            let inv = invitations[row]
            if colId == "accept" {
                let btn = NSButton(title: "수락", target: self, action: #selector(acceptRow(_:)))
                btn.bezelStyle = .rounded
                btn.tag = row
                btn.font = NSFont.systemFont(ofSize: 11)
                return btn
            }
            if colId == "reject" {
                let btn = NSButton(title: "거절", target: self, action: #selector(rejectRow(_:)))
                btn.bezelStyle = .rounded
                btn.tag = row
                btn.font = NSFont.systemFont(ofSize: 11)
                return btn
            }
            let cell = NSTextField(labelWithString: "\(inv.fromUsername) (\(inv.fromEmail))")
            cell.font = NSFont.systemFont(ofSize: 12)
            return cell

        } else if tableView.tag == 2 {
            // Sent history table
            let item = sentHistory[row]
            if colId == "status" {
                let statusMap = ["pending": "대기 중", "accepted": "수락됨", "rejected": "거절됨"]
                let colorMap: [String: NSColor] = ["pending": .systemOrange, "accepted": .systemGreen, "rejected": .systemRed]
                let cell = NSTextField(labelWithString: statusMap[item.status] ?? item.status)
                cell.font = NSFont.systemFont(ofSize: 11)
                cell.textColor = colorMap[item.status] ?? .secondaryLabelColor
                return cell
            }
            let name = item.toUsername ?? ""
            let email = item.toEmail ?? ""
            let cell = NSTextField(labelWithString: "\(name) (\(email))")
            cell.font = NSFont.systemFont(ofSize: 12)
            return cell

        } else {
            // Received history table (tag == 3)
            let item = receivedHistory[row]
            if colId == "status" {
                let statusMap = ["pending": "대기 중", "accepted": "수락됨", "rejected": "거절됨"]
                let colorMap: [String: NSColor] = ["pending": .systemOrange, "accepted": .systemGreen, "rejected": .systemRed]
                let cell = NSTextField(labelWithString: statusMap[item.status] ?? item.status)
                cell.font = NSFont.systemFont(ofSize: 11)
                cell.textColor = colorMap[item.status] ?? .secondaryLabelColor
                return cell
            }
            let name = item.fromUsername ?? ""
            let email = item.fromEmail ?? ""
            let cell = NSTextField(labelWithString: "\(name) (\(email))")
            cell.font = NSFont.systemFont(ofSize: 12)
            return cell
        }
    }

    @objc private func removeRow(_ sender: NSButton) { removePartner(at: sender.tag) }
    @objc private func acceptRow(_ sender: NSButton) { acceptInvitation(at: sender.tag) }
    @objc private func rejectRow(_ sender: NSButton) { rejectInvitation(at: sender.tag) }
}
