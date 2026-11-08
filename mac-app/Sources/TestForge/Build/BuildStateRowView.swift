import SwiftUI

struct BuildStateRowView: View {
	let presentation: BuildStatusPresentation

	var body: some View {
		Label {
			VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
				Text(presentation.title)
					.font(.headline)
				if !presentation.detail.isEmpty {
					Text(presentation.detail)
						.foregroundStyle(.secondary)
				}
			}
		} icon: {
			icon
		}
		.accessibilityElement(children: .combine)
		.accessibilityIdentifier(TestForgeConstants.Accessibility.buildQAState)
	}

	@ViewBuilder
	private var icon: some View {
		switch presentation.tone {
			case .ready:
				Image(systemName: "checkmark.circle.fill")
					.foregroundStyle(.green)
			case .needsBuild:
				Image(systemName: "exclamationmark.circle.fill")
					.foregroundStyle(.orange)
			case .building:
				ProgressView()
					.controlSize(.small)
		}
	}
}
