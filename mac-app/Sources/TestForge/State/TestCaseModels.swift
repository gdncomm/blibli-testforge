import Foundation

/// The `testcases` slice (D-085): the loaded document, each case with its recording and latest run.
struct TestCaseDocument: Decodable, Equatable {
	let title: String?
	let source: String?
	let isLoading: Bool
	let cases: [TestCaseSummary]

	/// The build under test, "branch @ sha · 15.0.0 (150006)" (D-188); nil when no QA copy is linked.
	let build: String?

	/// The installed build isn't from the prepared code, so results are stamped unverified.
	let isBuildUnverified: Bool

	/// Cases with a recording whose last result ran on a build that changed their code (D-188).
	let staleCaseIds: [String]

	private enum CodingKeys: String, CodingKey {
		case title
		case source
		case isLoading
		case cases
		case build
		case isBuildUnverified
		case staleCaseIds
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		title = try? container.decodeIfPresent(String.self, forKey: .title)
		source = try? container.decodeIfPresent(String.self, forKey: .source)
		isLoading = (try? container.decodeIfPresent(Bool.self, forKey: .isLoading)) ?? false
		cases = (try? container.decodeIfPresent([TestCaseSummary].self, forKey: .cases)) ?? []
		build = try? container.decodeIfPresent(String.self, forKey: .build)
		isBuildUnverified = (try? container.decodeIfPresent(Bool.self, forKey: .isBuildUnverified)) ?? false
		staleCaseIds = (try? container.decodeIfPresent([String].self, forKey: .staleCaseIds)) ?? []
	}
}

struct TestCaseSummary: Decodable, Equatable, Identifiable {
	let id: String
	let scenario: String?
	let precondition: String?
	let steps: String?
	let expected: String?
	let api: String?
	let localEdit: TestCaseLocalEdit?
	let recording: TestCaseRecording?

	/// D-220: free replay, not confirmed, needs repair, or needs Claude.
	let replay: TestCaseReplayStatus

	let lastRun: TestCaseLastRun?

	/// D-180: every result change a person made, oldest first.
	let resultOverrides: [TestCaseResultOverride]

	/// D-182: screenshots and videos filed for the case in the active test batch.
	let proof: TestCaseProof?

	/// D-193: Jira tickets the document names for this case (its own, else the page's).
	let tickets: [JiraTicket]

	private enum CodingKeys: String, CodingKey {
		case id
		case scenario
		case precondition
		case steps
		case expected
		case api
		case localEdit
		case recording = "macro"
		case replay
		case lastRun
		case resultOverrides
		case proof
		case tickets
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		id = (try? container.decodeIfPresent(String.self, forKey: .id)) ?? UUID().uuidString
		scenario = try? container.decodeIfPresent(String.self, forKey: .scenario)
		precondition = try? container.decodeIfPresent(String.self, forKey: .precondition)
		steps = try? container.decodeIfPresent(String.self, forKey: .steps)
		expected = try? container.decodeIfPresent(String.self, forKey: .expected)
		api = try? container.decodeIfPresent(String.self, forKey: .api)
		localEdit = try? container.decodeIfPresent(TestCaseLocalEdit.self, forKey: .localEdit)
		recording = try? container.decodeIfPresent(TestCaseRecording.self, forKey: .recording)
		let decodedReplay = try? container.decodeIfPresent(TestCaseReplayStatus.self, forKey: .replay)
		replay = decodedReplay ?? .fallback(hasRecording: recording != nil)
		lastRun = try? container.decodeIfPresent(TestCaseLastRun.self, forKey: .lastRun)
		resultOverrides = (try? container.decodeIfPresent([TestCaseResultOverride].self, forKey: .resultOverrides)) ?? []
		proof = try? container.decodeIfPresent(TestCaseProof.self, forKey: .proof)
		tickets = (try? container.decodeIfPresent([JiraTicket].self, forKey: .tickets)) ?? []
	}
}

/// D-166: the tester's local corrections to a case; the document itself is never changed.
struct TestCaseLocalEdit: Decodable, Equatable {
	let fields: [String]
	let editedAt: Date?

	/// The document's own text for each edited field, so the person can compare.
	let documentText: [String: String]

	/// The document reworded an edited field after the edit, so the edit may be out of date.
	let isDocumentChanged: Bool

	private enum CodingKeys: String, CodingKey {
		case fields
		case editedAt
		case documentText = "original"
		case isDocumentChanged
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		fields = (try? container.decodeIfPresent([String].self, forKey: .fields)) ?? []
		let editedText = try? container.decodeIfPresent(String.self, forKey: .editedAt)
		editedAt = editedText.flatMap { ServerDate.parse(text: $0) }
		let documentValues = (try? container.decodeIfPresent([String: String?].self, forKey: .documentText)) ?? [:]
		documentText = documentValues.compactMapValues { $0 }
		isDocumentChanged = (try? container.decodeIfPresent(Bool.self, forKey: .isDocumentChanged)) ?? false
	}
}

/// A learned macro that replays the case without Claude.
struct TestCaseRecording: Decodable, Equatable {
	let id: String
	let name: String
	let usesMocks: Bool

	/// The recording carries plain-words explanations (D-164/D-165) for explained replays and demo videos.
	let hasDemoNotes: Bool

	/// Where a replay starts and what it needs from the app (D-185); nil when the recording states nothing.
	let setup: TestCaseSetup?

	private enum CodingKeys: String, CodingKey {
		case id
		case name
		case usesMocks
		case hasDemoNotes
		case setup
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		id = (try? container.decodeIfPresent(String.self, forKey: .id)) ?? ""
		name = (try? container.decodeIfPresent(String.self, forKey: .name)) ?? id
		usesMocks = (try? container.decodeIfPresent(Bool.self, forKey: .usesMocks)) ?? false
		hasDemoNotes = (try? container.decodeIfPresent(Bool.self, forKey: .hasDemoNotes)) ?? false
		setup = try? container.decodeIfPresent(TestCaseSetup.self, forKey: .setup)
	}
}

struct TestCaseSetup: Decodable, Equatable {
	/// "Home", "Any screen", "Fresh launch", or a screen name.
	let startScreen: String?

	/// Environment and session the replay brings the app to first, in words.
	let needs: [String]

	private enum CodingKeys: String, CodingKey {
		case startScreen
		case needs
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		startScreen = try? container.decodeIfPresent(String.self, forKey: .startScreen)
		needs = (try? container.decodeIfPresent([String].self, forKey: .needs)) ?? []
	}
}

struct TestCaseLastRun: Decodable, Equatable {
	let verdict: String?

	/// D-220: Claude's own verdict when `verdict` is UNCONFIRMED, until a replay of the saved recording passes.
	let claudeVerdict: String?

	/// `replay` for a recording, `run` for a Claude run.
	let mode: String?

	let finishedAt: Date?
	let durationMs: Double?

	/// Set when a person's override, not the run, gives `verdict` (D-180).
	let resultOverride: TestCaseResultOverride?

	/// The build the run tested, "branch @ sha · 15.0.0 (150006)" (D-188).
	let build: String?

	/// Set when a newer build changed the code this case covers (D-188).
	let stale: TestCaseStale?

	private enum CodingKeys: String, CodingKey {
		case verdict
		case claudeVerdict
		case mode
		case finishedAt = "at"
		case durationMs
		case resultOverride = "override"
		case build
		case stale
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		verdict = try? container.decodeIfPresent(String.self, forKey: .verdict)
		claudeVerdict = try? container.decodeIfPresent(String.self, forKey: .claudeVerdict)
		mode = try? container.decodeIfPresent(String.self, forKey: .mode)
		let finishedText = try? container.decodeIfPresent(String.self, forKey: .finishedAt)
		finishedAt = finishedText.flatMap { ServerDate.parse(text: $0) }
		durationMs = try? container.decodeIfPresent(Double.self, forKey: .durationMs)
		resultOverride = try? container.decodeIfPresent(TestCaseResultOverride.self, forKey: .resultOverride)
		build = try? container.decodeIfPresent(String.self, forKey: .build)
		stale = try? container.decodeIfPresent(TestCaseStale.self, forKey: .stale)
	}
}

struct TestCaseStale: Decodable, Equatable {
	let reason: String
	let files: [String]

	private enum CodingKeys: String, CodingKey {
		case reason
		case files
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		reason = (try? container.decodeIfPresent(String.self, forKey: .reason)) ?? ""
		files = (try? container.decodeIfPresent([String].self, forKey: .files)) ?? []
	}
}

struct TestCaseProof: Decodable, Equatable {
	let screenshotCount: Int
	let videoCount: Int

	private enum CodingKeys: String, CodingKey {
		case screenshotCount = "screenshots"
		case videoCount = "videos"
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		screenshotCount = (try? container.decodeIfPresent(Int.self, forKey: .screenshotCount)) ?? 0
		videoCount = (try? container.decodeIfPresent(Int.self, forKey: .videoCount)) ?? 0
	}
}
