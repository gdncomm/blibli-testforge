import Combine
import Foundation

enum ReadinessRowStatus: Equatable {
	case waiting
	case working
	case passed
	case warning
	case blocking
}

struct ReadinessRowModel: Equatable, Identifiable {
	let id: String
	let title: String
	let detail: String
	let status: ReadinessRowStatus
	let fixAction: FixAction?
}

struct GetReadyContent: Equatable {
	let headline: String
	let progressFraction: Double
	let rows: [ReadinessRowModel]
}

enum GetReadyState: Equatable {
	case checking(GetReadyContent)
	case ready(GetReadyContent)
	case needsAttention(GetReadyContent)
}

struct GetReadyActions {
	let restartServer: () -> Void

	/// Proof folder + Test Batch fixes open the toolbar pill's panel and sheet (R4j).
	let testBatch: TestBatchFixActions

	/// D-190: opens the prerequisites sheet.
	let showPrerequisites: @MainActor () -> Void

	/// D-199: the Prepare code and Run queue sheets.
	let tools: GetReadyToolActions
}

struct GetReadyToolActions {
	let showPrepareCode: @MainActor () -> Void
	let showRunQueue: @MainActor () -> Void
}

struct TestBatchFixActions {
	let chooseProofFolder: @MainActor () -> Void
	let startTestBatch: @MainActor () -> Void
}

/// D-213: a readiness row's own fix progress and result, drawn on that row.
struct ReadinessFixState: Equatable {
	/// The "…ing" text while this row's fix runs; nil when idle.
	let busyTitle: String?
	/// D-223: the server accepted the fix and the row waits for its check to report back.
	let recheckMessage: String?
	let outcome: ReadinessFixOutcome?
}

/// A fix the server refused. An accepted one is shown as a recheck instead (D-223).
struct ReadinessFixOutcome: Equatable {
	let message: String
}

struct PendingFix: Identifiable, Equatable {
	let id: String
	let action: FixAction
}

/// The first-launch checklist (board C2): server start, live updates, then the server's readiness checks.
final class GetReadySectionViewModel: ObservableObject {
	@MainActor @Published private(set) var state: GetReadyState
	@MainActor @Published var pendingFix: PendingFix?
	@MainActor @Published private var runningFixTitles: [String: String] = [:]
	@MainActor @Published private var fixOutcomes: [String: ReadinessFixOutcome] = [:]
	@MainActor @Published private var rechecks: [String: ReadinessRecheck] = [:]

	/// Readiness checks the server reports today; keeps the bar from reading full before the first report.
	private let expectedCheckCount = 12

	private static let busyTitlesByPath = [
		"api/test-forge-sim/create": String(localized: "Creating…"),
		"api/test-forge-sim/boot": String(localized: "Booting…"),
		"api/test-forge-sim/solo": String(localized: "Shutting down…"),
		"api/build/qa": String(localized: "Starting the build…"),
		"api/harness/ensure": String(localized: "Starting harness…"),
		"api/code/free-space": String(localized: "Freeing space…"),
		"api/claude-env/configure": String(localized: "Setting up…")
	]

	private static let recheckMessagesByPath = [
		"api/build/qa": String(localized: "Build started — this row updates when it finishes"),
		"api/harness/ensure": String(localized: "Harness starting — this row updates when it answers")
	]

	private let store: StateStore
	private let fixService: ReadinessFixing
	private let actions: GetReadyActions
	@MainActor private var serverPhase: ServerPhase = .idle
	private var cancellables = Set<AnyCancellable>()
	private var fixTasks: [String: Task<Void, Never>] = [:]
	private var recheckTimers: [String: Task<Void, Never>] = [:]

	@MainActor
	init(store: StateStore, fixService: ReadinessFixing, actions: GetReadyActions) {
		self.store = store
		self.fixService = fixService
		self.actions = actions
		let emptyContent = GetReadyContent(headline: "", progressFraction: 0, rows: [])
		state = .checking(emptyContent)
		refresh()
		observeStore()
	}

	deinit {
		fixTasks.values.forEach { $0.cancel() }
		recheckTimers.values.forEach { $0.cancel() }
		cancellables.forEach { $0.cancel() }
	}

	@MainActor
	func update(serverPhase newPhase: ServerPhase) {
		serverPhase = newPhase
		refresh()
	}

	@MainActor
	func fixState(forRowId rowId: String) -> ReadinessFixState {
		ReadinessFixState(busyTitle: runningFixTitles[rowId], recheckMessage: rechecks[rowId]?.message, outcome: fixOutcomes[rowId])
	}

	@MainActor
	func requestFix(for row: ReadinessRowModel) {
		guard let action = row.fixAction,
			runningFixTitles[row.id] == nil,
			rechecks[row.id] == nil
		else {
			return
		}
		if action.confirmation == nil {
			runFix(action: action, rowId: row.id)
		} else {
			pendingFix = PendingFix(id: row.id, action: action)
		}
	}

	@MainActor
	func confirmPendingFix() {
		guard let pendingFix else {
			return
		}
		self.pendingFix = nil
		runFix(action: pendingFix.action, rowId: pendingFix.id)
	}

	@MainActor
	private func runFix(action: FixAction, rowId: String) {
		switch action.route {
			case .prepareCode:
				actions.tools.showPrepareCode()
				return
			case .showRunQueue:
				actions.tools.showRunQueue()
				return
			case .restartServer:
				actions.restartServer()
				return
			case .chooseProofFolder:
				actions.testBatch.chooseProofFolder()
				return
			case .startTestBatch:
				actions.testBatch.startTestBatch()
				return
			case .showPrerequisites:
				actions.showPrerequisites()
				return
			case .post:
				break
		}
		startPostFix(action: action, rowId: rowId)
	}

	/// One request per row; the row shows its spinner until the server answers, then the result on that row.
	@MainActor
	private func startPostFix(action: FixAction, rowId: String) {
		runningFixTitles[rowId] = Self.busyTitle(for: action)
		fixOutcomes[rowId] = nil
		fixTasks[rowId] = Task { [weak self, fixService] in
			let errorMessage = await fixService.run(action: action)
			await MainActor.run {
				self?.finishFix(rowId: rowId, action: action, errorMessage: errorMessage)
			}
		}
	}

	/// An accepted fix is not a result: the row keeps its spinner until the check reports back (D-223).
	@MainActor
	private func finishFix(rowId: String, action: FixAction, errorMessage: String?) {
		runningFixTitles[rowId] = nil
		fixTasks[rowId] = nil
		if let errorMessage {
			fixOutcomes[rowId] = ReadinessFixOutcome(message: errorMessage)
			return
		}
		let check = currentCheck(id: rowId)
		guard let check, !check.isPassing else {
			refresh()
			return
		}
		rechecks[rowId] = ReadinessRecheck(message: Self.recheckMessage(for: action), detailWhenStarted: check.detail, startedAt: Date())
		recheckTimers[rowId]?.cancel()
		let timeout = TestForgeConstants.GetReady.fixRecheckTimeoutSeconds
		recheckTimers[rowId] = Task { [weak self] in
			try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
			guard !Task.isCancelled else {
				return
			}
			await MainActor.run {
				self?.refresh()
			}
		}
		refresh()
	}

	@MainActor
	private func currentCheck(id: String) -> ReadinessCheck? {
		store.value(of: .readiness, as: ReadinessReport.self)?.checks.first { $0.id == id }
	}

	/// Drops the waits whose check has reported back; a fix that changed nothing shows the check as it is again.
	@MainActor
	private func settleRechecks(report: ReadinessReport?) {
		let now = Date()
		let timeout = TestForgeConstants.GetReady.fixRecheckTimeoutSeconds
		for (rowId, recheck) in rechecks {
			let check = report?.checks.first { $0.id == rowId }
			if recheck.isSettled(by: check, now: now, timeout: timeout) {
				rechecks[rowId] = nil
				recheckTimers.removeValue(forKey: rowId)?.cancel()
			}
		}
	}

	private static func recheckMessage(for action: FixAction) -> String {
		guard case .post(let path, _) = action.route,
			let message = recheckMessagesByPath[path]
		else {
			return String(localized: "Done — checking again…")
		}
		return message
	}

	private static func busyTitle(for action: FixAction) -> String {
		guard case .post(let path, _) = action.route,
			let title = busyTitlesByPath[path]
		else {
			return String(localized: "Working…")
		}
		return title
	}

	@MainActor
	private func observeStore() {
		store.$slices
			.combineLatest(store.$connection)
			.receive(on: DispatchQueue.main)
			.sink { [weak self] _ in
				self?.refresh()
			}
			.store(in: &cancellables)
	}

	@MainActor
	private func refresh() {
		let report = store.value(of: .readiness, as: ReadinessReport.self)
		settleRechecks(report: report)
		let content = makeContent(connection: store.connection, report: report)
		guard let report,
			store.connection == .live,
			!isServerFailed
		else {
			state = .checking(content)
			return
		}
		if report.isReady {
			// A fix's result is stale once every check is green.
			fixOutcomes = [:]
		}
		state = report.isReady ? .ready(content) : .needsAttention(content)
	}

	@MainActor
	private func makeContent(connection: StreamConnection, report: ReadinessReport?) -> GetReadyContent {
		let serverRow = makeServerRow(serverPhase: serverPhase)
		let streamRow = makeStreamRow(connection: connection)
		let checkRows = (report?.checks ?? []).map { check in
			makeCheckRow(check: check)
		}
		let rows = [serverRow, streamRow] + checkRows
		let settledCount = rows.filter { $0.status == .passed || $0.status == .warning }.count
		let checkCount = report?.checks.count ?? expectedCheckCount
		let totalCount = max(rows.count, 2 + checkCount)
		let attentionCount = rows.filter { $0.status == .blocking }.count
		let headline = makeHeadline(connection: connection, report: report, attentionCount: attentionCount)
		let progressFraction = Double(settledCount) / Double(totalCount)
		return GetReadyContent(headline: headline, progressFraction: progressFraction, rows: rows)
	}

	@MainActor
	private var isServerFailed: Bool {
		if case .failed = serverPhase {
			return true
		}
		return false
	}

	@MainActor
	private func makeHeadline(connection: StreamConnection, report: ReadinessReport?, attentionCount: Int) -> String {
		if isServerFailed {
			return String(localized: "The QA server stopped")
		}
		if case .reconnecting = connection {
			return String(localized: "Reconnecting to the QA server…")
		}
		guard let report else {
			return String(localized: "Getting everything ready…")
		}
		if report.isReady {
			return String(localized: "Ready to test")
		}
		return String(localized: "\(attentionCount) item(s) need you")
	}

	private func makeServerRow(serverPhase: ServerPhase) -> ReadinessRowModel {
		let title = String(localized: "Start the QA server")
		switch serverPhase {
			case .idle:
				return ReadinessRowModel(id: "server", title: title, detail: "", status: .waiting, fixAction: nil)
			case .checking:
				let detail = String(localized: "Looking for a server that's already running")
				return ReadinessRowModel(id: "server", title: title, detail: detail, status: .working, fixAction: nil)
			case .starting:
				let detail = String(localized: "Running start.sh — the console shows its output")
				return ReadinessRowModel(id: "server", title: title, detail: detail, status: .working, fixAction: nil)
			case .running(let isOwnedByApp):
				let detail = isOwnedByApp ? String(localized: "Started by this app") : String(localized: "Already running — this app connected to it")
				return ReadinessRowModel(id: "server", title: title, detail: detail, status: .passed, fixAction: nil)
			case .failed(let reason):
				let restartAction = FixAction(title: "Restart server", route: .restartServer, confirmation: nil)
				return ReadinessRowModel(id: "server", title: title, detail: reason, status: .blocking, fixAction: restartAction)
		}
	}

	private func makeStreamRow(connection: StreamConnection) -> ReadinessRowModel {
		let title = String(localized: "Connect to live updates")
		switch connection {
			case .notConnected:
				return ReadinessRowModel(id: "stream", title: title, detail: "", status: .waiting, fixAction: nil)
			case .connecting:
				let detail = String(localized: "Connecting…")
				return ReadinessRowModel(id: "stream", title: title, detail: detail, status: .working, fixAction: nil)
			case .live:
				let detail = String(localized: "Live — no polling")
				return ReadinessRowModel(id: "stream", title: title, detail: detail, status: .passed, fixAction: nil)
			case .reconnecting(let attempt, let retryInSeconds):
				let detail = String(localized: "Lost the connection — retry \(attempt) in \(retryInSeconds) s")
				return ReadinessRowModel(id: "stream", title: title, detail: detail, status: .working, fixAction: nil)
		}
	}

	/// A check the server is working on, or one waiting to report back after a fix, shows progress (D-223).
	@MainActor
	private func makeCheckRow(check: ReadinessCheck) -> ReadinessRowModel {
		let isInProgress = !check.isPassing && (check.isWorking || rechecks[check.id] != nil)
		let status: ReadinessRowStatus
		if check.isPassing {
			status = .passed
		} else if isInProgress {
			status = .working
		} else {
			status = check.level == "warn" ? .warning : .blocking
		}
		let fixAction = check.isPassing || isInProgress ? nil : check.fixId.flatMap { fixService.action(forFixId: $0) }
		let detail = makeCheckDetail(check: check)
		return ReadinessRowModel(id: check.id, title: check.label, detail: detail, status: status, fixAction: fixAction)
	}

	private func makeCheckDetail(check: ReadinessCheck) -> String {
		guard let reusedSince = check.reusedSince else {
			return check.detail
		}
		let time = reusedSince.formatted(date: .omitted, time: .shortened)
		return String(localized: "\(check.detail) · unchanged since \(time)")
	}
}
