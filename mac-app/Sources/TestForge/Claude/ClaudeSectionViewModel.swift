import Foundation

/// Which card button sent an answer; it stays pending until the stream says the request was resolved.
enum ClaudeRequestAction: Hashable {
	case approve
	case alwaysAllow
	case deny
	case sendAnswer
	case skip
}

struct ClaudeRequestStatus: Equatable {
	let outcome: String?
	let pendingAction: ClaudeRequestAction?
	let errorMessage: String?
}

struct ClaudeRequestStates: Equatable {
	let outcomes: [String: String]
	let pendingActions: [String: ClaudeRequestAction]
	let errors: [String: String]

	func status(for requestId: String) -> ClaudeRequestStatus {
		ClaudeRequestStatus(outcome: outcomes[requestId], pendingAction: pendingActions[requestId], errorMessage: errors[requestId])
	}
}

@MainActor
protocol ClaudeSectionPresenting: ObservableObject {
	var state: ClaudeSectionState { get }
	var items: [ClaudeTranscriptItem] { get }
	var outcomes: [String: String] { get }
	var requestStates: ClaudeRequestStates { get }
	var isSending: Bool { get }
	var isStopping: Bool { get }
	var stopErrorMessage: String? { get }
	var draft: String { get set }
	var attachesScreenshot: Bool { get set }
	var errorMessage: String? { get }
	var statusTitle: String { get }
	var canSend: Bool { get }
	var canStop: Bool { get }
	var sessions: [ClaudeSessionRow] { get }
	var selectedSessionId: String? { get }
	var showsDetails: Bool { get set }
	var quickReplies: [String] { get }
	var sessionChoices: [ClaudeSessionChoice] { get }
	var isAwaitingReply: Bool { get }
	var activity: ClaudeActivityModel? { get }

	/// D-222: `/mcp` in the app, shown as a sheet.
	var mcp: ClaudeMcpViewModel { get }
	var isShowingMcp: Bool { get set }
	var isOpeningTerminal: Bool { get }
	var terminalErrorMessage: String? { get }
	var canOpenInTerminal: Bool { get }

	func open()
	func send()

	/// Any session, e.g. a run's (D-147); the TestForge's own assistant when `sessionId` is nil.
	func show(sessionId: String?)

	func sendQuickReply(_ text: String)
	func stop()
	func startNewConversation()
	func approve(requestId: String, isAlways: Bool)
	func deny(requestId: String)

	/// `picks`: each question's chosen labels plus any typed answer; nil skips the question.
	func answer(requestId: String, picks: [String: [String]]?)

	/// Lists the session's MCP servers; typing `/mcp` in the message box does the same.
	func showMcp()

	/// Continues this conversation in a terminal `claude --resume` (D-222).
	func openInTerminal()
}

/// The TestForge's own Claude session in the selected repo (D-133), and any other session the server hosts — a run's,
/// a triage — with its full detail, approvals and questions, and a box to tell it what to do (D-147).
/// Whole-class `@MainActor` is deliberate: it only orchestrates published state; decoding and mapping run in the service.
@MainActor
final class ClaudeSectionViewModel: ClaudeSectionPresenting {
	@Published private(set) var state: ClaudeSectionState = .notStarted
	@Published private(set) var items: [ClaudeTranscriptItem] = []
	@Published private(set) var outcomes: [String: String] = [:]
	@Published var draft = ""
	@Published var attachesScreenshot = false
	@Published private(set) var errorMessage: String?
	@Published private(set) var isSending = false
	@Published private(set) var isStopping = false
	@Published private(set) var stopErrorMessage: String?
	@Published private(set) var pendingRequests: [String: ClaudeRequestAction] = [:]
	@Published private(set) var requestErrors: [String: String] = [:]
	@Published private(set) var sessions: [ClaudeSessionRow] = []
	@Published var showsDetails = false
	@Published var isShowingMcp = false
	@Published private(set) var isOpeningTerminal = false
	@Published private(set) var terminalErrorMessage: String?

	let mcp: ClaudeMcpViewModel

	private let service: ClaudeSessionServing
	private let terminal: TerminalLaunching
	private var streamTask: Task<Void, Never>?
	private var lastSeq = 0

	var statusTitle: String {
		switch state {
			case .notStarted:
				return String(localized: "Starts when the QA server is up")
			case .opening:
				return String(localized: "Opening…")
			case .ready(let summary):
				return ClaudeTranscriptMapper.statusTitle(summary.status)
			case .failed(let reason):
				return reason
		}
	}

	var requestStates: ClaudeRequestStates {
		ClaudeRequestStates(outcomes: outcomes, pendingActions: pendingRequests, errors: requestErrors)
	}

	var canSend: Bool {
		guard case .ready = state,
			!isSending
		else {
			return false
		}
		return !draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
	}

	var canStop: Bool {
		guard case .ready(let summary) = state else {
			return false
		}
		return summary.status == "running" || summary.status.hasPrefix("waiting")
	}

	var selectedSessionId: String? {
		sessionId
	}

	var isAwaitingReply: Bool {
		guard case .ready(let summary) = state,
			summary.status == "idle",
			case .assistant(let text) = items.last?.kind
		else {
			return false
		}
		return String(text.characters).trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix("?")
	}

	/// Claude asking in plain text gets quick answers; a run's session gets the usual follow-ups.
	var quickReplies: [String] {
		let isRunSession = sessions.first { $0.id == sessionId }?.isRun ?? false
		guard isRunSession else {
			return isAwaitingReply ? ClaudeConstants.QuickReply.answers : []
		}
		if canStop, !isAwaitingReply {
			return ClaudeConstants.QuickReply.runSteering
		}
		let followUps = ClaudeConstants.QuickReply.runFollowUps
		return isAwaitingReply ? ClaudeConstants.QuickReply.answers + followUps : followUps
	}

	var activity: ClaudeActivityModel? {
		guard case .ready(let summary) = state else {
			return nil
		}
		return ClaudeActivityMapper.activity(items: items, summary: summary)
	}

	/// Waiting on you first, then running, then the rest newest first; the assistant is always listed.
	var sessionChoices: [ClaudeSessionChoice] {
		let ordered = sessions
			.filter { $0.status != "closed" || $0.isRun }
			.sorted { lhs, rhs in
				if lhs.needsYou != rhs.needsYou {
					return lhs.needsYou
				}
				let isLhsRunning = lhs.status == "running"
				let isRhsRunning = rhs.status == "running"
				if isLhsRunning != isRhsRunning {
					return isLhsRunning
				}
				return lhs.updatedAt > rhs.updatedAt
			}
			.prefix(ClaudeConstants.Sessions.listLimit)
		return ordered.map { row in
			let title = row.isTestForge ? String(localized: "TestForge assistant") : row.title
			let detail = row.needsYou ? String(localized: "Needs you") : ClaudeTranscriptMapper.statusTitle(row.status)
			return ClaudeSessionChoice(id: row.id, title: title, detail: detail, needsYou: row.needsYou, isSelected: row.id == sessionId)
		}
	}

	init(service: ClaudeSessionServing, terminal: TerminalLaunching = ClaudeTerminalLauncher()) {
		self.service = service
		self.terminal = terminal
		mcp = ClaudeMcpViewModel(service: service)
	}

	/// A terminal takes over only between turns, so the two never write the conversation at once.
	var canOpenInTerminal: Bool {
		guard case .ready = state else {
			return false
		}
		return !canStop && !isOpeningTerminal
	}

	func showMcp() {
		guard let sessionId else {
			return
		}
		mcp.load(sessionId: sessionId)
		isShowingMcp = true
	}

	func openInTerminal() {
		guard let sessionId,
			canOpenInTerminal
		else {
			return
		}
		isOpeningTerminal = true
		terminalErrorMessage = nil
		let service = service
		let terminal = terminal
		Task { [weak self] in
			do {
				let handoff = try await service.handOffToTerminal(sessionId: sessionId)
				try terminal.run(command: handoff.command, name: "claude-\(handoff.claudeSessionId)")
			} catch {
				self?.terminalErrorMessage = String(localized: "Couldn't open Terminal: \(error.localizedDescription)")
			}
			self?.isOpeningTerminal = false
		}
	}

	deinit {
		streamTask?.cancel()
	}

	func open() {
		guard state == .notStarted || isFailed else {
			return
		}
		connect(isFresh: false)
	}

	func startNewConversation() {
		connect(isFresh: true)
	}

	/// The server's session list, from the live `queue` slice (passed in by the TestForge).
	func update(sessions newSessions: [ClaudeSessionRow]) {
		guard newSessions != sessions else {
			return
		}
		sessions = newSessions
	}

	func show(sessionId target: String?) {
		guard let target else {
			connect(isFresh: false)
			return
		}
		guard target != sessionId else {
			return
		}
		connect(sessionId: target)
	}

	func send() {
		guard canSend else {
			return
		}
		let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
		if text == ClaudeConstants.Commands.mcp {
			draft = ""
			showMcp()
			return
		}
		deliver(text)
	}

	func sendQuickReply(_ text: String) {
		guard case .ready = state,
			!isSending
		else {
			return
		}
		deliver(text)
	}

	func stop() {
		guard let sessionId,
			!isStopping
		else {
			return
		}
		isStopping = true
		stopErrorMessage = nil
		perform { service in
			try await service.interrupt(sessionId: sessionId)
		} completion: { [weak self] error in
			guard let error else {
				return
			}
			self?.isStopping = false
			self?.stopErrorMessage = error.localizedDescription
		}
	}

	func approve(requestId: String, isAlways: Bool) {
		let decision = ClaudeRequestDecision(requestId: requestId, isAllowed: true, isAlwaysAllowed: isAlways, answers: [:], message: nil)
		submit(decision, action: isAlways ? .alwaysAllow : .approve)
	}

	func deny(requestId: String) {
		let decision = ClaudeRequestDecision(requestId: requestId, isAllowed: false, isAlwaysAllowed: false, answers: [:], message: nil)
		submit(decision, action: .deny)
	}

	func answer(requestId: String, picks: [String: [String]]?) {
		guard let picks else {
			let message = String(localized: "The user skipped the question.")
			submit(ClaudeRequestDecision(requestId: requestId, isAllowed: false, isAlwaysAllowed: false, answers: [:], message: message), action: .skip)
			return
		}
		let answers = picks.mapValues { $0.joined(separator: ", ") }
		guard answers.values.allSatisfy({ !$0.isEmpty }) else {
			requestErrors[requestId] = String(localized: "Answer every question, or Skip")
			return
		}
		submit(ClaudeRequestDecision(requestId: requestId, isAllowed: true, isAlwaysAllowed: false, answers: answers, message: nil), action: .sendAnswer)
	}

	private var sessionId: String? {
		guard case .ready(let summary) = state else {
			return nil
		}
		return summary.id
	}

	private var isFailed: Bool {
		guard case .failed = state else {
			return false
		}
		return true
	}

	/// A closed session (a cancelled run) is reopened first; Claude resumes its own transcript (D-147).
	/// The draft is cleared only once the message went out, so a failed send keeps what was typed.
	private func deliver(_ text: String) {
		guard case .ready(let summary) = state else {
			return
		}
		let attachesScreenshot = attachesScreenshot
		let isClosed = summary.status == "closed"
		isSending = true
		perform { service in
			if isClosed {
				_ = try await service.reopen(sessionId: summary.id)
			}
			try await service.send(text: text, attachesScreenshot: attachesScreenshot, sessionId: summary.id)
		} completion: { [weak self] error in
			self?.didDeliver(text: text, error: error)
		}
	}

	private func didDeliver(text: String, error: Error?) {
		isSending = false
		guard error == nil,
			draft.trimmingCharacters(in: .whitespacesAndNewlines) == text
		else {
			return
		}
		draft = ""
	}

	private func connect(isFresh: Bool) {
		open { service in
			try await service.openTestForgeSession(isFresh: isFresh)
		}
	}

	private func connect(sessionId target: String) {
		open { service in
			try await service.session(id: target)
		}
	}

	private func open(_ load: @escaping (ClaudeSessionServing) async throws -> ClaudeSessionSummary) {
		streamTask?.cancel()
		state = .opening
		errorMessage = nil
		let service = service
		streamTask = Task { [weak self] in
			do {
				let summary = try await load(service)
				self?.begin(summary: summary)
				await self?.follow(sessionId: summary.id)
			} catch {
				self?.state = .failed(String(localized: "Couldn't open Claude: \(error.localizedDescription)"))
			}
		}
	}

	private func begin(summary: ClaudeSessionSummary) {
		items = []
		outcomes = [:]
		pendingRequests = [:]
		requestErrors = [:]
		isStopping = false
		lastSeq = 0
		state = .ready(summary)
	}

	/// Reconnects after the stream drops (a server restart), picking up after the last event seen.
	private func follow(sessionId: String) async {
		while !Task.isCancelled {
			do {
				for try await message in service.messages(sessionId: sessionId, afterSeq: lastSeq) {
					apply(message)
				}
			} catch {
				errorMessage = String(localized: "Lost the Claude stream — reconnecting")
			}
			try? await Task.sleep(nanoseconds: ClaudeConstants.Stream.reconnectDelayNanoseconds)
		}
	}

	private func apply(_ message: ClaudeStreamMessage) {
		switch message {
			case .items(let seq, let newItems):
				guard seq > lastSeq else {
					return
				}
				lastSeq = seq
				items.append(contentsOf: newItems.filter(isWorthShowing))
				errorMessage = nil
			case .resolved(let seq, let requestId, let outcome):
				lastSeq = max(lastSeq, seq)
				outcomes[requestId] = outcome
				pendingRequests[requestId] = nil
				requestErrors[requestId] = nil
			case .summary(let summary):
				state = .ready(summary)
				if !canStop {
					isStopping = false
				}
		}
	}

	private func isWorthShowing(_ item: ClaudeTranscriptItem) -> Bool {
		guard case .started = item.kind else {
			return true
		}
		return !items.contains { existing in
			if case .started = existing.kind {
				return true
			}
			return false
		}
	}

	/// The card stays pending after the answer is posted, until the stream reports the request resolved.
	private func submit(_ decision: ClaudeRequestDecision, action: ClaudeRequestAction) {
		let requestId = decision.requestId
		guard let sessionId,
			pendingRequests[requestId] == nil
		else {
			return
		}
		pendingRequests[requestId] = action
		requestErrors[requestId] = nil
		let service = service
		Task { [weak self] in
			do {
				try await service.answer(decision, sessionId: sessionId)
			} catch {
				self?.pendingRequests[requestId] = nil
				self?.requestErrors[requestId] = error.localizedDescription
			}
		}
	}

	private func perform(
		_ work: @escaping (ClaudeSessionServing) async throws -> Void,
		completion: @escaping (_ error: Error?) -> Void
	) {
		errorMessage = nil
		let service = service
		Task { [weak self] in
			do {
				try await work(service)
				completion(nil)
			} catch {
				self?.errorMessage = error.localizedDescription
				completion(error)
			}
		}
	}
}
