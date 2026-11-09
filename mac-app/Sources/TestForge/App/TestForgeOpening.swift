import AppKit
import Foundation
import UserNotifications

/// Wires the app's dependency graph; the App scene conforms and calls `makeTestForgeViewModel()`.
@MainActor
protocol TestForgeOpening {
	func makeTestForgeViewModel(preferences: TestForgePreferences) -> TestForgeViewModel
}

enum TestForgeSettingsKey {
	static let dashboardDirectory = "dashboardDirectory"
	static let projectDirectory = "projectDirectory"
	static let appearance = "appearance"
	static let showsMenuBarItem = "showsMenuBarItem"
	static let notifiesOnFinish = "notifiesOnFinish"
	static let outlinesSteps = "outlinesSteps"
	static let showsUsageBar = "showsUsageBar"
	static let explainLanguage = "explainLanguage"
}

extension TestForgeOpening {
	@MainActor
	func makeTestForgeViewModel(preferences: TestForgePreferences) -> TestForgeViewModel {
		let resolvedLocation = resolveServerLocation()
		let location = resolvedLocation ?? fallbackServerLocation()
		let consoleLog = ConsoleLog()
		let recordStore = OwnedServerRecordStore(fileURL: location.ownedServerRecordURL)
		let supervisorDependencies = ServerSupervisorDependencies(recordStore: recordStore, session: .shared)
		let supervisor = ServerSupervisor(location: location, console: consoleLog, dependencies: supervisorDependencies)
		let streamClient = StateStreamClient()
		let store = StateStore(client: streamClient, console: consoleLog)
		let logTailer = ServerLogTailer(logURL: location.logURL, console: consoleLog)
		let fixService = ReadinessFixService(baseURL: location.baseURL)
		let dashboardClient = DashboardClient(baseURL: location.baseURL, session: .shared)
		let testCaseService = TestCaseService(client: dashboardClient)
		let scanService = ScanService(client: dashboardClient)
		let advancedService = AdvancedService(client: dashboardClient)
		let resultsService = ResultsService(client: dashboardClient)
		let runControlService = RunControlService(client: dashboardClient)
		let application = NSApplication.shared
		let notificationCenter: UNUserNotificationCenter? = Bundle.main.bundleIdentifier == nil ? nil : .current()
		let notifier = UserNotificationNotifier(center: notificationCenter, application: application)
		let dockBadge = ApplicationDockBadge(dockTile: application.dockTile)
		let desktop = SystemDesktop()
		let simulatorLocator = AXSimulatorLocator()
		let deviceScreenService = DeviceScreenService(client: dashboardClient)
		let overlayPresenter = StepOverlayPanelController()
		let commandRunner = ProcessCommandRunner(console: consoleLog)
		let testForgeBuildService = BuildServerService(client: dashboardClient, baseURL: location.baseURL, session: .shared)
		let layerCapture = SimulatorLayerCapture()
		layerCapture.restoreIfInterrupted()
		let services = TestForgeServices(
			supervisor: supervisor,
			store: store,
			consoleLog: consoleLog,
			logTailer: logTailer,
			fixService: fixService,
			testCaseService: testCaseService,
			scanService: scanService,
			macroRecording: MacroRecordingService(client: dashboardClient),
			advancedService: advancedService,
			resultsService: resultsService,
			runControlService: runControlService,
			notifier: notifier,
			dockBadge: dockBadge,
			preferences: preferences,
			simulatorLocator: simulatorLocator,
			deviceScreenService: deviceScreenService,
			layerCapture: layerCapture,
			overlayPresenter: overlayPresenter,
			desktop: desktop,
			notificationCenter: .default,
			tutorials: TutorialCoordinator(),
			simulatorControl: SimulatorControlService(runner: commandRunner),
			testForgeBuild: testForgeBuildService,
			xcodeTools: XcodeToolsService(runner: commandRunner),
			builtAppLauncher: BuiltAppLauncher(runner: commandRunner),
			reset: ResetServerService(client: dashboardClient, jobStream: testForgeBuildService),
			testBatch: TestBatchService(client: dashboardClient),
			prerequisites: PrerequisitesService(client: dashboardClient),
			simulatorScreen: WindowSimulatorScreen(locator: simulatorLocator),
			testDevice: TestDeviceService(client: dashboardClient),
			deeplinks: DeeplinkService(client: dashboardClient),
			bundles: BundleService(client: dashboardClient),
			sessionExport: SessionExportService(client: dashboardClient),
			sessionReport: SessionReportService(client: dashboardClient),
			demoLibrary: DemoLibraryService(client: dashboardClient),
			networkConsole: NetworkConsoleService(client: dashboardClient),
			setup: makeSetupDependencies(runner: commandRunner, desktop: desktop),
			update: GitAppUpdateService(
				runner: commandRunner,
				repo: resolvedLocation.flatMap { RepoFolderResolver().repoRoot(containing: $0.dashboardDirectory) }
			),
			claudeSession: ClaudeSessionService(client: dashboardClient, baseURL: location.baseURL, session: .shared),
			usageTap: UsageTapService(client: dashboardClient),
			remoteControl: RemoteControlService(client: dashboardClient),
			tools: TestForgeToolServices(
				codePrepare: CodePrepareService(client: dashboardClient),
				runQueue: RunQueueService(client: dashboardClient),
				logins: LoginsService(client: dashboardClient),
				runPrompt: RunPromptService(client: dashboardClient),
				git: GitControlService(client: dashboardClient)
			),
			isSetupNeeded: isSetupNeeded(for: resolvedLocation)
		)
		return TestForgeViewModel(services: services)
	}

	/// Server folder order: `TEST_FORGE_SERVER_DIR`, the checkout chosen in Setup, then the `server/` of the checkout this app was built in.
	/// The app under test is `TEST_FORGE_PROJECT_DIR`, else the clone chosen in Setup.
	/// Nil for an app installed from a DMG before Setup ran (D-132).
	func resolveServerLocation(
		environment: [String: String] = ProcessInfo.processInfo.environment,
		defaults: UserDefaults = .standard
	) -> ServerLocation? {
		let baseURL = serverBaseURL(environment: environment)
		let explicitPath = environment["TEST_FORGE_SERVER_DIR"] ?? defaults.string(forKey: TestForgeSettingsKey.dashboardDirectory)
		let projectPath = environment["TEST_FORGE_PROJECT_DIR"] ?? defaults.string(forKey: TestForgeSettingsKey.projectDirectory)
		let projectDirectory = projectPath.map { URL(fileURLWithPath: $0, isDirectory: true) }
		if let explicitPath {
			let directory = URL(fileURLWithPath: explicitPath, isDirectory: true)
			return ServerLocation(dashboardDirectory: directory, baseURL: baseURL, projectDirectory: projectDirectory)
		}
		guard let directory = findDashboardDirectory(startingAt: Bundle.main.bundleURL) else {
			return nil
		}
		return ServerLocation(dashboardDirectory: directory, baseURL: baseURL, projectDirectory: projectDirectory)
	}

	/// Setup shows when there is no TestForge checkout, or no iOS clone to test: the server cannot start without `TEST_FORGE_PROJECT_DIR`.
	func isSetupNeeded(for location: ServerLocation?) -> Bool {
		location?.projectDirectory == nil
	}

	/// Only Setup shows while this is in use, so nothing starts from the app's own folder.
	private func fallbackServerLocation() -> ServerLocation {
		ServerLocation(dashboardDirectory: Bundle.main.bundleURL, baseURL: serverBaseURL(environment: ProcessInfo.processInfo.environment))
	}

	private func serverBaseURL(environment: [String: String]) -> URL {
		let port = environment["TEST_FORGE_SERVER_PORT"] ?? "4545"
		return URL(string: "http://127.0.0.1:\(port)") ?? URL(fileURLWithPath: "/")
	}

	private func makeSetupDependencies(runner: CommandRunning, desktop: DesktopActing) -> SetupDependencies {
		SetupDependencies(
			toolChecker: ToolCheckService(runner: runner),
			resolver: RepoFolderResolver(),
			desktop: desktop,
			system: SetupSystem(),
			defaults: .standard
		)
	}

	private func findDashboardDirectory(startingAt startURL: URL, fileManager: FileManager = .default) -> URL? {
		var candidate = startURL
		for _ in 0..<8 {
			let serverDirectory = candidate.appendingPathComponent(SetupConstants.Repo.dashboardPath, isDirectory: true)
			let startScript = serverDirectory.appendingPathComponent(SetupConstants.Repo.serverScript)
			if fileManager.fileExists(atPath: startScript.path) {
				return serverDirectory
			}
			candidate = candidate.deletingLastPathComponent()
		}
		return nil
	}
}
