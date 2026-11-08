import Foundation
import Testing
@testable import TestForge

private func summary(_ json: String) throws -> TestCaseSummary {
	try JSONDecoder().decode(TestCaseSummary.self, from: Data(json.utf8))
}

struct ReplayStatusDecodingTests {
	@Test func readsTheServersReplayStatus() throws {
		let testCase = try summary(#"{"id":"SF-1","macro":{"id":"mc_A","name":"Open"},"replay":{"kind":"free","text":"Replays without Claude"}}"#)
		#expect(testCase.replay == TestCaseReplayStatus(kind: .free, text: "Replays without Claude"))
	}

	@Test func anOlderServerFallsBackFromTheRecording() throws {
		let recorded = try summary(#"{"id":"SF-1","macro":{"id":"mc_A","name":"Open"}}"#)
		let bare = try summary(#"{"id":"SF-2"}"#)
		#expect(recorded.replay.kind == .unconfirmed)
		#expect(bare.replay.kind == .claude)
	}

	@Test func anUnknownKindIsTreatedAsNeedingClaude() throws {
		let testCase = try summary(#"{"id":"SF-1","replay":{"kind":"later","text":"?"}}"#)
		#expect(testCase.replay.kind == .claude)
	}
}

struct ReplayBadgeTests {
	@Test func onlyARecordingThatRunsWithoutClaudeCanReplay() {
		let kinds: [TestCaseReplayKind] = [.free, .unconfirmed, .broken, .claude]
		let replayable = kinds.filter { TestCaseReplayBadge(status: TestCaseReplayStatus(kind: $0, text: "")).canReplay }
		#expect(replayable == [.free, .unconfirmed])
	}

	@Test func claudeIsMarkedWithSparklesAndTheDriverWithABolt() {
		#expect(TestCaseReplayBadge(status: TestCaseReplayStatus(kind: .claude, text: "")).systemImage == "sparkles")
		#expect(TestCaseReplayBadge(status: TestCaseReplayStatus(kind: .free, text: "")).systemImage == "bolt.circle.fill")
	}
}

struct ReplayMappingTests {
	private let cases = [
		#"{"id":"A","macro":{"id":"mc_A","name":"A"},"replay":{"kind":"free","text":""},"lastRun":{"verdict":"PASS","mode":"replay"}}"#,
		#"{"id":"B","replay":{"kind":"claude","text":""},"lastRun":{"verdict":"UNCONFIRMED","claudeVerdict":"PASS — shows","mode":"run"}}"#,
		#"{"id":"C","macro":{"id":"mc_C","name":"C"},"replay":{"kind":"broken","text":""}}"#,
	]

	private func decoded() throws -> [TestCaseSummary] {
		try cases.map { try summary($0) }
	}

	@Test func filtersSplitFreeReplaysFromClaudeCases() throws {
		let all = try decoded()
		#expect(TestsSectionMapper.rows(for: all, filter: .recorded, searchText: "").map(\.id) == ["A"])
		#expect(TestsSectionMapper.rows(for: all, filter: .needsClaude, searchText: "").map(\.id) == ["B", "C"])
	}

	@Test func anUnconfirmedClaudePassSaysWhatConfirmsIt() throws {
		let all = try decoded()
		let detail = TestsSectionMapper.detail(for: all[1])
		#expect(detail.lastRunTone == .neutral)
		#expect(detail.unconfirmedText?.contains("Claude said PASS, but no recording was saved") == true)
		#expect(TestsSectionMapper.detail(for: all[0]).unconfirmedText == nil)
	}

	@Test func theHeaderCountsFreeReplaysAndClaudeCases() throws {
		let json = "{\"cases\":[\(cases.joined(separator: ","))]}"
		let document = try JSONDecoder().decode(TestCaseDocument.self, from: Data(json.utf8))
		#expect(TestsSectionMapper.header(for: document).caseCountText == "3 cases · 1 free replays · 2 need Claude")
	}
}
