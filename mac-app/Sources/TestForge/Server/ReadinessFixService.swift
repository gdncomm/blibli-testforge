import Foundation

enum FixRoute: Equatable {
	case post(path: String, jsonBody: String)
	/// D-199: the Prepare code and Run queue sheets, which replaced the web UI.
	case prepareCode
	case showRunQueue
	case restartServer
	case chooseProofFolder
	case startTestBatch
	/// D-190: the prerequisites sheet — tools, plugin and MCP servers, each with its fix.
	case showPrerequisites
}

struct FixAction: Equatable {
	let title: LocalizedStringResource
	let route: FixRoute
	/// Asked before running; nil runs the fix straight away.
	let confirmation: LocalizedStringResource?
}

protocol ReadinessFixing {
	func action(forFixId fixId: String) -> FixAction?

	/// Returns an error message, or nil when the server accepted the fix.
	func run(action: FixAction) async -> String?
}

/// Maps the server's readiness fix ids to what the Mac app does about each.
struct ReadinessFixService: ReadinessFixing {
	private let baseURL: URL
	private let session: URLSession

	init(baseURL: URL, session: URLSession = .shared) {
		self.baseURL = baseURL
		self.session = session
	}

	func action(forFixId fixId: String) -> FixAction? {
		switch fixId {
			case "test-forge-sim-create":
				return FixAction(
					title: "Create QA simulator",
					route: .post(path: "api/test-forge-sim/create", jsonBody: "{}"),
					confirmation: "The simulator you test with shuts down for about a minute and is cloned as “TestForge · <name>”. Your own simulator stays untouched."
				)
			case "test-forge-sim-boot":
				return FixAction(title: "Boot QA simulator", route: .post(path: "api/test-forge-sim/boot", jsonBody: "{}"), confirmation: nil)
			case "test-forge-sim-solo":
				return FixAction(
					title: "Shut down the others",
					route: .post(path: "api/test-forge-sim/solo", jsonBody: "{}"),
					confirmation: "Shut down every other booted simulator? QA runs need the QA simulator alone."
				)
			case "build-qa":
				return FixAction(
					title: "Build the app",
					route: .post(path: "api/build/qa", jsonBody: "{}"),
					confirmation: "Build the prepared code for the QA simulator? A first build takes 10–25 min and may need the VPN."
				)
			case "ensure", "restart-harness":
				return FixAction(title: "Start harness", route: .post(path: "api/harness/ensure", jsonBody: "{}"), confirmation: nil)
			case "free-space":
				return FixAction(
					title: "Free disk space",
					route: .post(path: "api/code/free-space", jsonBody: "{\"olderThanDays\":14}"),
					confirmation: "Remove QA copies and build output not used for 14 days? Only ~/.test-forge/ is touched."
				)
			case "choose-proof-folder":
				return FixAction(title: "Choose folder…", route: .chooseProofFolder, confirmation: nil)
			case "start-test-batch":
				return FixAction(title: "Start Test Batch…", route: .startTestBatch, confirmation: nil)
			case "code":
				return FixAction(title: "Prepare code…", route: .prepareCode, confirmation: nil)
			case "queue":
				return FixAction(title: "Show run queue", route: .showRunQueue, confirmation: nil)
			case "show-prerequisites", "claude-howto":
				return FixAction(title: "Show what's missing", route: .showPrerequisites, confirmation: nil)
			case "configure-claude-env":
				return FixAction(
					title: "Set up Claude Code",
					route: .post(path: "api/claude-env/configure", jsonBody: "{}"),
					confirmation: "Write this Mac’s project, QA simulator and proof folder into .claude/settings.local.json? Only Claude’s own direct tools need it — never committed."
				)
			default:
				return nil
		}
	}

	func run(action: FixAction) async -> String? {
		guard case let .post(path, jsonBody) = action.route else {
			return nil
		}
		let endpointURL = baseURL.appendingPathComponent(path)
		var request = URLRequest(url: endpointURL)
		request.httpMethod = "POST"
		request.setValue("application/json", forHTTPHeaderField: "Content-Type")
		request.httpBody = Data(jsonBody.utf8)
		request.timeoutInterval = 30
		do {
			let (data, response) = try await session.data(for: request)
			let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
			guard !(200..<300).contains(statusCode) else {
				return nil
			}
			// The server says why it refused (e.g. "harness ensure already in progress"); the code alone tells nobody.
			let refusal = try? JSONDecoder().decode(FixRefusal.self, from: data)
			return refusal?.message ?? String(localized: "The server answered \(statusCode).")
		} catch {
			return error.localizedDescription
		}
	}
}

private struct FixRefusal: Decodable {
	let message: String?

	private enum CodingKeys: String, CodingKey {
		case message = "error"
	}
}
