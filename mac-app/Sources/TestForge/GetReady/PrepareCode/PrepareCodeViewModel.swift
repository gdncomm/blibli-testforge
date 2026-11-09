import Combine
import Foundation

/// Get Ready › Prepare code (D-199): which code the QA copy holds — a GitHub branch or a snapshot of the working copy.
/// Whole-class `@MainActor`: it only orchestrates published state; git and copying run on the server.
@MainActor
final class PrepareCodeViewModel: ObservableObject {
	private static let maxBranchMatches = 8
	private static let preferredRepoNames = ["BlibliIOSApp-POC", "BlibliIOSApp"]
	private static let toolOutputIndent = "    "

	@Published var isShown = false
	@Published private(set) var phase: PrepareCodePhase = .loading
	@Published private(set) var repositories: [CodeRepository] = []
	@Published private(set) var current: PreparedCodeSummary?
	@Published private(set) var progress: [PrepareProgressLine] = []
	@Published private(set) var branchNote = ""
	@Published private(set) var isAskingGitHub = false
	@Published private(set) var isCancelling = false
	@Published private(set) var cancelError: String?
	@Published var branchQuery = ""
	@Published var selectedBranch: String?

	@Published var source: CodeSource = .github {
		didSet {
			refreshBranchNote()
		}
	}

	@Published var selectedRepoPath: String? {
		didSet {
			guard oldValue != selectedRepoPath else {
				return
			}
			branches = []
			selectedBranch = nil
			loadBranches(isAskingGitHub: false)
		}
	}

	private var branches: [CodeBranch] = []
	private var jobId: String?
	private let service: CodePreparing
	private let logFollower: TestForgeBuildActing
	private var loadTask: Task<Void, Never>?
	private var branchTask: Task<Void, Never>?
	private var prepareTask: Task<Void, Never>?

	init(service: CodePreparing, logFollower: TestForgeBuildActing) {
		self.service = service
		self.logFollower = logFollower
	}

	deinit {
		loadTask?.cancel()
		branchTask?.cancel()
		prepareTask?.cancel()
	}

	var selectedRepository: CodeRepository? {
		repositories.first { $0.path == selectedRepoPath }
	}

	var branchMatches: [CodeBranch] {
		let query = branchQuery.trimmingCharacters(in: .whitespaces).lowercased()
		let matches = query.isEmpty ? branches : branches.filter { $0.name.lowercased().contains(query) }
		return Array(matches.prefix(Self.maxBranchMatches))
	}

	var canPrepare: Bool {
		guard selectedRepository != nil,
			phase != .preparing
		else {
			return false
		}
		return source == .local || selectedBranch != nil
	}

	var prepareTitle: String {
		if source == .local {
			return String(localized: "Snapshot my working copy")
		}
		guard let selectedBranch else {
			return String(localized: "Pick a branch first")
		}
		return String(localized: "Prepare \(selectedBranch)")
	}

	var localNote: String {
		guard let repository = selectedRepository else {
			return String(localized: "Pick a repository.")
		}
		let changes = repository.isDirty ? String(localized: "Uncommitted changes are included.") : String(localized: "No uncommitted changes.")
		return String(localized: "Tests your working copy as it is now, on \(repository.branch). \(changes) Your repository is only read; it's copied to a separate QA folder.")
	}

	func show() {
		isShown = true
		load()
	}

	func choose(branch: CodeBranch) {
		selectedBranch = branch.name
		branchQuery = branch.name
		refreshBranchNote()
	}

	func askGitHub() {
		loadBranches(isAskingGitHub: true)
	}

	func prepare() {
		guard let repository = selectedRepository,
			canPrepare
		else {
			return
		}
		let branch = source == .github ? selectedBranch : nil
		let source = source
		progress = []
		isCancelling = false
		cancelError = nil
		phase = .preparing
		prepareTask?.cancel()
		prepareTask = Task { [weak self, service, logFollower] in
			do {
				let jobId = try await service.prepare(repoPath: repository.path, source: source, branch: branch)
				self?.jobId = jobId
				try await logFollower.followLog(jobId: jobId) { line in
					self?.append(line: line)
				}
				let result = try await service.result(jobId: jobId)
				self?.finish(result: result)
			} catch {
				self?.isCancelling = false
				self?.phase = .finished(message: error.localizedDescription, isSuccess: false)
			}
		}
	}

	/// Stays "Cancelling…" until the job reports back; a refused cancel shows next to the button.
	func cancel() {
		guard !isCancelling else {
			return
		}
		guard let jobId else {
			cancelError = String(localized: "Still starting — try again in a moment.")
			return
		}
		isCancelling = true
		cancelError = nil
		Task { [weak self, service] in
			do {
				try await service.cancel(jobId: jobId)
			} catch {
				self?.isCancelling = false
				self?.cancelError = String(localized: "Couldn't cancel: \(error.localizedDescription)")
			}
		}
	}

	private func load() {
		phase = .loading
		loadTask?.cancel()
		loadTask = Task { [weak self, service] in
			do {
				async let repositories = service.repositories()
				async let current = service.current()
				let (loadedRepositories, loadedCurrent) = try await (repositories, current)
				self?.apply(repositories: loadedRepositories, current: loadedCurrent)
			} catch {
				self?.phase = .failed(message: error.localizedDescription)
			}
		}
	}

	private func apply(repositories: [CodeRepository], current: PreparedCodeSummary?) {
		self.repositories = repositories
		self.current = current
		if current?.source == CodeSource.local.rawValue {
			source = .local
		}
		phase = .choosing
		let preferred = Self.preferredRepoNames.lazy.compactMap { name in repositories.first { $0.name == name } }.first
		selectedRepoPath = selectedRepoPath ?? (preferred ?? repositories.first)?.path
	}

	private func loadBranches(isAskingGitHub: Bool) {
		guard let repoPath = selectedRepoPath else {
			return
		}
		self.isAskingGitHub = isAskingGitHub
		branchTask?.cancel()
		branchTask = Task { [weak self, service] in
			do {
				let branches = try await service.branches(repoPath: repoPath, isAskingGitHub: isAskingGitHub)
				guard !Task.isCancelled else {
					return
				}
				self?.branches = branches
				self?.isAskingGitHub = false
				self?.refreshBranchNote()
			} catch {
				self?.isAskingGitHub = false
				self?.branchNote = isAskingGitHub ? String(localized: "Can't reach GitHub. Is the VPN on?") : error.localizedDescription
			}
		}
	}

	private func refreshBranchNote() {
		let known = branches.first { $0.name == selectedBranch }
		if let known,
			!known.isOnGitHub
		{
			branchNote = String(localized: "\(known.name) is only on this Mac. Use My working copy to test it.")
			return
		}
		branchNote = String(localized: "\(branches.count) branches, from your repo's last fetch. Check GitHub for newer ones.")
	}

	private func append(line: String) {
		let trimmed = line.trimmingCharacters(in: .whitespaces)
		guard !trimmed.isEmpty else {
			return
		}
		if line.hasPrefix(Self.toolOutputIndent),
			let last = progress.popLast()
		{
			progress.append(PrepareProgressLine(id: last.id, text: last.text, kind: last.kind, toolOutput: trimmed))
			return
		}
		let kind: PrepareProgressLine.Kind
		if trimmed.hasPrefix("!") {
			kind = .failed
		} else if trimmed.hasPrefix("✓") || trimmed.hasPrefix("●") {
			kind = .done
		} else {
			kind = .doing
		}
		if kind != .failed,
			let last = progress.last,
			last.kind == .doing
		{
			progress[progress.count - 1] = PrepareProgressLine(id: last.id, text: last.text, kind: .done, toolOutput: last.toolOutput)
		}
		let text = String(trimmed.drop { "▸✓●! ".contains($0) })
		progress.append(PrepareProgressLine(id: progress.count, text: text, kind: kind, toolOutput: nil))
	}

	private func finish(result: PrepareJobResult) {
		jobId = nil
		isCancelling = false
		switch result.status {
			case "done":
				phase = .finished(message: String(localized: "Code ready: \(result.verdict). Build the app next if Get Ready asks."), isSuccess: true)
				load()
			case "cancelled":
				phase = .finished(message: String(localized: "Prepare cancelled."), isSuccess: false)
			default:
				let isNetwork = result.verdict.range(of: "VPN|GitHub|resolve host|Could not read from remote", options: .regularExpression) != nil
				let message = isNetwork ? String(localized: "Can't reach GitHub. Turn the VPN on, then try again.") : result.verdict
				phase = .finished(message: message, isSuccess: false)
		}
	}
}
