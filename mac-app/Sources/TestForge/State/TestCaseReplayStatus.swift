import Foundation

/// D-220: whether a case replays without Claude, from the `testcases` slice.
enum TestCaseReplayKind: String, Decodable, Equatable {
	/// A recording whose last replay passed: replays and batches need no Claude.
	case free

	/// A recording no replay has passed yet, or whose last replay didn't pass; Replay confirms it.
	case unconfirmed

	/// A recording that can't replay (a missing routine or element); Claude must repair it.
	case broken

	/// No recording: only Claude can run the case.
	case claude
}

struct TestCaseReplayStatus: Decodable, Equatable {
	let kind: TestCaseReplayKind

	/// The server's reason in words, shown as the icon's help and in the case's detail.
	let text: String

	private enum CodingKeys: String, CodingKey {
		case kind
		case text
	}

	init(kind: TestCaseReplayKind, text: String) {
		self.kind = kind
		self.text = text
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		kind = (try? container.decodeIfPresent(TestCaseReplayKind.self, forKey: .kind)) ?? .claude
		text = (try? container.decodeIfPresent(String.self, forKey: .text)) ?? ""
	}

	/// A server older than D-220 sends no status: a recording is then taken as replayable but not confirmed.
	static func fallback(hasRecording: Bool) -> TestCaseReplayStatus {
		hasRecording
			? TestCaseReplayStatus(kind: .unconfirmed, text: String(localized: "Recorded; replay it to confirm it runs without Claude"))
			: TestCaseReplayStatus(kind: .claude, text: String(localized: "No recording yet: running this case needs Claude"))
	}
}
