import Foundation

enum ServerPhase: Equatable {
	case idle
	case checking
	case starting
	/// `isOwnedByApp` is false when the app attached to a server someone else started; it then never stops it.
	case running(isOwnedByApp: Bool)

	case failed(reason: String)
}

struct ServerLocation {
	let dashboardDirectory: URL
	let baseURL: URL

	/// The app clone's `BlibliMobile-iOS` folder, handed to the server as `TEST_FORGE_PROJECT_DIR`; nil leaves the server to its own default or error.
	var projectDirectory: URL?

	var startScriptURL: URL { dashboardDirectory.appendingPathComponent("start.sh") }
	var ownedServerRecordURL: URL { dashboardDirectory.appendingPathComponent(".data/app-server.json") }
	var port: String { String(baseURL.port ?? 4545) }
	var logURL: URL { dashboardDirectory.appendingPathComponent(".data/dashboard.log") }
	var stateURL: URL { baseURL.appendingPathComponent("api/state") }
	var streamURL: URL { baseURL.appendingPathComponent("api/state/stream") }
}

protocol ServerSupervising: AnyObject {
	var location: ServerLocation { get }
	var phaseDidChange: ((ServerPhase) -> Void)? { get set }
	var isOwningServer: Bool { get }

	/// Attaches when the port already answers, else runs `start.sh` and waits until it does.
	func start() async -> ServerPhase

	/// Restarts only a server this app started, including one that stopped on its own.
	func restart() async -> ServerPhase

	/// Leaves the server running when a test is in progress, so a relaunch reconnects to it.
	func stopOnQuit(isRunInProgress: Bool)
}

struct ServerSupervisorDependencies {
	let recordStore: OwnedServerRecording
	let session: URLSession
}

/// Starts, attaches to, and stops the Node dashboard server behind the app.
final class ServerSupervisor: ServerSupervising {
	let location: ServerLocation
	var phaseDidChange: ((ServerPhase) -> Void)?
	private weak var console: ConsoleLogging?
	private let session: URLSession
	private let recordStore: OwnedServerRecording
	private var process: Process?
	/// Set when a relaunch takes back a server an earlier run of the app started.
	private var adoptedPid: Int32?
	private var isStoppingOnPurpose = false
	private let startTimeoutSeconds: Double = 90

	init(location: ServerLocation, console: ConsoleLogging, dependencies: ServerSupervisorDependencies) {
		self.location = location
		self.console = console
		self.session = dependencies.session
		self.recordStore = dependencies.recordStore
	}

	func start() async -> ServerPhase {
		let isAnswering = await isServerAnswering()
		if isAnswering {
			if let record = recordStore.liveRecord(forPort: location.port) {
				adoptedPid = record.pid
				console?.append(text: "reconnected to the server this app started earlier (pid \(record.pid))", source: .app)
				return .running(isOwnedByApp: true)
			}
			console?.append(text: "attached to the server already running at \(location.baseURL.absoluteString)", source: .app)
			return .running(isOwnedByApp: false)
		}
		return await launch()
	}

	var isOwningServer: Bool {
		process != nil || adoptedPid != nil
	}

	func restart() async -> ServerPhase {
		guard isOwningServer else {
			let reason = String(localized: "This server wasn't started by the app — restart it where it was started.")
			return .failed(reason: reason)
		}
		let isStopped = stopOwnedServer()
		if isStopped {
			await waitUntilStopped()
		}
		return await launch()
	}

	func stopOnQuit(isRunInProgress: Bool) {
		guard isOwningServer else {
			return
		}
		if isRunInProgress {
			console?.append(text: "a test is running — the server keeps going; reopen the app to reconnect", source: .app)
			return
		}
		_ = stopOwnedServer()
	}

	/// Returns whether a running server was signalled.
	private func stopOwnedServer() -> Bool {
		isStoppingOnPurpose = true
		recordStore.clear()
		if let process,
			process.isRunning {
			console?.append(text: "stopping the server (pid \(process.processIdentifier))", source: .app)
			process.terminate()
			return true
		}
		if let adoptedPid {
			console?.append(text: "stopping the server (pid \(adoptedPid))", source: .app)
			self.adoptedPid = nil
			return kill(adoptedPid, SIGTERM) == 0
		}
		return false
	}

	private func launch() async -> ServerPhase {
		guard FileManager.default.fileExists(atPath: location.startScriptURL.path) else {
			let reason = String(localized: "start.sh not found in \(location.dashboardDirectory.path)")
			return .failed(reason: reason)
		}
		phaseDidChange?(.starting)
		let launchCommand = makeLaunchCommand()
		console?.append(text: "$ \(launchCommand)", source: .app)
		let newProcess = Process()
		newProcess.executableURL = URL(fileURLWithPath: "/bin/bash")
		newProcess.arguments = ["-c", launchCommand]
		newProcess.currentDirectoryURL = location.dashboardDirectory
		newProcess.terminationHandler = { [weak self] stoppedProcess in
			self?.handleTermination(of: stoppedProcess)
		}
		isStoppingOnPurpose = false
		do {
			try newProcess.run()
		} catch {
			let reason = String(localized: "Couldn't run start.sh: \(error.localizedDescription)")
			return .failed(reason: reason)
		}
		process = newProcess
		adoptedPid = nil
		let ownedRecord = OwnedServerRecord(pid: newProcess.processIdentifier, port: location.port)
		recordStore.save(record: ownedRecord)
		let isUp = await waitUntilAnswering()
		guard isUp else {
			let reason = String(localized: "The server didn't answer within \(Int(startTimeoutSeconds)) s — see the console.")
			return .failed(reason: reason)
		}
		console?.append(text: "server up (pid \(newProcess.processIdentifier))", source: .app)
		return .running(isOwnedByApp: true)
	}

	private func handleTermination(of stoppedProcess: Process) {
		guard !isStoppingOnPurpose,
			stoppedProcess === process
		else {
			return
		}
		recordStore.clear()
		let reason = String(localized: "The server stopped on its own (exit code \(stoppedProcess.terminationStatus)).")
		console?.append(text: reason, source: .app)
		phaseDidChange?(.failed(reason: reason))
	}

	private func shellQuoted(_ path: String) -> String {
		path.replacingOccurrences(of: "'", with: "'\\''")
	}

	/// Output goes to the log file, not a pipe: a pipe would break the server (SIGPIPE) once the app quits.
	private func makeLaunchCommand() -> String {
		let logPath = location.logURL.path.replacingOccurrences(of: "'", with: "'\\''")
		let projectExport = location.projectDirectory.map { "export TEST_FORGE_PROJECT_DIR='\(shellQuoted($0.path))' && " } ?? ""
		return "mkdir -p .data && \(projectExport)exec ./start.sh >> '\(logPath)' 2>&1"
	}

	private func waitUntilAnswering() async -> Bool {
		let deadline = Date().addingTimeInterval(startTimeoutSeconds)
		while Date() < deadline {
			let isAnswering = await isServerAnswering()
			if isAnswering {
				return true
			}
			if let process,
				!process.isRunning {
				console?.append(text: "start.sh exited with code \(process.terminationStatus)", source: .app)
				return false
			}
			try? await Task.sleep(nanoseconds: 1_000_000_000)
		}
		return false
	}

	private func waitUntilStopped() async {
		for _ in 0..<40 {
			let isAnswering = await isServerAnswering()
			if !isAnswering {
				return
			}
			try? await Task.sleep(nanoseconds: 250_000_000)
		}
	}

	private func isServerAnswering() async -> Bool {
		var request = URLRequest(url: location.stateURL)
		request.timeoutInterval = 3
		guard let (_, response) = try? await session.data(for: request),
			let httpResponse = response as? HTTPURLResponse
		else {
			return false
		}
		return httpResponse.statusCode == 200
	}
}
