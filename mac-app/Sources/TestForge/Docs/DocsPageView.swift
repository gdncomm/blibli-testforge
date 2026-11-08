import SwiftUI

/// The open document: its title and path, the rendered page, and its outline. Used by the section and the window.
struct DocsPageView: View {
	@ObservedObject var viewModel: DocsViewModel

	/// False in the Docs window: the section's copy carries the tips.
	var showsTips = true

	var body: some View {
		HStack(spacing: 0) {
			content
				.frame(minWidth: DocsConstants.pageMinWidth, maxWidth: .infinity, maxHeight: .infinity)
			if viewModel.isOutlineShown, let document = viewModel.document, !document.headings.isEmpty {
				Divider()
				DocsOutlineView(headings: document.headings, jump: viewModel.jump(to:))
					.frame(width: DocsConstants.outlineWidth)
			}
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(DocsConstants.Accessibility.page)
		.tutorialAnchor(.docsPage, isActive: showsTips)
	}

	@ViewBuilder
	private var content: some View {
		switch viewModel.documentState {
			case .empty:
				ContentUnavailableView {
					Label("Pick a document", systemImage: "book")
				} description: {
					Text("Choose one on the left, or drop Markdown files anywhere on this page to read them.")
				}
				.accessibilityIdentifier(DocsConstants.Accessibility.pageEmpty)
			case .loading(let entry):
				LoadingStateView(text: "Opening \(entry.title)…")
					.accessibilityIdentifier(DocsConstants.Accessibility.pageLoading)
			case .loaded(let document):
				MarkdownView(blocks: document.blocks, scrollTarget: $viewModel.scrollTarget, openLink: viewModel.openLink)
					.id(document.entry.id)
			case .failed(_, let message):
				ContentUnavailableView {
					Label("Couldn't open this document", systemImage: "exclamationmark.triangle")
				} description: {
					Text(message)
				} actions: {
					Button("Try again", action: viewModel.reload)
				}
				.accessibilityIdentifier(DocsConstants.Accessibility.pageFailed)
		}
	}
}

/// The page's headings; clicking one scrolls the page to it.
struct DocsOutlineView: View {
	let headings: [MarkdownHeading]
	let jump: (MarkdownHeading) -> Void

	var body: some View {
		let topLevel = headings.map(\.level).min() ?? 1
		List {
			Section("On this page") {
				ForEach(headings) { heading in
					Button {
						jump(heading)
					} label: {
						Text(heading.title)
							.font(heading.level == topLevel ? .callout.weight(.semibold) : .callout)
							.lineLimit(2)
							.frame(maxWidth: .infinity, alignment: .leading)
							.contentShape(Rectangle())
					}
					.buttonStyle(.plain)
					.padding(.leading, CGFloat(max(heading.level - topLevel, 0)) * DocsConstants.outlineIndent)
					.help("Go to “\(heading.title)”")
					.accessibilityIdentifier(DocsConstants.Accessibility.outlineRowPrefix + heading.anchor)
				}
			}
		}
		.listStyle(.sidebar)
		.accessibilityIdentifier(DocsConstants.Accessibility.outline)
	}
}

/// Title, path and the page's own actions, above the page in the section and the window.
struct DocsPageHeaderView: View {
	@ObservedObject var viewModel: DocsViewModel
	var showsTips = true

	var body: some View {
		HStack(spacing: TestForgeConstants.Spacing.medium) {
			Button(action: viewModel.goBack) {
				Label("Back", systemImage: "chevron.backward")
			}
			.labelStyle(.iconOnly)
			.disabled(!viewModel.canGoBack)
			.help("Back to the previous document")
			.accessibilityIdentifier(DocsConstants.Accessibility.backButton)
			VStack(alignment: .leading, spacing: 2) {
				Text(title)
					.font(.headline)
					.lineLimit(1)
					.accessibilityIdentifier(DocsConstants.Accessibility.pageTitle)
				if let entry = viewModel.selectedEntry {
					Text(entry.subtitle)
						.font(.caption)
						.foregroundStyle(.secondary)
						.lineLimit(1)
						.truncationMode(.middle)
						.textSelection(.enabled)
						.accessibilityIdentifier(DocsConstants.Accessibility.pagePath)
				}
			}
			Spacer(minLength: TestForgeConstants.Spacing.medium)
			Toggle(isOn: $viewModel.isOutlineShown) {
				Label("Outline", systemImage: "list.bullet.indent")
			}
			.toggleStyle(.button)
			.labelStyle(.iconOnly)
			.help("Show or hide the headings of this page")
			.accessibilityIdentifier(DocsConstants.Accessibility.outlineToggle)
			.tutorialAnchor(.docsOutlineToggle, isActive: showsTips)
			moreMenu
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(DocsConstants.Accessibility.pageHeader)
	}

	private var title: String {
		viewModel.selectedEntry?.title ?? String(localized: "Docs")
	}

	private var moreMenu: some View {
		Menu {
			Button("Show in Finder", action: viewModel.reveal)
				.accessibilityIdentifier(DocsConstants.Accessibility.revealButton)
			Button("Open in Default App", action: viewModel.openInDefaultApp)
				.accessibilityIdentifier(DocsConstants.Accessibility.openDefaultButton)
			Button("Copy Path", action: viewModel.copyPath)
				.accessibilityIdentifier(DocsConstants.Accessibility.copyPathButton)
		} label: {
			Label("More", systemImage: "ellipsis.circle")
		}
		.menuIndicator(.hidden)
		.fixedSize()
		.disabled(viewModel.selectedEntry == nil)
		.help("Show in Finder, open in another app, or copy the path")
		.accessibilityIdentifier(DocsConstants.Accessibility.moreMenu)
	}
}
