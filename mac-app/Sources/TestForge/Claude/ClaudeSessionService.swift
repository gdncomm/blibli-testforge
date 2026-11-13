import Foundation

protocol ClaudeSessionServing {
	/// Resumes the TestForge's open session in the selected repo, or starts one; `isFresh` starts a new conversation.
	func openTestForgeSession(isFresh: Bool) async throws -> ClaudeSessionSummary

	func send(text: String, attachesScreenshot: Bool, sessionId: String) async throws
	func answer(_ decision: ClaudeRequestDecision, sessionId: String) async throws
	func interrupt(sessionId: String) async throws

	/// Any session by id (a run's, opened from Tests or the switcher).
	func session(id: String) async throws -> ClaudeSessionSummary

	/// A closed session takes messages again, resuming Claude's own transcript (D-147).
	func reopen(sessionId: String) async throws -> ClaudeSessionSummary

	/// Every event after `afterSeq`, then live ones; ends when the server closes the stream.
	func messages(sessionId: String, afterSeq: Int) -> AsyncThrowingStream<ClaudeStreamMessage, Error>

	/// The MCP servers the session's Claude sees (D-222); starts its Claude process if needed.
	func mcpServers(sessionId: String) async throws -> [ClaudeMcpServer]

	/// Reconnects one MCP server, then lists them all again; throws with Claude's reason.
	func reconnectMcpServer(name: String, sessionId: String) async throws -> [ClaudeMcpServer]

	/// Ends the app's Claude process for the session and returns the `claude --resume` line (D-222).
	func handOffToTerminal(sessionId: String) async throws -> ClaudeTerminalHandoff
}

/// `/api/sessions/*` (D-133): the dashboard hosts the Claude process; the app only talks to it.
struct ClaudeSessionService: ClaudeSessionServing {
	private let client: DashboardClient
	private let baseURL: URL
	private let session: URLSession

	init(client: DashboardClient, baseURL: URL, session: URLSession) {
		self.client = client
		self.baseURL = baseURL
		self.session = session
	}

	func openTestForgeSession(isFresh: Bool) async throws -> ClaudeSessionSummary {
		let data = try await client.post(path: "api/sessions/testforge", json: ["fresh": .bool(isFresh)])
		return try JSONDecoder().decode(ClaudeSessionAnswer.self, from: data).session
	}

	func send(text: String, attachesScreenshot: Bool, sessionId: String) async throws {
		let body: [String: JSONValue] = ["text": .string(text), "attachScreenshot": .bool(attachesScreenshot)]
		try await client.post(path: "api/sessions/\(sessionId)/messages", json: body)
	}

	func answer(_ decision: ClaudeRequestDecision, sessionId: String) async throws {
		var body: [String: JSONValue] = [
			"requestId": .string(decision.requestId),
			"behavior": .string(decision.isAllowed ? "allow" : "deny"),
			"alwaysAllow": .bool(decision.isAlwaysAllowed),
		]
		if !decision.answers.isEmpty {
			body["answers"] = .object(decision.answers.mapValues(JSONValue.string))
		}
		if let message = decision.message {
			body["message"] = .string(message)
		}
		try await client.post(path: "api/sessions/\(sessionId)/answer", json: body)
	}

	func interrupt(sessionId: String) async throws {
		try await client.post(path: "api/sessions/\(sessionId)/interrupt")
	}

	func session(id: String) async throws -> ClaudeSessionSummary {
		let data = try await client.get(path: "api/sessions/\(id)")
		return try JSONDecoder().decode(ClaudeSessionAnswer.self, from: data).session
	}

	func reopen(sessionId: String) async throws -> ClaudeSessionSummary {
		let data = try await client.post(path: "api/sessions/\(sessionId)/reopen")
		return try JSONDecoder().decode(ClaudeSessionAnswer.self, from: data).session
	}

	func mcpServers(sessionId: String) async throws -> [ClaudeMcpServer] {
		let data = try await client.get(path: "api/sessions/\(sessionId)/mcp")
		return try JSONDecoder().decode(ClaudeMcpAnswer.self, from: data).servers
	}

	func reconnectMcpServer(name: String, sessionId: String) async throws -> [ClaudeMcpServer] {
		let data = try await client.post(path: "api/sessions/\(sessionId)/mcp/reconnect", json: ["name": .string(name)])
		return try JSONDecoder().decode(ClaudeMcpAnswer.self, from: data).servers
	}

	func handOffToTerminal(sessionId: String) async throws -> ClaudeTerminalHandoff {
		let data = try await client.post(path: "api/sessions/\(sessionId)/terminal")
		return try JSONDecoder().decode(ClaudeTerminalHandoff.self, from: data)
	}

	func messages(sessionId: String, afterSeq: Int) -> AsyncThrowingStream<ClaudeStreamMessage, Error> {
		let streamURL = baseURL.appendingPathComponent("api/sessions/\(sessionId)/stream")
		var components = URLComponents(url: streamURL, resolvingAgainstBaseURL: false)
		components?.queryItems = [URLQueryItem(name: "after", value: String(afterSeq))]
		let requestURL = components?.url ?? streamURL
		let session = session
		return AsyncThrowingStream { continuation in
			let task = Task {
				do {
					try await Self.readEvents(from: requestURL, session: session, into: continuation)
					continuation.finish()
				} catch {
					continuation.finish(throwing: error)
				}
			}
			continuation.onTermination = { _ in
				task.cancel()
			}
		}
	}

	/// Same framing as `StateStreamClient`: one `event:` line, then one single-line `data:` per event.
	private static func readEvents(
		from requestURL: URL,
		session: URLSession,
		into continuation: AsyncThrowingStream<ClaudeStreamMessage, Error>.Continuation
	) async throws {
		var request = URLRequest(url: requestURL)
		request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
		request.timeoutInterval = .infinity
		let (bytes, response) = try await session.bytes(for: request)
		guard let httpResponse = response as? HTTPURLResponse,
			httpResponse.statusCode == 200
		else {
			throw URLError(.badServerResponse)
		}
		let decoder = JSONDecoder()
		var eventName = "message"
		for try await line in bytes.lines {
			if line.hasPrefix("event:") {
				eventName = line.dropFirst("event:".count).trimmingCharacters(in: .whitespaces)
			} else if line.hasPrefix("data:") {
				let payload = Data(line.dropFirst("data:".count).utf8)
				if let value = try? decoder.decode(JSONValue.self, from: payload),
					let message = ClaudeTranscriptMapper.message(eventName: eventName, payload: value) {
					continuation.yield(message)
				}
				eventName = "message"
			}
		}
	}
}
