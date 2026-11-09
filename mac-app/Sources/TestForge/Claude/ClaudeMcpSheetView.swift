import SwiftUI

/// `/mcp` as a sheet (D-222): each MCP server the conversation's Claude sees, its state and error, and Reconnect.
struct ClaudeMcpSheetView: View {
	@ObservedObject var viewModel: ClaudeMcpViewModel
	let dismiss: () -> Void

	private typealias Ids = ClaudeConstants.Accessibility

	var body: some View {
		VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.medium) {
			header
			if let failure = viewModel.loadErrorMessage {
				Label(failure, systemImage: "exclamationmark.triangle")
					.foregroundStyle(.red)
					.font(.callout)
					.textSelection(.enabled)
					.accessibilityIdentifier(Ids.mcpLoadFailure)
			}
			list
				.frame(maxWidth: .infinity, maxHeight: .infinity)
			HStack {
				Text("Reconnect starts the server again with the same settings. A fix to its setup (a missing folder, a sign-in) has to happen first.")
					.font(.caption)
					.foregroundStyle(.secondary)
				Spacer()
				Button("Done", action: dismiss)
					.keyboardShortcut(.defaultAction)
					.accessibilityIdentifier(Ids.mcpDoneButton)
			}
		}
		.padding(TestForgeConstants.Spacing.large)
		.frame(minWidth: ClaudeConstants.Mcp.sheetMinWidth, minHeight: ClaudeConstants.Mcp.sheetMinHeight)
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(Ids.mcpSheet)
	}

	private var header: some View {
		HStack {
			VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
				Text("MCP servers")
					.font(.title2.bold())
					.accessibilityIdentifier(Ids.mcpTitle)
				Text(summary)
					.foregroundStyle(.secondary)
					.accessibilityIdentifier(Ids.mcpSummary)
			}
			Spacer()
			Button(action: viewModel.refresh) {
				ActionProgressLabel(title: String(localized: "Refresh"), busyTitle: String(localized: "Refreshing…"), isBusy: viewModel.isLoading)
			}
			.disabled(viewModel.isLoading)
			.accessibilityIdentifier(Ids.mcpRefreshButton)
		}
	}

	private var summary: String {
		if viewModel.servers.isEmpty {
			return viewModel.isLoading ? String(localized: "Asking Claude…") : String(localized: "No servers listed")
		}
		return String(localized: "\(viewModel.connectedCount) of \(viewModel.servers.count) connected")
	}

	@ViewBuilder
	private var list: some View {
		if viewModel.servers.isEmpty, viewModel.isLoading {
			ProgressView("Starting Claude to ask which servers it has…")
				.frame(maxWidth: .infinity, maxHeight: .infinity)
				.accessibilityIdentifier(Ids.mcpLoading)
		} else {
			List(viewModel.orderedServers) { server in
				ClaudeMcpRowView(
					server: server,
					isReconnecting: viewModel.reconnecting.contains(server.name),
					failure: viewModel.reconnectErrors[server.name]
				) {
					viewModel.reconnect(name: server.name)
				}
			}
			.accessibilityIdentifier(Ids.mcpList)
		}
	}
}

private struct ClaudeMcpRowView: View {
	let server: ClaudeMcpServer
	let isReconnecting: Bool
	let failure: String?
	let reconnect: () -> Void

	private typealias Ids = ClaudeConstants.Accessibility

	var body: some View {
		HStack(alignment: .top, spacing: TestForgeConstants.Spacing.medium) {
			Image(systemName: icon)
				.foregroundStyle(tint)
				.accessibilityLabel(server.statusTitle)
				.accessibilityIdentifier(Ids.mcpRowIconPrefix + server.name)
			VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
				HStack(spacing: TestForgeConstants.Spacing.small) {
					Text(server.name)
						.font(.body.monospaced())
						.accessibilityIdentifier(Ids.mcpRowNamePrefix + server.name)
					Text(server.statusTitle)
						.font(.caption)
						.foregroundStyle(tint)
						.accessibilityIdentifier(Ids.mcpRowStatusPrefix + server.name)
					if let scope = server.scope {
						Text(scope)
							.font(.caption)
							.foregroundStyle(.secondary)
							.accessibilityIdentifier(Ids.mcpRowScopePrefix + server.name)
					}
				}
				if let error = server.error, !server.isConnected {
					Text(error)
						.font(.caption)
						.foregroundStyle(.secondary)
						.textSelection(.enabled)
						.lineLimit(4)
						.accessibilityIdentifier(Ids.mcpRowErrorPrefix + server.name)
				}
				if let failure {
					Label(failure, systemImage: "exclamationmark.triangle")
						.font(.caption)
						.foregroundStyle(.red)
						.textSelection(.enabled)
						.lineLimit(4)
						.accessibilityIdentifier(Ids.mcpReconnectFailurePrefix + server.name)
				}
			}
			Spacer()
			Button(action: reconnect) {
				ActionProgressLabel(title: String(localized: "Reconnect"), busyTitle: String(localized: "Reconnecting…"), isBusy: isReconnecting)
			}
			.disabled(isReconnecting || server.status == "disabled")
			.accessibilityIdentifier(Ids.mcpReconnectPrefix + server.name)
		}
		.padding(.vertical, TestForgeConstants.Spacing.small)
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(Ids.mcpRowPrefix + server.name)
	}

	private var icon: String {
		switch server.status {
			case "connected":
				return "checkmark.circle.fill"
			case "pending":
				return "clock"
			case "needs-auth":
				return "person.badge.key"
			case "disabled":
				return "pause.circle"
			default:
				return "xmark.octagon.fill"
		}
	}

	private var tint: Color {
		switch server.status {
			case "connected":
				return .green
			case "pending", "needs-auth":
				return .orange
			case "disabled":
				return .secondary
			default:
				return .red
		}
	}
}
