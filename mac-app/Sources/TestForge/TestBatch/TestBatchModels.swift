import Foundation

/// The `testBatch` state slice (`GET /api/test-batches`): proof folder and the active Test Batch.
struct TestBatchSnapshot: Decodable, Equatable {
	let proofRoot: String?

	/// The folder configured before R4j (`TEST_FORGE_MEDIA_ROOT`); offered in the picker until one is chosen.
	let suggestedRoot: String?

	let active: TestBatchSummary?

	/// D-212: batches set aside to come back to, most recently paused first.
	let pausedBatches: [TestBatchSummary]

	/// D-184: ended batches, newest first, that can be reopened.
	let endedBatches: [TestBatchSummary]

	/// D-189: every batch, active first, for Reports › Batches.
	let batches: [TestBatchSummary]

	private enum CodingKeys: String, CodingKey {
		case proofRoot
		case suggestedRoot
		case active
		case paused
		case batches
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		proofRoot = try? container.decodeIfPresent(String.self, forKey: .proofRoot)
		suggestedRoot = try? container.decodeIfPresent(String.self, forKey: .suggestedRoot)
		active = try? container.decodeIfPresent(TestBatchSummary.self, forKey: .active)
		let allBatches = (try? container.decodeIfPresent([TestBatchSummary].self, forKey: .batches)) ?? []
		batches = allBatches
		pausedBatches = (try? container.decodeIfPresent([TestBatchSummary].self, forKey: .paused)) ?? allBatches.filter { $0.status == .paused }
		endedBatches = allBatches.filter { $0.status == .ended }
	}
}

/// D-212: active collects new work; paused keeps its work but collects nothing until resumed; ended has its report.
enum TestBatchStatus: String, Equatable {
	case active
	case paused
	case ended
}

struct TestBatchSummary: Decodable, Equatable, Identifiable {
	let id: String
	let name: String
	let folder: String
	let itemCount: Int
	let reportPath: String?
	let status: TestBatchStatus
	let startedAt: Date?
	let endedAt: Date?
	let pausedAt: Date?
	let pauseCount: Int

	/// Where the batch stands per case (D-189), from outcomes the server keeps on the batch itself.
	let progress: TestBatchProgress

	/// D-201: set when this batch replays an earlier one on a new build — case by case against that batch.
	let comparison: TestBatchComparison?

	private enum CodingKeys: String, CodingKey {
		case id
		case name
		case folder
		case itemCount
		case reportPath
		case status
		case startedAt
		case endedAt
		case pausedAt
		case pauses
		case progress
		case comparison
	}

	var isActive: Bool {
		status == .active
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		id = try container.decode(String.self, forKey: .id)
		name = (try? container.decodeIfPresent(String.self, forKey: .name)) ?? ""
		folder = (try? container.decodeIfPresent(String.self, forKey: .folder)) ?? ""
		itemCount = (try? container.decodeIfPresent(Int.self, forKey: .itemCount)) ?? 0
		reportPath = try? container.decodeIfPresent(String.self, forKey: .reportPath)
		let statusText = try? container.decodeIfPresent(String.self, forKey: .status)
		status = statusText.flatMap { TestBatchStatus(rawValue: $0) } ?? .ended
		let startedText = try? container.decodeIfPresent(String.self, forKey: .startedAt)
		startedAt = startedText.flatMap { ServerDate.parse(text: $0) }
		let endedText = try? container.decodeIfPresent(String.self, forKey: .endedAt)
		endedAt = endedText.flatMap { ServerDate.parse(text: $0) }
		let pausedText = try? container.decodeIfPresent(String.self, forKey: .pausedAt)
		pausedAt = pausedText.flatMap { ServerDate.parse(text: $0) }
		pauseCount = ((try? container.decodeIfPresent([TestBatchPause].self, forKey: .pauses)) ?? []).count
		progress = (try? container.decodeIfPresent(TestBatchProgress.self, forKey: .progress)) ?? .empty
		comparison = try? container.decodeIfPresent(TestBatchComparison.self, forKey: .comparison)
	}
}

/// One entry of a batch's `pauses`; only the count is shown, so nothing is read from it.
struct TestBatchPause: Decodable {
	init(from decoder: Decoder) throws {
		// Each pause is counted, not read.
	}
}

struct TestBatchComparison: Decodable, Equatable {
	let sourceName: String
	let regressed: Int
	let fixed: Int
	let same: Int
	let missing: Int

	private enum CodingKeys: String, CodingKey {
		case sourceName
		case regressed
		case fixed
		case same
		case missing
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		sourceName = (try? container.decodeIfPresent(String.self, forKey: .sourceName)) ?? ""
		regressed = (try? container.decodeIfPresent(Int.self, forKey: .regressed)) ?? 0
		fixed = (try? container.decodeIfPresent(Int.self, forKey: .fixed)) ?? 0
		same = (try? container.decodeIfPresent(Int.self, forKey: .same)) ?? 0
		missing = (try? container.decodeIfPresent(Int.self, forKey: .missing)) ?? 0
	}
}

/// What `POST /api/test-batches/:id/replay` started (D-201): the new batch, the cases it replays, and those without a recording.
struct TestBatchReplayStart: Decodable {
	let batchId: String
	let caseCount: Int
	let skippedCount: Int

	private enum CodingKeys: String, CodingKey {
		case batch
		case caseIds
		case skipped
	}

	private enum BatchKeys: String, CodingKey {
		case id
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		let batch = try container.nestedContainer(keyedBy: BatchKeys.self, forKey: .batch)
		batchId = try batch.decode(String.self, forKey: .id)
		caseCount = ((try? container.decodeIfPresent([String].self, forKey: .caseIds)) ?? []).count
		skippedCount = ((try? container.decodeIfPresent([String].self, forKey: .skipped)) ?? []).count
	}
}

struct TestBatchProgress: Decodable, Equatable {
	static let empty = TestBatchProgress(passed: 0, failed: 0, undecided: 0, running: 0, caseCount: 0)

	let passed: Int
	let failed: Int
	let undecided: Int
	let running: Int
	let caseCount: Int

	private enum CodingKeys: String, CodingKey {
		case passed
		case failed
		case undecided
		case running
		case caseCount = "cases"
	}

	init(passed: Int, failed: Int, undecided: Int, running: Int, caseCount: Int) {
		self.passed = passed
		self.failed = failed
		self.undecided = undecided
		self.running = running
		self.caseCount = caseCount
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		passed = (try? container.decodeIfPresent(Int.self, forKey: .passed)) ?? 0
		failed = (try? container.decodeIfPresent(Int.self, forKey: .failed)) ?? 0
		undecided = (try? container.decodeIfPresent(Int.self, forKey: .undecided)) ?? 0
		running = (try? container.decodeIfPresent(Int.self, forKey: .running)) ?? 0
		caseCount = (try? container.decodeIfPresent(Int.self, forKey: .caseCount)) ?? 0
	}
}

struct TestBatchEndResponse: Decodable {
	let batch: TestBatchSummary

	private enum CodingKeys: String, CodingKey {
		case batch
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		batch = try container.decode(TestBatchSummary.self, forKey: .batch)
	}
}
