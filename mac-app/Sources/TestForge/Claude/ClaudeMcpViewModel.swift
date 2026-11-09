import Foundation

/// `/mcp` in the app (D-222): the MCP servers the open conversation's Claude sees, and Reconnect for each one.
/// Progress and failure belong to each row's own button; a list failure shows at the top of the sheet.
@MainActor
final class ClaudeMcpViewModel: ObservableObject {
	@Published private(set) var servers: [ClaudeMcpServer] = []
	@Published private(set) var isLoading = false
	@Published private(set) var loadErrorMessage: String?
	@Published private(set) var reconnecting: Set<String> = []
	@Published private(set) var reconnectErrors: [String: String] = [:]

	private let service: ClaudeSessionServing
	private var sessionId: String?

	init(service: ClaudeSessionServing) {
		self.service = service
	}

	var connectedCount: Int {
		servers.filter(\.isConnected).count
	}

	/// Not connected first, so what needs a click is on top; then by name.
	var orderedServers: [ClaudeMcpServer] {
		servers.sorted { lhs, rhs in
			if lhs.isConnected != rhs.isConnected {
				return !lhs.isConnected
			}
			return lhs.name.localizedCaseInsensitiveCompare(rhs.name) == .orderedAscending
		}
	}

	func load(sessionId: String) {
		self.sessionId = sessionId
		isLoading = true
		loadErrorMessage = nil
		let service = service
		Task { [weak self] in
			do {
				let servers = try await service.mcpServers(sessionId: sessionId)
				self?.didLoad(servers, for: sessionId)
			} catch {
				self?.didFail(error, for: sessionId)
			}
		}
	}

	func refresh() {
		guard let sessionId, !isLoading else {
			return
		}
		load(sessionId: sessionId)
	}

	func reconnect(name: String) {
		guard let sessionId, !reconnecting.contains(name) else {
			return
		}
		reconnecting.insert(name)
		reconnectErrors[name] = nil
		let service = service
		Task { [weak self] in
			do {
				let servers = try await service.reconnectMcpServer(name: name, sessionId: sessionId)
				self?.didReconnect(name: name, servers: servers, sessionId: sessionId)
			} catch {
				self?.reconnecting.remove(name)
				self?.reconnectErrors[name] = error.localizedDescription
			}
		}
	}

	private func didLoad(_ newServers: [ClaudeMcpServer], for loadedId: String) {
		guard loadedId == sessionId else {
			return
		}
		isLoading = false
		servers = newServers
	}

	private func didFail(_ error: Error, for loadedId: String) {
		guard loadedId == sessionId else {
			return
		}
		isLoading = false
		loadErrorMessage = String(localized: "Couldn't list MCP servers: \(error.localizedDescription)")
	}

	/// A reconnect that returned but left the server unconnected still failed; its own error says why.
	private func didReconnect(name: String, servers newServers: [ClaudeMcpServer], sessionId reconnectedId: String) {
		reconnecting.remove(name)
		guard reconnectedId == sessionId else {
			return
		}
		servers = newServers
		if let server = newServers.first(where: { $0.name == name }), !server.isConnected {
			reconnectErrors[name] = server.error ?? String(localized: "Still \(server.statusTitle.lowercased()) after reconnecting")
		}
	}
}
