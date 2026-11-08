import Foundation

/// D-213: per-button state, so the control the user clicked shows its own progress and failure.
extension BuildSectionViewModel {
	func isRunning(_ action: BuildAction) -> Bool {
		runningAction == action
	}

	/// The last failure of `action`, shown next to its button; nil once anything else runs or it succeeded.
	func failureMessage(for action: BuildAction) -> String? {
		guard runningAction == nil,
			let result = lastResult,
			result.action == action,
			!result.isSuccess
		else {
			return nil
		}
		return result.message
	}
}
