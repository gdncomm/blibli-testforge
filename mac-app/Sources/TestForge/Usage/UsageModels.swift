import Foundation

/// The server's `usage` slice (D-076, D-077, D-149): the figures the Claude Code CLI status line shows.
struct UsageState: Decodable, Equatable {
	let fiveHour: UsageWindow?
	let sevenDay: UsageWindow?
	let contextPct: Int?
	let model: String?
	let ageS: Int?
	let isStale: Bool

	private enum CodingKeys: String, CodingKey {
		case fiveHour
		case sevenDay
		case context
		case model
		case ageS
		case isStale
	}

	private struct Context: Decodable {
		let pct: Int?
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		fiveHour = try? container.decodeIfPresent(UsageWindow.self, forKey: .fiveHour)
		sevenDay = try? container.decodeIfPresent(UsageWindow.self, forKey: .sevenDay)
		contextPct = (try? container.decodeIfPresent(Context.self, forKey: .context))?.pct
		model = try? container.decodeIfPresent(String.self, forKey: .model)
		ageS = try? container.decodeIfPresent(Int.self, forKey: .ageS)
		isStale = (try? container.decodeIfPresent(Bool.self, forKey: .isStale)) ?? true
	}
}

struct UsageWindow: Decodable, Equatable {
	let usedPct: Int
	let elapsedPct: Int?
	let resetsInS: Int?

	/// Used faster than the window's time is passing.
	let isAhead: Bool

	private enum CodingKeys: String, CodingKey {
		case usedPct
		case elapsedPct
		case resetsInS
		case isAhead
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		usedPct = (try? container.decodeIfPresent(Int.self, forKey: .usedPct)) ?? 0
		elapsedPct = try? container.decodeIfPresent(Int.self, forKey: .elapsedPct)
		resetsInS = try? container.decodeIfPresent(Int.self, forKey: .resetsInS)
		isAhead = (try? container.decodeIfPresent(Bool.self, forKey: .isAhead)) ?? false
	}
}

enum UsageLevel: Equatable {
	case normal
	case ahead
	case critical
}

/// One piece of the bar: "ctx 76%", "5h 57% / 37% (3h9m)".
struct UsageSegment: Identifiable, Equatable {
	let id: String
	let label: String
	let value: String
	let level: UsageLevel
}

enum UsageBarState: Equatable {
	/// Nothing reported yet: no Claude run here and no status-line tap.
	case noData
	/// `isStale`: no new figures for a while; the status-line tap may be gone (a rewritten script), so Connect shows again.
	case showing(segments: [UsageSegment], model: String?, freshness: String?, isStale: Bool)
}

/// From the `identity` slice: who Claude Code is signed in as.
struct ClaudeAccountState: Decodable, Equatable {
	let isLoggedIn: Bool
	let email: String?
	let plan: String?

	private enum CodingKeys: String, CodingKey {
		case account
	}

	private enum AccountKeys: String, CodingKey {
		case isLoggedIn = "loggedIn"
		case email
		case plan
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		let account = try? container.nestedContainer(keyedBy: AccountKeys.self, forKey: .account)
		isLoggedIn = (try? account?.decodeIfPresent(Bool.self, forKey: .isLoggedIn)) ?? false
		email = try? account?.decodeIfPresent(String.self, forKey: .email)
		plan = try? account?.decodeIfPresent(String.self, forKey: .plan)
	}
}

/// From the `claudeCli` slice: the CLI sessions on this Mac and whether Remote Control is on in each.
struct ClaudeCliState: Decodable, Equatable {
	let sessions: [ClaudeCliSession]
	let isReadable: Bool

	private enum CodingKeys: String, CodingKey {
		case sessions
		case isReadable
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		sessions = (try? container.decodeIfPresent([ClaudeCliSession].self, forKey: .sessions)) ?? []
		isReadable = (try? container.decodeIfPresent(Bool.self, forKey: .isReadable)) ?? false
	}
}

struct ClaudeCliSession: Decodable, Equatable {
	let name: String
	let isRemoteControl: Bool

	private enum CodingKeys: String, CodingKey {
		case name
		case isRemoteControl
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		name = (try? container.decodeIfPresent(String.self, forKey: .name)) ?? "?"
		isRemoteControl = (try? container.decodeIfPresent(Bool.self, forKey: .isRemoteControl)) ?? false
	}
}

/// The bar's right end: account and Remote Control, shown whether or not usage figures exist.
struct ClaudeAccountSummary: Equatable {
	let accountText: String
	let isSignedIn: Bool
	let remoteControlText: String
	let remoteControlHelp: String
	let isRemoteControlOn: Bool
}
