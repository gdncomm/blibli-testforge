import SwiftUI

/// Build › Free space and reset: delete one row, or tick several and reset them together; follow the log.
struct ResetSectionView<ViewModel: ResetSectionPresenting>: View {
	@ObservedObject var viewModel: ViewModel

	var body: some View {
		Section {
			planRows
			actionRow
			resultRow
		} header: {
			// On the header, not the Section: a Section's identifier lands on every row and hides the rows' own.
			Text("Free space and reset")
				.accessibilityIdentifier(TestForgeConstants.Accessibility.reset)
				.tutorialAnchor(.buildCleanSection)
		} footer: {
			Text("""
				Only testforge and build folders are deleted; your repo, branches and uncommitted work are never changed. \
				After deleting QA build output, the next run needs Build for testing. The test runner's own screenshots are \
				also deleted after every run.
				""")
				.foregroundStyle(.secondary)
		}
		.confirmationDialog("Reset for a fresh run?", isPresented: $viewModel.isConfirmationShown) {
			Button("Delete", role: .destructive, action: viewModel.confirmReset)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.resetConfirmButton)
		} message: {
			Text(viewModel.confirmationMessage)
		}
		.confirmationDialog(deleteTitle, isPresented: isDeleteConfirmationShown, presenting: viewModel.pendingDeleteItem) { _ in
			Button("Delete", role: .destructive, action: viewModel.confirmDelete)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.resetItemDeleteConfirm)
		} message: { item in
			Text(viewModel.deleteConfirmationMessage(for: item))
		}
		BuildLogSectionView(lines: viewModel.logLines, title: "Reset log", accessibilityId: TestForgeConstants.Accessibility.resetLog)
	}

	@ViewBuilder
	private var planRows: some View {
		switch viewModel.planState {
			case .loading:
				LabeledContent("Measuring folders…") {
					ProgressView()
						.controlSize(.small)
				}
			case .loaded(let items):
				ForEach(items) { item in
					let content = ResetItemRowContent(
						item: item,
						sizeText: viewModel.sizeText(of: item),
						isDeleting: viewModel.isDeleting(item: item),
						canDelete: viewModel.canDeleteOne
					)
					ResetItemRowView(content: content, isSelected: selection(for: item)) {
						viewModel.requestDelete(item: item)
					}
				}
			case .failed(let message):
				Label(message, systemImage: "exclamationmark.triangle")
					.foregroundStyle(.red)
		}
	}

	private var actionRow: some View {
		HStack {
			Button("Check sizes again", action: viewModel.load)
				.disabled(!viewModel.canRefresh)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.resetRefreshButton)
			Spacer()
			if viewModel.runState == .running {
				ProgressView()
					.controlSize(.small)
			}
			Button(viewModel.resetButtonTitle, role: .destructive, action: viewModel.requestReset)
				.disabled(!viewModel.canReset)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.resetStartButton)
		}
	}

	@ViewBuilder
	private var resultRow: some View {
		if case .finished(let result) = viewModel.runState {
			Label {
				VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
					Text(result.title)
						.font(.headline)
					Text(result.message)
						.foregroundStyle(.secondary)
						.lineLimit(TestForgeConstants.Build.resultLineLimit)
				}
			} icon: {
				Image(systemName: result.isSuccess ? "checkmark.circle.fill" : "xmark.octagon.fill")
					.foregroundStyle(result.isSuccess ? .green : .red)
			}
			.accessibilityElement(children: .combine)
		}
	}

	private var deleteTitle: String {
		String(localized: "Delete \(viewModel.pendingDeleteItem?.title ?? "")?")
	}

	private var isDeleteConfirmationShown: Binding<Bool> {
		Binding {
			viewModel.pendingDeleteItem != nil
		} set: { isShown in
			if !isShown {
				viewModel.pendingDeleteItem = nil
			}
		}
	}

	private func selection(for item: ResetPlanItem) -> Binding<Bool> {
		Binding {
			viewModel.isSelected(item: item)
		} set: { isSelected in
			viewModel.setSelected(item: item, isSelected: isSelected)
		}
	}
}
