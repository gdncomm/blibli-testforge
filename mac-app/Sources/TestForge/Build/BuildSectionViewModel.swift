import Combine
import Foundation

enum BuildStatusState: Equatable {
	case loading
	case loaded(BuildStatusSnapshot)
	case failed(message: String)
}

enum XcodeInfoState: Equatable {
	case loading
	case loaded(XcodeInfo)
	case failed(message: String)
}

enum BuildTone: Equatable {
	case ready
	case needsBuild
	case building
}

/// The QA build's state in plain words, ready for the view.
struct BuildStatusPresentation: Equatable {
	let title: String
	let detail: String
	let tone: BuildTone
}

/// D-213: which button's work is running, so that button (not just the status row up top) shows it.
enum BuildAction: Hashable {
	case build
	case installForTesting
	case stopRunner
	case openWorkspace
	case packageReset
	case installAndLaunch
	case stopBuild
}

struct BuildActionResult: Equatable {
	let title: String
	let message: String
	let isSuccess: Bool

	/// Nil for results that no button started (stop build, a build that didn't finish).
	var action: BuildAction?
}

struct BuildSectionDependencies {
	let testForgeBuild: TestForgeBuildActing
	let tools: XcodeToolsActing
	let store: StateStore
	let launcher: BuiltAppLaunching
	let deviceScreen: DeviceScreenReading

	/// The Simulator screen's device; nil until that screen has listed devices, then the QA simulator is used.
	let selectedSimulator: @MainActor () -> SimulatorDevice?
}

/// Sidebar › Build: every Xcode step the workflow needs, as buttons; the build itself is the server's QA pipeline.
/// Whole-class `@MainActor`: methods only orchestrate published state; the work runs in the two services.
@MainActor
final class BuildSectionViewModel: ObservableObject {
	private static let defaultWorkspaceName = "BlibliMobile-iOS"
	private static let currentBuildState = "current"

	@Published private(set) var statusState: BuildStatusState = .loading
	@Published private(set) var xcodeState: XcodeInfoState = .loading
	@Published private(set) var logLines: [String] = []
	@Published private(set) var runningActionTitle: String?
	@Published private(set) var runningAction: BuildAction?
	@Published private(set) var lastResult: BuildActionResult?
	@Published private(set) var isLocked = false
	@Published private(set) var isCheckingStatus = false
	@Published private(set) var isStoppingBuild = false
	@Published var isBuildConfirmationShown = false
	@Published var isBuildBeforeInstallShown = false
	@Published var isPackageResetConfirmationShown = false
	@Published var launchSource: LaunchSource = .testForgeBuild

	private let dependencies: BuildSectionDependencies
	private var followedJobId: String?
	private var shouldInstallAfterBuild = false
	private var activeJobIds: [String]?
	private var logTask: Task<Void, Never>?
	private var statusTask: Task<Void, Never>?
	private var actionTask: Task<Void, Never>?
	private var infoTask: Task<Void, Never>?
	private var cancellables = Set<AnyCancellable>()

	init(dependencies: BuildSectionDependencies) {
		self.dependencies = dependencies
		observeStore()
	}

	deinit {
		logTask?.cancel()
		statusTask?.cancel()
		actionTask?.cancel()
		infoTask?.cancel()
	}

	var snapshot: BuildStatusSnapshot? {
		guard case .loaded(let snapshot) = statusState else {
			return nil
		}
		return snapshot
	}

	var isBuilding: Bool {
		snapshot?.isBuilding ?? false
	}

	var canAct: Bool {
		!isLocked && runningActionTitle == nil && !isBuilding
	}

	var canBuild: Bool {
		canAct && snapshot?.preparedCode != nil
	}

	var canOpenWorkspace: Bool {
		workspacePath != nil
	}

	var presentation: BuildStatusPresentation? {
		snapshot.map(Self.presentation(for:))
	}

	var preparedCodeText: String? {
		guard let code = snapshot?.preparedCode else {
			return nil
		}
		return "\(code.branch) @ \(code.snapshotId)"
	}

	var schemeText: String? {
		guard let profile = snapshot?.profile,
			!profile.scheme.isEmpty
		else {
			return nil
		}
		return "\(profile.scheme) · \(profile.configuration)"
	}

	/// Your own clone's workspace, not the QA copy: edits belong in your repo, and the QA copy is replaced on Prepare.
	var workspacePath: String? {
		guard let code = snapshot?.preparedCode,
			let profile = snapshot?.profile,
			!profile.workspace.isEmpty
		else {
			return nil
		}
		let projectFolder = URL(fileURLWithPath: code.repo).appendingPathComponent(profile.projectSubdir, isDirectory: true)
		return projectFolder.appendingPathComponent(profile.workspace).path
	}

	func load() {
		loadStatus()
		loadXcodeInfo()
	}

	func loadStatus() {
		statusTask?.cancel()
		isCheckingStatus = true
		let testForgeBuild = dependencies.testForgeBuild
		statusTask = Task { [weak self] in
			do {
				let snapshot = try await testForgeBuild.status()
				self?.didLoad(snapshot: snapshot)
			} catch {
				self?.statusState = .failed(message: error.localizedDescription)
			}
			if !Task.isCancelled {
				self?.isCheckingStatus = false
			}
		}
	}

	func confirmBuild() {
		perform(action: .build, title: String(localized: "Build for testing")) { dependencies in
			try await dependencies.testForgeBuild.startBuild()
			return String(localized: "Started. The log below follows it.")
		}
	}

	func stopBuild() {
		guard !isStoppingBuild,
			let jobId = snapshot?.jobId
		else {
			return
		}
		isStoppingBuild = true
		let testForgeBuild = dependencies.testForgeBuild
		Task { [weak self] in
			do {
				try await testForgeBuild.cancel(jobId: jobId)
				self?.loadStatus()
			} catch {
				self?.didFailToStop(message: error.localizedDescription)
			}
		}
	}

	/// Gets the QA simulator ready for tests: builds first when the build is missing or old (asks), then installs.
	func installForTesting() {
		guard canBuild else {
			return
		}
		if snapshot?.state == Self.currentBuildState {
			installBuiltApp()
		} else {
			isBuildBeforeInstallShown = true
		}
	}

	func confirmBuildThenInstall() {
		shouldInstallAfterBuild = true
		confirmBuild()
	}

	func stopRunner() {
		perform(action: .stopRunner, title: String(localized: "Stop test runner")) { dependencies in
			try await dependencies.testForgeBuild.stopRunner()
			return String(localized: "Stopped")
		}
	}

	func openWorkspace() {
		guard let path = workspacePath else {
			return
		}
		perform(action: .openWorkspace, title: String(localized: "Open in Xcode")) { dependencies in
			let output = try await dependencies.tools.open(path: path)
			return try Self.message(from: output)
		}
	}

	func confirmPackageReset() {
		let workspacePath = workspacePath
		perform(action: .packageReset, title: String(localized: "Fix Swift package errors")) { dependencies in
			try await dependencies.tools.resetSwiftPackages(reopening: workspacePath)
			return String(localized: "Xcode quit, DerivedData and Swift package caches deleted, Xcode reopened.")
		}
	}

	/// Like ⌃⌘R without Xcode: install the newest built app from the chosen source, then launch it.
	func installAndLaunchLastBuild() {
		let folders = launchFolders(for: launchSource)
		let source = launchSource
		let selectedUDID = dependencies.selectedSimulator()?.id
		perform(action: .installAndLaunch, title: String(localized: "Install & launch last build")) { dependencies in
			guard let app = await dependencies.launcher.latestApp(inDerivedData: folders) else {
				throw BuiltAppError.noApp(source: source)
			}
			let testForgeUDID = try? await dependencies.deviceScreen.screen().udid
			guard let udid = selectedUDID ?? testForgeUDID else {
				throw BuiltAppError.noSimulator
			}
			let output = try await dependencies.launcher.installAndLaunch(app, udid: udid)
			_ = try Self.message(from: output)
			let appName = URL(fileURLWithPath: app.path).lastPathComponent
			let builtAt = app.builtAt.formatted(date: .abbreviated, time: .shortened)
			return String(localized: "\(appName) (\(app.bundleId)), built \(builtAt), launched.")
		}
	}

	private func launchFolders(for source: LaunchSource) -> [URL] {
		switch source {
			case .testForgeBuild:
				if let derivedData = snapshot?.lastBuild?.derivedData {
					return [URL(fileURLWithPath: derivedData, isDirectory: true)]
				}
				let root = CleanTarget.testForgeBuildOutput.url
				let names = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
				return names.map { root.appendingPathComponent($0, isDirectory: true) }
			case .xcodeBuild:
				let workspace = snapshot?.profile?.workspace ?? ""
				let workspaceName = workspace.isEmpty ? Self.defaultWorkspaceName : (workspace as NSString).deletingPathExtension
				return BuiltAppLauncher.xcodeDerivedData(workspaceName: workspaceName)
		}
	}

	private func loadXcodeInfo() {
		infoTask?.cancel()
		let tools = dependencies.tools
		infoTask = Task { [weak self] in
			do {
				let info = try await tools.info()
				self?.xcodeState = .loaded(info)
			} catch {
				self?.xcodeState = .failed(message: error.localizedDescription)
			}
		}
	}

	private func perform(action: BuildAction, title: String, operation: @escaping (BuildSectionDependencies) async throws -> String) {
		guard canAct else {
			return
		}
		runningActionTitle = title
		runningAction = action
		let dependencies = dependencies
		actionTask = Task { [weak self] in
			let result: BuildActionResult
			do {
				let message = try await operation(dependencies)
				result = BuildActionResult(title: title, message: message, isSuccess: true, action: action)
			} catch {
				result = BuildActionResult(title: title, message: error.localizedDescription, isSuccess: false, action: action)
			}
			self?.finish(result: result)
		}
	}

	private func didFailToStop(message: String) {
		isStoppingBuild = false
		lastResult = BuildActionResult(title: String(localized: "Stop build"), message: message, isSuccess: false, action: .stopBuild)
	}

	private func finish(result: BuildActionResult) {
		runningActionTitle = nil
		runningAction = nil
		lastResult = result
		loadStatus()
	}

	/// A fresh runner start runs `test-without-building`, which installs the QA app and the runner, replacing any other build.
	private func installBuiltApp() {
		perform(action: .installForTesting, title: String(localized: "Install for testing")) { dependencies in
			try await dependencies.testForgeBuild.stopRunner()
			try await dependencies.testForgeBuild.startRunner()
			return String(localized: "The QA app and test runner are installed on the QA simulator and running.")
		}
	}

	private func didLoad(snapshot: BuildStatusSnapshot) {
		statusState = .loaded(snapshot)
		if !snapshot.isBuilding {
			isStoppingBuild = false
		}
		if shouldInstallAfterBuild,
			!snapshot.isBuilding,
			runningActionTitle == nil {
			shouldInstallAfterBuild = false
			continueInstallAfterBuild(snapshot: snapshot)
		}
		guard snapshot.isBuilding,
			let jobId = snapshot.jobId,
			jobId != followedJobId
		else {
			return
		}
		follow(jobId: jobId)
	}

	private func continueInstallAfterBuild(snapshot: BuildStatusSnapshot) {
		guard snapshot.state == Self.currentBuildState else {
			let message = String(localized: "The build didn't finish, so nothing was installed. The build log says why.")
			lastResult = BuildActionResult(title: String(localized: "Install for testing"), message: message, isSuccess: false)
			return
		}
		installBuiltApp()
	}

	private func follow(jobId: String) {
		followedJobId = jobId
		logLines = []
		logTask?.cancel()
		let testForgeBuild = dependencies.testForgeBuild
		logTask = Task { [weak self] in
			try? await testForgeBuild.followLog(jobId: jobId) { line in
				self?.append(line: line)
			}
			self?.loadStatus()
		}
	}

	private func append(line: String) {
		logLines.append(line)
		let overflow = logLines.count - TestForgeConstants.Build.logLineLimit
		if overflow > 0 {
			logLines.removeFirst(overflow)
		}
	}

	/// A build started from Get ready or the web page appears as a new job; reload so its log is followed here too.
	private func observeStore() {
		let store = dependencies.store
		store.$slices
			.receive(on: RunLoop.main)
			.sink { [weak self] _ in
				self?.storeDidChange(store: store)
			}
			.store(in: &cancellables)
	}

	private func storeDidChange(store: StateStore) {
		let isRunning = store.value(of: .queue, as: QueueState.self)?.hasActiveTask ?? false
		let isScanning = store.value(of: .scan, as: ScanState.self)?.isActive ?? false
		isLocked = isRunning || isScanning
		let jobIds = store.value(of: .jobs, as: ActiveJobsState.self)?.jobIds
		guard jobIds != activeJobIds else {
			return
		}
		activeJobIds = jobIds
		loadStatus()
	}

	private static func message(from output: CommandOutput) throws -> String {
		guard output.isSuccess else {
			throw DashboardClientError.rejected(message: output.summary)
		}
		let lastLine = output.summary.components(separatedBy: .newlines).last ?? ""
		return lastLine.isEmpty ? String(localized: "Done") : lastLine
	}

	private static func presentation(for snapshot: BuildStatusSnapshot) -> BuildStatusPresentation {
		if snapshot.isBuilding {
			return BuildStatusPresentation(
				title: String(localized: "Building…"),
				detail: String(localized: "A first build takes 10–25 min; later ones a few minutes."),
				tone: .building
			)
		}
		let lastBuilt = snapshot.lastBuild.map(lastBuiltText(for:)) ?? ""
		switch snapshot.state {
			case "current":
				return BuildStatusPresentation(title: String(localized: "Built from the prepared code"), detail: lastBuilt, tone: .ready)
			case "stale":
				return BuildStatusPresentation(
					title: String(localized: "Built from older code"),
					detail: String(localized: "Build again so tests run the code you prepared. \(lastBuilt)"),
					tone: .needsBuild
				)
			case "no-code":
				return BuildStatusPresentation(
					title: String(localized: "No code prepared"),
					detail: String(localized: "Prepare a branch first (Get ready › Code)."),
					tone: .needsBuild
				)
			default:
				let reason = snapshot.reason ?? String(localized: "never built")
				return BuildStatusPresentation(title: String(localized: "Not built"), detail: reason.capitalizedSentence, tone: .needsBuild)
		}
	}

	private static func lastBuiltText(for record: BuildRecord) -> String {
		let seconds = Int((record.durationMs ?? 0) / 1000)
		let endedDate = record.endedAt.flatMap { ISO8601DateFormatter.withFractionalSeconds.date(from: $0) }
		let when = endedDate?.formatted(date: .abbreviated, time: .shortened) ?? ""
		return String(localized: "Last build: \(record.codeId), \(seconds) s, \(when).")
	}
}

private extension String {
	var capitalizedSentence: String {
		prefix(1).uppercased() + dropFirst()
	}
}

private extension ISO8601DateFormatter {
	static let withFractionalSeconds: ISO8601DateFormatter = {
		let formatter = ISO8601DateFormatter()
		formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
		return formatter
	}()
}
