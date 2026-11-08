import Foundation

protocol QABuildActing {
	func status() async throws -> BuildStatusSnapshot

	/// Builds the prepared QA copy for the QA simulator; the server refuses while a run holds the phone.
	func startBuild() async throws

	func cancel(jobId: String) async throws
	func startRunner() async throws
	func stopRunner() async throws

	/// Calls `onLine` for each build log line (the buffered ones first) until the job ends.
	func followLog(jobId: String, onLine: @escaping @MainActor (String) -> Void) async throws
}

/// The dashboard's own build pipeline (`/api/build/*`), so the Mac app and the web page build the same way.
struct BuildServerService: QABuildActing {
	private static let dataPrefix = "data: "
	private static let endEvent = "event: end"
	private static let runnerStartTimeout: TimeInterval = 300

	let client: DashboardClient
	let baseURL: URL
	let session: URLSession

	func status() async throws -> BuildStatusSnapshot {
		let data = try await client.get(path: "api/build/status")
		return try JSONDecoder().decode(BuildStatusSnapshot.self, from: data)
	}

	func startBuild() async throws {
		try await client.post(path: "api/build/qa")
	}

	func cancel(jobId: String) async throws {
		try await client.post(path: "api/jobs/\(jobId)/cancel")
	}

	func startRunner() async throws {
		let data = try await client.post(path: "api/harness/ensure", timeout: Self.runnerStartTimeout)
		try Self.checkHarness(response: data)
	}

	func stopRunner() async throws {
		let data = try await client.post(path: "api/harness/stop")
		try Self.checkHarness(response: data)
	}

	/// The harness answers 200 with `ok: false` when it fails, so the body decides.
	private static func checkHarness(response data: Data) throws {
		let result = try JSONDecoder().decode(HarnessResult.self, from: data)
		guard result.isOk else {
			let lastLine = result.output?.split(separator: "\n").last.map(String.init)
			throw DashboardClientError.rejected(message: lastLine ?? result.error ?? String(localized: "The test runner didn't start."))
		}
	}

	func followLog(jobId: String, onLine: @escaping @MainActor (String) -> Void) async throws {
		let streamURL = baseURL.appendingPathComponent("api/jobs/\(jobId)/stream")
		let (bytes, _) = try await session.bytes(from: streamURL)
		var isEndEvent = false
		for try await line in bytes.lines {
			if line == Self.endEvent {
				isEndEvent = true
				continue
			}
			guard line.hasPrefix(Self.dataPrefix),
				!isEndEvent
			else {
				if isEndEvent {
					return
				}
				continue
			}
			let payload = Data(line.dropFirst(Self.dataPrefix.count).utf8)
			let text = (try? JSONDecoder().decode(String.self, from: payload)) ?? ""
			await onLine(text)
		}
	}
}

private struct HarnessResult: Decodable {
	let isOk: Bool
	let output: String?
	let error: String?

	private enum CodingKeys: String, CodingKey {
		case isOk = "ok"
		case output
		case error
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		isOk = (try? container.decodeIfPresent(Bool.self, forKey: .isOk)) ?? false
		output = try? container.decodeIfPresent(String.self, forKey: .output)
		error = try? container.decodeIfPresent(String.self, forKey: .error)
	}
}
