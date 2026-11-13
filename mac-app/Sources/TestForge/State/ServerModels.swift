import Foundation

/// The server writes `toISOString()` timestamps, which always carry milliseconds.
enum ServerDate {
	static func parse(text: String) -> Date? {
		let formatter = ISO8601DateFormatter()
		formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
		return formatter.date(from: text)
	}
}

/// The `readiness` slice, as `/api/readiness` returns it.
struct ReadinessReport: Decodable, Equatable {
	let isReady: Bool
	let isReadyForClaude: Bool
	let checks: [ReadinessCheck]

	private enum CodingKeys: String, CodingKey {
		case isReady = "ready"
		case isReadyForClaude = "readyForClaude"
		case checks
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		isReady = (try? container.decodeIfPresent(Bool.self, forKey: .isReady)) ?? false
		isReadyForClaude = (try? container.decodeIfPresent(Bool.self, forKey: .isReadyForClaude)) ?? false
		checks = (try? container.decodeIfPresent([ReadinessCheck].self, forKey: .checks)) ?? []
	}
}

struct ReadinessCheck: Decodable, Equatable, Identifiable {
	let id: String
	let label: String
	let detail: String
	let isPassing: Bool
	/// `block` stops a run; `warn` only informs.
	let level: String

	let fixId: String?
	/// D-223: the server is doing this check's work now (a build); the row shows progress, not a failure.
	let isWorking: Bool
	/// Set when the server reused an earlier pass because the check's fingerprint didn't change (D-082).
	let reusedSince: Date?

	private enum CodingKeys: String, CodingKey {
		case id
		case label
		case detail
		case isPassing = "ok"
		case level
		case fixId = "fix"
		case isWorking
		case isReused
		case checkedAt
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		id = (try? container.decodeIfPresent(String.self, forKey: .id)) ?? UUID().uuidString
		label = (try? container.decodeIfPresent(String.self, forKey: .label)) ?? ""
		detail = (try? container.decodeIfPresent(String.self, forKey: .detail)) ?? ""
		isPassing = (try? container.decodeIfPresent(Bool.self, forKey: .isPassing)) ?? false
		level = (try? container.decodeIfPresent(String.self, forKey: .level)) ?? "block"
		fixId = try? container.decodeIfPresent(String.self, forKey: .fixId)
		isWorking = (try? container.decodeIfPresent(Bool.self, forKey: .isWorking)) ?? false
		let isReused = (try? container.decodeIfPresent(Bool.self, forKey: .isReused)) ?? false
		let checkedAt = try? container.decodeIfPresent(String.self, forKey: .checkedAt)
		reusedSince = isReused ? checkedAt.flatMap { ServerDate.parse(text: $0) } : nil
	}
}

/// The `queue` slice; only task phases are read, to know whether a run is in progress.
struct QueueState: Decodable {
	let tasks: [QueueTask]

	/// Every Claude session the server hosts, newest first (D-147: the Claude section's switcher and attention badge).
	let sessions: [ClaudeSessionRow]

	private enum CodingKeys: String, CodingKey {
		case tasks
		case sessions
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		tasks = (try? container.decodeIfPresent([QueueTask].self, forKey: .tasks)) ?? []
		sessions = (try? container.decodeIfPresent([ClaudeSessionRow].self, forKey: .sessions)) ?? []
	}

	var hasActiveTask: Bool {
		tasks.contains { !QueueTask.finishedStatuses.contains($0.status) }
	}
}

struct QueueTask: Decodable {
	static let finishedStatuses: Set<String> = ["done", "failed", "cancelled"]

	let status: String

	private enum CodingKeys: String, CodingKey {
		case status
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		status = (try? container.decodeIfPresent(String.self, forKey: .status)) ?? "done"
	}
}
