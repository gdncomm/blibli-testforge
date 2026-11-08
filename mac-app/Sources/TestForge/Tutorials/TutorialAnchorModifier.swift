import SwiftUI
import TipKit

/// Pins tutorial tips to a control; the coordinator decides whether one shows.
private struct TutorialAnchorModifier: ViewModifier {
	let anchor: TutorialAnchor
	@EnvironmentObject private var tutorials: TutorialCoordinator

	func body(content: Content) -> some View {
		content
			.popoverTip(tutorials.tip(at: anchor)) { action in
				tutorials.perform(actionId: action.id)
			}
	}
}

extension View {
	func tutorialAnchor(_ anchor: TutorialAnchor) -> some View {
		modifier(TutorialAnchorModifier(anchor: anchor))
	}

	/// For a view shown in two places: only the copy that `isActive` carries the anchor, so a tip shows once.
	@ViewBuilder
	func tutorialAnchor(_ anchor: TutorialAnchor, isActive: Bool) -> some View {
		if isActive {
			modifier(TutorialAnchorModifier(anchor: anchor))
		} else {
			self
		}
	}
}
