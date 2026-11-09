import Foundation
import Testing
@testable import TestForge

private struct StubError: LocalizedError {
	let errorDescription: String?
}

private func summary(status: String = "idle") -> ClaudeSessionSummary {
	let json = #"{"id":"s1","status":"\#(status)","projectDir":"/repo","costUsd":0,"isLive":false}"#
	return try! JSONDecoder().decode(ClaudeSessionSummary.self, from: Data(json.utf8))
}

private func server(_ name: String, _ status: String, error: String? = nil) -> ClaudeMcpServer {
	ClaudeMcpServer(name: name, status: status, error: error, scope: nil)
}

private final class StubClaudeService: ClaudeSessionServing, @unchecked Sendable {
	var status = "idle"
	var servers: [ClaudeMcpServer] = []
	/// Answers to later list calls, in order; the last one repeats.
	var laterServers: [[ClaudeMcpServer]] = []
	private(set) var listCalls = 0
	var serversAfterReconnect: [ClaudeMcpServer] = []
	var reconnectError: Error?
	var handoffError: Error?
	private(set) var sentTexts: [String] = []
	private(set) var reconnected: [String] = []

	func openTestForgeSession(isFresh: Bool) async throws -> ClaudeSessionSummary { summary(status: status) }
	func send(text: String, attachesScreenshot: Bool, sessionId: String) async throws { sentTexts.append(text) }
	func answer(_ decision: ClaudeRequestDecision, sessionId: String) async throws {}
	func interrupt(sessionId: String) async throws {}
	func session(id: String) async throws -> ClaudeSessionSummary { summary(status: status) }
	func reopen(sessionId: String) async throws -> ClaudeSessionSummary { summary(status: status) }
	func messages(sessionId: String, afterSeq: Int) -> AsyncThrowingStream<ClaudeStreamMessage, Error> {
		AsyncThrowingStream { _ in }
	}
	func mcpServers(sessionId: String) async throws -> [ClaudeMcpServer] {
		listCalls += 1
		guard listCalls > 1, !laterServers.isEmpty else {
			return servers
		}
		return laterServers[min(listCalls - 2, laterServers.count - 1)]
	}
	func reconnectMcpServer(name: String, sessionId: String) async throws -> [ClaudeMcpServer] {
		if let reconnectError {
			throw reconnectError
		}
		reconnected.append(name)
		return serversAfterReconnect
	}
	func handOffToTerminal(sessionId: String) async throws -> ClaudeTerminalHandoff {
		if let handoffError {
			throw handoffError
		}
		return ClaudeTerminalHandoff(claudeSessionId: "abc", command: "cd '/repo' && claude --resume 'abc'")
	}
}

private final class RecordingTerminal: TerminalLaunching {
	private(set) var commands: [String] = []
	func run(command: String, name: String) throws {
		commands.append(command)
	}
}

@MainActor
@Suite("Claude terminal and MCP")
struct ClaudeTerminalMcpTests {
	private func settle() async {
		for _ in 0..<30 {
			await Task.yield()
		}
	}

	private func readyModel(_ service: StubClaudeService, terminal: RecordingTerminal = RecordingTerminal()) async -> ClaudeSectionViewModel {
		let model = ClaudeSectionViewModel(service: service, terminal: terminal)
		model.open()
		await settle()
		return model
	}

	@Test("Open in Terminal runs the server's claude --resume line")
	func opensTerminal() async {
		let terminal = RecordingTerminal()
		let model = await readyModel(StubClaudeService(), terminal: terminal)
		#expect(model.canOpenInTerminal)
		model.openInTerminal()
		await settle()
		#expect(terminal.commands == ["cd '/repo' && claude --resume 'abc'"])
		#expect(!model.isOpeningTerminal)
		#expect(model.terminalErrorMessage == nil)
	}

	@Test("a refused hand-off shows its reason next to the button")
	func terminalFailure() async {
		let service = StubClaudeService()
		service.handoffError = StubError(errorDescription: "Send a message first")
		let terminal = RecordingTerminal()
		let model = await readyModel(service, terminal: terminal)
		model.openInTerminal()
		await settle()
		#expect(terminal.commands.isEmpty)
		#expect(model.terminalErrorMessage?.contains("Send a message first") == true)
	}

	@Test("a working turn can't be handed to a terminal")
	func busyTurn() async {
		let service = StubClaudeService()
		service.status = "running"
		let model = await readyModel(service)
		#expect(!model.canOpenInTerminal)
	}

	@Test("typing /mcp opens the server list instead of messaging Claude")
	func slashMcp() async {
		let service = StubClaudeService()
		service.servers = [server("networklens", "failed", error: "no checkout"), server("driver", "connected")]
		let model = await readyModel(service)
		model.draft = "/mcp"
		model.send()
		await settle()
		#expect(model.isShowingMcp)
		#expect(model.draft.isEmpty)
		#expect(service.sentTexts.isEmpty)
		#expect(model.mcp.connectedCount == 1)
		#expect(model.mcp.orderedServers.map(\.name) == ["networklens", "driver"])
	}

	@Test("Reconnect updates the list, and a server still down shows why")
	func reconnect() async {
		let service = StubClaudeService()
		service.servers = [server("networklens", "failed")]
		service.serversAfterReconnect = [server("networklens", "failed", error: "no checkout at ~/.test-forge/derived")]
		let model = ClaudeMcpViewModel(service: service)
		model.load(sessionId: "s1")
		await settle()
		model.reconnect(name: "networklens")
		#expect(model.reconnecting.contains("networklens"))
		await settle()
		#expect(service.reconnected == ["networklens"])
		#expect(model.reconnecting.isEmpty)
		#expect(model.reconnectErrors["networklens"] == "no checkout at ~/.test-forge/derived")
	}

	@Test("a failed Reconnect keeps its error on that row")
	func reconnectFailure() async {
		let service = StubClaudeService()
		service.servers = [server("networklens", "failed")]
		service.reconnectError = StubError(errorDescription: "server not found")
		let model = ClaudeMcpViewModel(service: service)
		model.load(sessionId: "s1")
		await settle()
		model.reconnect(name: "networklens")
		await settle()
		#expect(model.reconnectErrors["networklens"] == "server not found")
		#expect(model.servers.count == 1)
	}

	@Test("the list asks again while a server is connecting, then stops")
	func refreshesWhileConnecting() async throws {
		let service = StubClaudeService()
		service.servers = [server("networklens", "pending"), server("driver", "pending")]
		service.laterServers = [[server("networklens", "pending"), server("driver", "connected")], [server("networklens", "failed", error: "no checkout"), server("driver", "connected")]]
		let model = ClaudeMcpViewModel(service: service, pollIntervalNanoseconds: 1_000_000)
		model.load(sessionId: "s1")
		for _ in 0..<100 {
			if model.servers.first(where: { $0.name == "networklens" })?.status == "failed" {
				break
			}
			try await Task.sleep(nanoseconds: 5_000_000)
		}
		#expect(!model.isAnyConnecting)
		#expect(model.servers.first { $0.name == "networklens" }?.status == "failed")
		let callsWhenSettled = service.listCalls
		try await Task.sleep(nanoseconds: 30_000_000)
		#expect(service.listCalls == callsWhenSettled)
	}

	@Test("closing the sheet stops the refresh")
	func stopsOnClose() async throws {
		let service = StubClaudeService()
		service.servers = [server("networklens", "pending")]
		let model = ClaudeMcpViewModel(service: service, pollIntervalNanoseconds: 1_000_000)
		model.load(sessionId: "s1")
		try await Task.sleep(nanoseconds: 10_000_000)
		model.stopRefreshing()
		try await Task.sleep(nanoseconds: 5_000_000)
		let calls = service.listCalls
		try await Task.sleep(nanoseconds: 30_000_000)
		#expect(service.listCalls == calls)
	}

	@Test("the terminal script uses a login shell and removes itself")
	func script() {
		let script = ClaudeTerminalLauncher.script(command: "claude --resume 'x'")
		#expect(script.hasPrefix("#!/bin/zsh -l\nrm -f -- \"$0\"\n"))
		#expect(script.hasSuffix("claude --resume 'x'\n"))
	}
}
