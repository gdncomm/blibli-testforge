import Foundation

/// `/api/sessions/testforge` and the stream's `summary` event (D-133).
struct ClaudeSessionSummary: Decodable, Equatable {
	let id: String
	let status: String
	let projectDir: String
	let costUsd: Double
	let isLive: Bool

	private enum CodingKeys: String, CodingKey {
		case id
		case status
		case projectDir
		case costUsd
		case isLive
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		id = try container.decode(String.self, forKey: .id)
		status = (try? container.decodeIfPresent(String.self, forKey: .status)) ?? "idle"
		projectDir = (try? container.decodeIfPresent(String.self, forKey: .projectDir)) ?? ""
		costUsd = (try? container.decodeIfPresent(Double.self, forKey: .costUsd)) ?? 0
		isLive = (try? container.decodeIfPresent(Bool.self, forKey: .isLive)) ?? false
	}
}

/// One row of the server's session list (`queue.sessions`).
struct ClaudeSessionRow: Decodable, Equatable, Identifiable {
	let id: String
	let title: String
	let status: String
	let isTestForge: Bool
	let isRun: Bool
	let pendingRequestIds: [String]
	let pendingKinds: [String]
	let updatedAt: String

	private enum CodingKeys: String, CodingKey {
		case id
		case title
		case status
		case meta
		case pending
		case updatedAt
	}

	private enum MetaKeys: String, CodingKey {
		case testforge
		case taskId
	}

	private struct Pending: Decodable {
		let requestId: String
		let kind: String
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		id = try container.decode(String.self, forKey: .id)
		title = (try? container.decodeIfPresent(String.self, forKey: .title)) ?? ""
		status = (try? container.decodeIfPresent(String.self, forKey: .status)) ?? "idle"
		updatedAt = (try? container.decodeIfPresent(String.self, forKey: .updatedAt)) ?? ""
		let meta = try? container.nestedContainer(keyedBy: MetaKeys.self, forKey: .meta)
		isTestForge = (try? meta?.decodeIfPresent(Bool.self, forKey: .testforge)) ?? false
		isRun = ((try? meta?.decodeIfPresent(String.self, forKey: .taskId)) ?? nil) != nil
		let pending = (try? container.decodeIfPresent([Pending].self, forKey: .pending)) ?? []
		pendingRequestIds = pending.map(\.requestId)
		pendingKinds = pending.map(\.kind)
	}

	var needsYou: Bool {
		!pendingRequestIds.isEmpty
	}
}

/// A row of the Claude section's session switcher, ready to show.
struct ClaudeSessionChoice: Identifiable, Equatable {
	let id: String
	let title: String
	let detail: String
	let needsYou: Bool
	let isSelected: Bool
}

struct ClaudeSessionAnswer: Decodable {
	let session: ClaudeSessionSummary
}

struct ClaudeQuestionOption: Equatable, Identifiable {
	let label: String
	let detail: String

	var id: String { label }
}

struct ClaudeQuestion: Equatable, Identifiable {
	let question: String
	let header: String
	let options: [ClaudeQuestionOption]
	let isMultiSelect: Bool

	var id: String { question }
}

enum ClaudeTranscriptKind: Equatable {
	case user(String)
	case assistant(AttributedString)
	/// `detail`: the tool's full input, shown when the row is expanded (D-147).
	case tool(name: String, argument: String, detail: String)

	/// `full`: the whole result as the server kept it (≤ 6,000 characters), shown when expanded.
	case toolResult(String, isError: Bool, full: String)
	case notice(String, isError: Bool)

	/// Sent at the start of every turn's Claude process; the transcript keeps only the first.
	case started(model: String)

	case approval(requestId: String, toolName: String, detail: String)
	case question(requestId: String, questions: [ClaudeQuestion])
}

struct ClaudeTranscriptItem: Identifiable, Equatable {
	let id: String
	let kind: ClaudeTranscriptKind
}

/// One decoded stream event, already mapped for display off the main actor.
enum ClaudeStreamMessage: Equatable {
	case items(seq: Int, items: [ClaudeTranscriptItem])
	case resolved(seq: Int, requestId: String, outcome: String)
	case summary(ClaudeSessionSummary)
}

/// How a pending approval or question is answered.
struct ClaudeRequestDecision: Equatable {
	let requestId: String
	let isAllowed: Bool
	let isAlwaysAllowed: Bool
	let answers: [String: String]
	let message: String?
}

enum ClaudeSectionState: Equatable {
	case notStarted
	case opening
	case ready(ClaudeSessionSummary)
	case failed(String)
}

/// One MCP server as the session's Claude sees it, as `/mcp` lists it in a terminal (D-222).
struct ClaudeMcpServer: Decodable, Equatable, Identifiable {
	let name: String
	let status: String
	let error: String?
	let scope: String?

	var id: String { name }

	var isConnected: Bool {
		status == "connected"
	}

	/// Plain words for the server's state.
	var statusTitle: String {
		switch status {
			case "connected":
				return String(localized: "Connected")
			case "failed":
				return String(localized: "Failed")
			case "needs-auth":
				return String(localized: "Needs sign-in")
			case "pending":
				return String(localized: "Connecting")
			case "disabled":
				return String(localized: "Off")
			default:
				return status
		}
	}
}

struct ClaudeMcpAnswer: Decodable {
	let servers: [ClaudeMcpServer]
}

/// `/api/sessions/:id/terminal`: the shell line that continues the conversation in a terminal (D-222).
struct ClaudeTerminalHandoff: Decodable, Equatable {
	let claudeSessionId: String
	let command: String
}
