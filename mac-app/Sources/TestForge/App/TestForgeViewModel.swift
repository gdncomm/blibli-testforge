import AppKit
import Combine
import Foundation
import SwiftUI

struct TestForgeServices {
	let supervisor: ServerSupervising
	let store: StateStore
	let consoleLog: ConsoleLog
	let logTailer: ServerLogTailer
	let fixService: ReadinessFixing
	let testCaseService: TestCaseActing
	let scanService: ScanActing
	let macroRecording: MacroRecording
	let advancedService: MockActing & MacroActing & DriverCommanding
	let resultsService: ResultsActing
	let runControlService: RunStopping
	let notifier: FinishNotifying
	let dockBadge: DockBadging
	let preferences: TestForgePreferences
	let simulatorLocator: SimulatorLocating
	let deviceScreenService: DeviceScreenReading
	let layerCapture: LayerCapturing
	let overlayPresenter: StepOverlayPresenting
	let desktop: DesktopActing
	let notificationCenter: NotificationCenter
	let tutorials: TutorialCoordinator
	let simulatorControl: SimulatorControlling
	let testForgeBuild: TestForgeBuildActing
	let xcodeTools: XcodeToolsActing
	let builtAppLauncher: BuiltAppLaunching
	let reset: ResetActing
	let testBatch: TestBatchActing
	let prerequisites: PrerequisitesListing
	let simulatorScreen: SimulatorScreenReading
	let testDevice: TestDeviceActing
	let deeplinks: DeeplinkProviding
	let bundles: BundleActing
	let sessionExport: SessionExporting
	let sessionReport: SessionReporting
	let demoLibrary: DemoLibraryListing
	let networkConsole: NetworkConsoleServing
	let setup: SetupDependencies
	let update: AppUpdating
	let claudeSession: ClaudeSessionServing
	let usageTap: UsageTapInstalling
	let remoteControl: RemoteControlActing

	/// D-199: what moved here from the web UI — Prepare code, Run queue, test logins, run popups.
	let tools: TestForgeToolServices

	/// True for a DMG install before a repo is chosen: Setup shows and no server starts.
	let isSetupNeeded: Bool
}

struct TestForgeToolServices {
	let codePrepare: CodePreparing
	let runQueue: RunQueueManaging
	let logins: LoginsManaging
	let runPrompt: RunPromptAnswering
	let git: GitControlling
}

struct ConnectionStatusModel: Equatable {
	let title: String
	let symbolName: String
	let isHealthy: Bool
	let canReconnect: Bool
}

/// Owns the page: starts the server, connects live updates, and builds the section view models.
/// Whole-class `@MainActor` is deliberate: every method only orchestrates published state; server work runs in the services.
@MainActor
final class TestForgeViewModel: ObservableObject {
	@Published var selectedSection: TestForgeSection = .getReady {
		didSet {
			clearBadgeIfViewingOutcome()
		}
	}

	@Published var isConsoleVisible = true
	@Published var sidebarVisibility: NavigationSplitViewVisibility = .all
	@Published private(set) var windowMinWidth = TestForgeConstants.Window.minWidth

	/// Approvals and questions waiting across every Claude session; badges Claude in the sidebar (D-147).
	@Published private(set) var claudeAttentionCount = 0
	private var notifiedRequestIds = Set<String>()
	@Published private(set) var serverPhase: ServerPhase = .idle
	@Published private(set) var connection: StreamConnection = .notConnected

	let getReadyViewModel: GetReadySectionViewModel
	let getReadyCompanions: GetReadyCompanions
	let loginsViewModel: LoginsViewModel
	let runPromptViewModel: RunPromptViewModel
	let consoleViewModel: ConsoleSectionViewModel
	let testsViewModel: TestsSectionViewModel
	let sessionExportViewModel: SessionExportViewModel
	let testsCompanions: TestsCompanions
	let scanViewModel: ScanSectionViewModel
	let flowMapViewModel: FlowMapViewModel
	let resultsViewModel: ResultsSectionViewModel
	let reportsViewModel: ReportsSectionViewModel
	let sessionReportViewModel: SessionReportViewModel
	let demoLibraryViewModel: DemoLibraryViewModel
	let reportsNavigator: ReportsNavigator
	let batchReportsViewModel: BatchReportsViewModel
	let runActivityViewModel: RunActivityViewModel
	let stepOverlayViewModel: StepOverlayViewModel
	let measureViewModel: MeasureViewModel
	let proofViewerViewModel: ProofViewerViewModel
	let advancedViewModel: AdvancedSectionViewModel
	let networkConsoleViewModel: NetworkConsoleViewModel
	let preferences: TestForgePreferences
	let tutorials: TutorialCoordinator
	let demoViewModel: DemoRunViewModel
	let simulatorControlViewModel: SimulatorControlViewModel
	let buildViewModel: BuildSectionViewModel
	let resetViewModel: ResetSectionViewModel
	let testBatchViewModel: TestBatchViewModel
	let setupViewModel: SetupViewModel
	let updateViewModel: UpdateViewModel
	let claudeViewModel: ClaudeSectionViewModel
	let docsViewModel: DocsViewModel

	/// The sidebar and console as they were before the Docs page went Full, put back when it leaves (D-218).
	var layoutBeforeDocsFull: DocsFullLayout.Saved?
	var docsCancellables = Set<AnyCancellable>()
	private(set) lazy var usageBarViewModel = UsageBarViewModel(store: services.store, service: services.usageTap)
	private(set) lazy var remoteControlViewModel = RemoteControlViewModel(
		store: services.store,
		service: services.remoteControl,
		desktop: services.desktop
	)
	let onboardingViewModel = OnboardingViewModel()

	private let services: TestForgeServices
	private var cancellables = Set<AnyCancellable>()
	private var startTask: Task<Void, Never>?
	private let restartRequests: PassthroughSubject<Void, Never>

	var dashboardDirectory: URL {
		services.supervisor.location.dashboardDirectory
	}

	var connectionStatus: ConnectionStatusModel {
		switch connection {
			case .live:
				let title = String(localized: "Live")
				return ConnectionStatusModel(title: title, symbolName: "dot.radiowaves.left.and.right", isHealthy: true, canReconnect: false)
			case .connecting:
				let title = String(localized: "Connecting…")
				return ConnectionStatusModel(title: title, symbolName: "arrow.triangle.2.circlepath", isHealthy: false, canReconnect: false)
			case .reconnecting(let attempt, _):
				let title = String(localized: "Reconnecting (\(attempt))…")
				return ConnectionStatusModel(title: title, symbolName: "arrow.triangle.2.circlepath", isHealthy: false, canReconnect: true)
			case .notConnected:
				let title = String(localized: "Not connected")
				return ConnectionStatusModel(title: title, symbolName: "bolt.horizontal.circle", isHealthy: false, canReconnect: serverPhase != .idle)
		}
	}

	var canRestartServer: Bool {
		services.supervisor.isOwningServer
	}

	init(services: TestForgeServices) {
		self.services = services
		let desktop = services.desktop
		let restartRequests = PassthroughSubject<Void, Never>()
		self.restartRequests = restartRequests
		let batchViewModel = Self.makeTestBatchViewModel(services: services)
		testBatchViewModel = batchViewModel
		let testBatchFixes = Self.testBatchFixes(for: batchViewModel)
		(getReadyViewModel, getReadyCompanions) = Self.makeGetReady(services: services, restartRequests: restartRequests, fixes: testBatchFixes)
		(loginsViewModel, runPromptViewModel) = Self.makeToolViewModels(services: services)
		let testCaseMedia = TestCaseMediaViewModel(service: services.testCaseService, desktop: desktop)
		testsViewModel = TestsSectionViewModel(store: services.store, service: services.testCaseService, media: testCaseMedia)
		sessionExportViewModel = SessionExportViewModel(service: services.sessionExport, desktop: desktop)
		testsCompanions = Self.makeTestsCompanions(services: services, sessionExport: sessionExportViewModel)
		scanViewModel = ScanSectionViewModel(store: services.store, service: services.scanService, desktop: desktop)
		flowMapViewModel = Self.makeFlowMapViewModel(services: services)
		resultsViewModel = Self.makeResultsViewModel(services: services)
		proofViewerViewModel = ProofViewerViewModel(desktop: desktop)
		reportsViewModel = ReportsSectionViewModel(store: services.store, service: services.resultsService, desktop: desktop)
		sessionReportViewModel = SessionReportViewModel(service: services.sessionReport, desktop: desktop)
		demoLibraryViewModel = DemoLibraryViewModel(service: services.demoLibrary, desktop: desktop)
		(reportsNavigator, batchReportsViewModel) = Self.makeBatchReports(services: services)
		let activityDependencies = RunActivityDependencies(
			store: services.store,
			service: services.runControlService,
			resultsService: services.resultsService,
			notifier: services.notifier,
			dockBadge: services.dockBadge,
			preferences: services.preferences
		)
		runActivityViewModel = RunActivityViewModel(dependencies: activityDependencies)
		let overlayDependencies = StepOverlayDependencies(
			store: services.store,
			locator: services.simulatorLocator,
			deviceScreenService: services.deviceScreenService,
			presenter: services.overlayPresenter,
			preferences: services.preferences
		)
		stepOverlayViewModel = StepOverlayViewModel(dependencies: overlayDependencies)
		let store = services.store
		let measureDependencies = MeasureDependencies(
			locator: services.simulatorLocator,
			screenReader: services.simulatorScreen,
			desktop: services.desktop,
			layerCapture: services.layerCapture,
			isDeviceBusy: {
				let isRunning = store.value(of: .queue, as: QueueState.self)?.hasActiveTask ?? false
				let isScanning = store.value(of: .scan, as: ScanState.self)?.isActive ?? false
				return isRunning || isScanning
			}
		)
		measureViewModel = MeasureViewModel(dependencies: measureDependencies)
		let advancedServices = AdvancedServices(
			store: services.store,
			mockService: services.advancedService,
			macroService: services.advancedService,
			driverService: services.advancedService
		)
		advancedViewModel = AdvancedSectionViewModel(services: advancedServices)
		networkConsoleViewModel = Self.makeNetworkConsoleViewModel(service: services.networkConsole, desktop: services.desktop)
		preferences = services.preferences
		tutorials = services.tutorials
		demoViewModel = Self.makeDemoViewModel(services: services)
		let simulatorViewModel = Self.makeSimulatorControlViewModel(services: services)
		simulatorControlViewModel = simulatorViewModel
		let buildSectionViewModel = Self.makeBuildViewModel(services: services, simulatorViewModel: simulatorViewModel)
		buildViewModel = buildSectionViewModel
		resetViewModel = Self.makeResetViewModel(services: services, buildViewModel: buildSectionViewModel)
		claudeViewModel = ClaudeSectionViewModel(service: services.claudeSession)
		docsViewModel = Self.makeDocsViewModel(services: services)
		setupViewModel = Self.makeSetupViewModel(services: services)
		updateViewModel = UpdateViewModel(service: services.update, system: services.setup.system)
		consoleViewModel = ConsoleSectionViewModel(log: services.consoleLog) { desktop.copy(text: $0) }
		observeConnection()
		observeTermination()
		observeServerPhase()
		observeRestartRequests()
		windowMinWidthUpdates.assign(to: &$windowMinWidth)
		services.notifier.openResults = { [weak self] in
			self?.selectedSection = .results
		}
		connectNavigators()
		observeDocsLayout()
	}

	deinit {
		startTask?.cancel()
	}

	var isSetupNeeded: Bool {
		services.isSetupNeeded
	}

	func start() {
		guard !isSetupNeeded,
			serverPhase == .idle
		else {
			return
		}
		services.logTailer.start()
		updateViewModel.checkQuietly()
		runServerTask { supervisor in
			await supervisor.start()
		}
	}

	func restartServer() {
		guard canRestartServer else {
			return
		}
		runServerTask { supervisor in
			await supervisor.restart()
		}
	}

	func reconnect() {
		services.store.connect(to: services.supervisor.location.streamURL)
	}

	func toggleConsole() {
		isConsoleVisible.toggle()
	}

	func toggleStepOverlay() {
		preferences.isStepOverlayOn.toggle()
	}

	/// The main window is SwiftUI's, found by the scene id it carries in its identifier.
	private func runServerTask(operation: @escaping (ServerSupervising) async -> ServerPhase) {
		startTask?.cancel()
		setServerPhase(to: .checking)
		let supervisor = services.supervisor
		startTask = Task { [weak self] in
			let phase = await operation(supervisor)
			self?.handleServerResult(phase: phase)
		}
	}

	private func handleServerResult(phase: ServerPhase) {
		setServerPhase(to: phase)
		if case .running = phase {
			reconnect()
		}
	}

	private func setServerPhase(to phase: ServerPhase) {
		serverPhase = phase
		getReadyViewModel.update(serverPhase: phase)
		if case .running = phase {
			claudeViewModel.open()
			Task { [weak self] in
				await self?.preferTestDeviceWindow()
			}
		}
	}

	/// The badge counts failures the person has not looked at; opening the screens that show them clears it.
	private func clearBadgeIfViewingOutcome() {
		guard [.results, .tests].contains(selectedSection) else {
			return
		}
		runActivityViewModel.clearBadge()
	}

	private func observeRestartRequests() {
		restartRequests
			.sink { [weak self] in
				self?.restartServer()
			}
			.store(in: &cancellables)
	}

	private func observeServerPhase() {
		services.supervisor.phaseDidChange = { [weak self] phase in
			Task { @MainActor in
				self?.setServerPhase(to: phase)
			}
		}
	}

	var sidebarBadges: [TestForgeSection: Int] {
		claudeAttentionCount > 0 ? [.claude: claudeAttentionCount] : [:]
	}

	func showClaudeSession(_ sessionId: String) {
		selectedSection = .claude
		claudeViewModel.show(sessionId: sessionId)
	}

	/// Feeds the Claude section's switcher and the badge; a request not seen before raises a notification.
	private func observeClaudeSessions() {
		services.store.$slices
			.receive(on: DispatchQueue.main)
			.sink { [weak self] _ in
				self?.updateClaudeSessions()
			}
			.store(in: &cancellables)
	}

	private func updateClaudeSessions() {
		let sessions = services.store.value(of: .queue, as: QueueState.self)?.sessions ?? []
		claudeViewModel.update(sessions: sessions)
		let waiting = sessions.filter(\.needsYou)
		let count = waiting.reduce(0) { $0 + $1.pendingRequestIds.count }
		if count != claudeAttentionCount {
			claudeAttentionCount = count
		}
		for session in waiting {
			let newRequests = session.pendingRequestIds.filter { !notifiedRequestIds.contains($0) }
			guard !newRequests.isEmpty else {
				continue
			}
			notifiedRequestIds.formUnion(newRequests)
			let isQuestion = session.pendingKinds.contains("question")
			let body = isQuestion ? String(localized: "Claude is asking you something") : String(localized: "Claude needs your approval to continue")
			services.notifier.post(notice: FinishNotice(title: session.title, body: body, claudeSessionId: session.id))
		}
	}

	private func observeConnection() {
		services.store.$connection
			.receive(on: DispatchQueue.main)
			.sink { [weak self] connection in
				self?.connection = connection
			}
			.store(in: &cancellables)
	}

	/// A test still in progress keeps the server alive, so reopening the app reconnects to it (#9).
	private func observeTermination() {
		services.notificationCenter.publisher(for: NSApplication.willTerminateNotification)
			.sink { [weak self] _ in
				self?.prepareToQuit()
			}
			.store(in: &cancellables)
	}

	private func prepareToQuit() {
		let queue = services.store.value(of: .queue, as: QueueState.self)
		let isRunInProgress = queue?.hasActiveTask ?? false
		services.supervisor.stopOnQuit(isRunInProgress: isRunInProgress)
	}
}

private extension TestForgeViewModel {
	private func connectNavigators() {
		demoViewModel.navigator = self
		onboardingViewModel.actions = makeOnboardingActions()
		services.notifier.openClaudeSession = { [weak self] sessionId in
			self?.showClaudeSession(sessionId)
		}
		testsViewModel.openClaudeSession = { [weak self] sessionId in
			self?.showClaudeSession(sessionId)
		}
		testBatchViewModel.openBatchReport = { [weak self] batchId in
			self?.reportsNavigator.showBatch(id: batchId)
			self?.selectedSection = .reports
		}
		observeClaudeSessions()
	}

	static func makeSetupViewModel(services: TestForgeServices) -> SetupViewModel {
		let currentDashboard = services.isSetupNeeded ? nil : services.supervisor.location.dashboardDirectory
		return SetupViewModel(dependencies: services.setup, currentDashboard: currentDashboard)
	}

	static func makeFlowMapViewModel(services: TestForgeServices) -> FlowMapViewModel {
		let dependencies = FlowMapDependencies(
			locator: services.simulatorLocator,
			simulatorControl: services.simulatorControl,
			store: FileFlowMapStore(),
			monitor: GlobalPointerMonitor(),
			desktop: services.desktop,
			screenReader: services.simulatorScreen,
			notifier: services.notifier,
			stateStore: services.store,
			macroService: services.macroRecording
		)
		return FlowMapViewModel(dependencies: dependencies)
	}

	static func makeSimulatorControlViewModel(services: TestForgeServices) -> SimulatorControlViewModel {
		let dependencies = SimulatorControlDependencies(
			service: services.simulatorControl,
			store: services.store,
			desktop: services.desktop,
			testDevice: services.testDevice,
			deeplinks: services.deeplinks
		)
		return SimulatorControlViewModel(dependencies: dependencies)
	}

	/// "Install & launch" targets the Simulator screen's device, so the Build screen reads that selection.
	static func makeBuildViewModel(services: TestForgeServices, simulatorViewModel: SimulatorControlViewModel) -> BuildSectionViewModel {
		let dependencies = BuildSectionDependencies(
			testForgeBuild: services.testForgeBuild,
			tools: services.xcodeTools,
			store: services.store,
			launcher: services.builtAppLauncher,
			deviceScreen: services.deviceScreenService
		) {
			simulatorViewModel.selectedDevice
		}
		return BuildSectionViewModel(dependencies: dependencies)
	}

	static func makeGetReady(
		services: TestForgeServices,
		restartRequests: PassthroughSubject<Void, Never>,
		fixes testBatchFixes: TestBatchFixActions
	) -> (GetReadySectionViewModel, GetReadyCompanions) {
		let companions = GetReadyCompanions(
			prerequisites: PrerequisitesViewModel(service: services.prerequisites, desktop: services.desktop),
			prepareCode: PrepareCodeViewModel(service: services.tools.codePrepare, logFollower: services.testForgeBuild),
			runQueue: RunQueueViewModel(store: services.store, service: services.tools.runQueue),
			git: GitControlViewModel(services: GitControlServices(git: services.tools.git, code: services.tools.codePrepare))
		)
		let actions = GetReadyActions(
			restartServer: { restartRequests.send() },
			testBatch: testBatchFixes,
			showPrerequisites: { companions.prerequisites.show() },
			tools: GetReadyToolActions(
				showPrepareCode: { companions.prepareCode.show() },
				showRunQueue: { companions.runQueue.show() }
			)
		)
		return (GetReadySectionViewModel(store: services.store, fixService: services.fixService, actions: actions), companions)
	}

	static func makeToolViewModels(services: TestForgeServices) -> (LoginsViewModel, RunPromptViewModel) {
		let logins = LoginsViewModel(service: services.tools.logins, desktop: services.desktop)
		return (logins, RunPromptViewModel(store: services.store, service: services.tools.runPrompt))
	}

	static func makeTestsCompanions(services: TestForgeServices, sessionExport: SessionExportViewModel) -> TestsCompanions {
		let batchPlan = BatchPlanViewModel(service: services.testCaseService)
		let verifyChanges = VerifyChangesViewModel(service: services.testCaseService)
		verifyChanges.planReplay = { [weak batchPlan] caseIds in
			batchPlan?.request(caseIds: caseIds)
		}
		return TestsCompanions(
			sessionExport: sessionExport,
			batchPlan: batchPlan,
			jiraPost: JiraPostViewModel(service: services.testCaseService),
			caseInputs: CaseInputsViewModel(service: services.macroRecording, desktop: services.desktop),
			verifyChanges: verifyChanges
		)
	}

	static func makeBatchReports(services: TestForgeServices) -> (ReportsNavigator, BatchReportsViewModel) {
		let navigator = ReportsNavigator()
		let dependencies = BatchReportsDependencies(store: services.store, service: services.testBatch, desktop: services.desktop, navigator: navigator)
		return (navigator, BatchReportsViewModel(dependencies: dependencies))
	}

	static func makeTestBatchViewModel(services: TestForgeServices) -> TestBatchViewModel {
		let dependencies = TestBatchDependencies(service: services.testBatch, store: services.store, desktop: services.desktop)
		return TestBatchViewModel(dependencies: dependencies)
	}

	/// Get ready's proof-folder and Test Batch rows open the same panel and sheet as the toolbar pill.
	static func testBatchFixes(for viewModel: TestBatchViewModel) -> TestBatchFixActions {
		TestBatchFixActions(
			chooseProofFolder: { [weak viewModel] in viewModel?.chooseProofFolder() },
			startTestBatch: { [weak viewModel] in viewModel?.requestStart() }
		)
	}

	/// After a reset, Build's own sizes and QA build state are stale, so it reloads them.
	static func makeResetViewModel(services: TestForgeServices, buildViewModel: BuildSectionViewModel) -> ResetSectionViewModel {
		let dependencies = ResetSectionDependencies(reset: services.reset, store: services.store) { [weak buildViewModel] in
			buildViewModel?.load()
		}
		return ResetSectionViewModel(dependencies: dependencies)
	}
}

extension TestForgeViewModel: NetworkConsoleOpening {}

extension TestForgeViewModel {
	/// Tells the Simulator bridge which window is the test device's, for Measure and the step outline; returns its name.
	@discardableResult
	func preferTestDeviceWindow() async -> String? {
		let device = try? await services.testDevice.current()
		services.simulatorLocator.prefer(deviceName: device?.name)
		return device?.name
	}
}
