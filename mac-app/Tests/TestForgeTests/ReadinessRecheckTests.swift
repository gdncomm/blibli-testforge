import Foundation
import Testing
@testable import TestForge

private func check(ok: Bool = false, detail: String = "287952a isn't built yet", isWorking: Bool = false) -> ReadinessCheck {
	let json = #"{"id":"bundle","label":"App + tests built","detail":"\#(detail)","ok":\#(ok),"isWorking":\#(isWorking),"fix":"build-qa"}"#
	return try! JSONDecoder().decode(ReadinessCheck.self, from: Data(json.utf8))
}

@Suite("Readiness recheck after a fix (D-223)")
struct ReadinessRecheckTests {
	private let start = Date(timeIntervalSince1970: 1_000)
	private var recheck: ReadinessRecheck {
		ReadinessRecheck(message: "Build started", detailWhenStarted: "287952a isn't built yet", startedAt: start)
	}

	@Test("an unchanged failing check keeps the row in progress")
	func keepsWaiting() {
		#expect(!recheck.isSettled(by: check(), now: start.addingTimeInterval(5), timeout: 90))
	}

	@Test("the check reporting back settles the wait")
	func settles() {
		#expect(recheck.isSettled(by: check(ok: true, detail: "built"), now: start, timeout: 90))
		#expect(recheck.isSettled(by: check(detail: "a build is running", isWorking: true), now: start, timeout: 90))
		#expect(recheck.isSettled(by: check(detail: "build failed"), now: start, timeout: 90))
		#expect(recheck.isSettled(by: nil, now: start, timeout: 90))
	}

	@Test("a fix that changed nothing stops waiting after the timeout")
	func timesOut() {
		#expect(recheck.isSettled(by: check(), now: start.addingTimeInterval(90), timeout: 90))
	}

	@Test("isWorking is read from the server, false when missing")
	func decodesIsWorking() throws {
		#expect(check(isWorking: true).isWorking)
		let plain = try JSONDecoder().decode(ReadinessCheck.self, from: Data(#"{"id":"x","ok":false}"#.utf8))
		#expect(!plain.isWorking)
	}
}
