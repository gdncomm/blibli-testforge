import Foundation

/// D-223: a row whose fix the server accepted. The row shows progress, never a tick, until its check reports back.
struct ReadinessRecheck: Equatable {
	/// What the row says while it waits, e.g. "Build started — this row updates when it finishes".
	let message: String
	let detailWhenStarted: String
	let startedAt: Date

	/// Settled once the check says something new: it passed, the server took over the progress, its detail changed,
	/// or the wait ran out. A row that isn't a server check (nil) has nothing to wait for.
	func isSettled(by check: ReadinessCheck?, now: Date, timeout: TimeInterval) -> Bool {
		guard let check else {
			return true
		}
		return check.isPassing || check.isWorking || check.detail != detailWhenStarted || now.timeIntervalSince(startedAt) >= timeout
	}
}
