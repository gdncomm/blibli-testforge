import SwiftUI

/// The documents: the app's guides, the checkout's docs, and files you dropped or opened.
struct DocsListView: View {
	@ObservedObject var viewModel: DocsViewModel

	var body: some View {
		VStack(spacing: 0) {
			TextField("Filter documents", text: $viewModel.filterText)
				.textFieldStyle(.roundedBorder)
				.padding(TestForgeConstants.Spacing.medium)
				.accessibilityIdentifier(DocsConstants.Accessibility.listFilter)
			Divider()
			content
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(DocsConstants.Accessibility.list)
		.tutorialAnchor(.docsList)
	}

	@ViewBuilder
	private var content: some View {
		if viewModel.isListing && viewModel.entries.isEmpty {
			LoadingStateView(text: "Looking for documents…")
				.frame(maxWidth: .infinity, maxHeight: .infinity)
		} else if viewModel.groups.isEmpty {
			ContentUnavailableView {
				Label(viewModel.filterText.isEmpty ? "No documents yet" : "No match", systemImage: "doc.text")
			} description: {
				Text(viewModel.filterText.isEmpty
					? "Drop Markdown files here, or press Open…."
					: "No document's title or path contains “\(viewModel.filterText)”.")
			}
			.frame(maxWidth: .infinity, maxHeight: .infinity)
		} else {
			List(selection: selection) {
				ForEach(viewModel.groups, id: \.group) { section in
					Section {
						ForEach(section.entries) { entry in
							DocsListRowView(entry: entry, remove: { viewModel.remove(entry) })
								.tag(entry.id)
						}
					} header: {
						Text(section.group.title)
							.accessibilityIdentifier(DocsConstants.Accessibility.groupPrefix + section.group.rawValue)
					}
				}
			}
			.listStyle(.sidebar)
		}
	}

	private var selection: Binding<String?> {
		Binding {
			viewModel.selectedId
		} set: { id in
			guard let entry = viewModel.entries.first(where: { $0.id == id }) else {
				return
			}
			viewModel.select(entry)
		}
	}
}

struct DocsListRowView: View {
	let entry: DocsEntry
	let remove: () -> Void

	var body: some View {
		HStack(spacing: TestForgeConstants.Spacing.medium) {
			Image(systemName: entry.group == .guides ? "book" : "doc.text")
				.foregroundStyle(.secondary)
				.accessibilityHidden(true)
			VStack(alignment: .leading, spacing: 2) {
				Text(entry.title)
					.lineLimit(2)
					.accessibilityIdentifier(DocsConstants.Accessibility.rowTitlePrefix + entry.id)
				Text(entry.subtitle)
					.font(.caption)
					.foregroundStyle(.secondary)
					.lineLimit(1)
					.truncationMode(.middle)
					.accessibilityIdentifier(DocsConstants.Accessibility.rowSubtitlePrefix + entry.id)
			}
			Spacer(minLength: 0)
		}
		.help(entry.url.path)
		.contextMenu {
			if entry.group == .yours {
				Button("Remove from Your files", role: .destructive, action: remove)
					.accessibilityIdentifier(DocsConstants.Accessibility.rowRemovePrefix + entry.id)
			}
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(DocsConstants.Accessibility.rowPrefix + entry.id)
	}
}
