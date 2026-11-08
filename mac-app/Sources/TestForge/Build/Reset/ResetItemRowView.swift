import SwiftUI

struct ResetItemRowContent {
	let item: ResetPlanItem
	let sizeText: String
	let isDeleting: Bool
	let canDelete: Bool
}

/// One row: its size, a switch to include it in Reset selected, and its own Delete… (D-214); the repo row is info only.
struct ResetItemRowView: View {
	let content: ResetItemRowContent
	@Binding var isSelected: Bool
	let onDelete: () -> Void

	private var item: ResetPlanItem {
		content.item
	}

	var body: some View {
		if item.isInfo {
			LabeledContent {
				Image(systemName: "lock")
					.foregroundStyle(.secondary)
			} label: {
				labelText
			}
			.accessibilityIdentifier(TestForgeConstants.Accessibility.resetItemPrefix + item.id)
		} else {
			LabeledContent {
				HStack(spacing: TestForgeConstants.Spacing.medium) {
					Text(content.isDeleting ? String(localized: "freeing space…") : content.sizeText)
						.monospacedDigit()
						.foregroundStyle(.secondary)
					Toggle(item.title, isOn: $isSelected)
						.labelsHidden()
						.toggleStyle(.switch)
						.help("Include in Reset selected")
						.accessibilityIdentifier(TestForgeConstants.Accessibility.resetItemTogglePrefix + item.id)
					Button(role: .destructive, action: onDelete) {
						ActionProgressLabel(title: String(localized: "Delete…"), busyTitle: String(localized: "Deleting…"), isBusy: content.isDeleting)
					}
					.disabled(!content.canDelete)
					.help("Delete only this, after you confirm")
					.accessibilityIdentifier(TestForgeConstants.Accessibility.resetItemDeletePrefix + item.id)
				}
			} label: {
				labelText
			}
			.accessibilityIdentifier(TestForgeConstants.Accessibility.resetItemPrefix + item.id)
		}
	}

	@ViewBuilder
	private var labelText: some View {
		Text(item.title)
		Text(item.detail)
	}
}
