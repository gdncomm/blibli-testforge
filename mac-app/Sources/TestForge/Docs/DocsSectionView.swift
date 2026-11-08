import SwiftUI
import UniformTypeIdentifiers

/// The Docs section (D-218): the app's guides and the checkout's docs listed and read in place, plus any Markdown
/// file someone drops or opens. Half shows the list beside the page; Full gives the page the whole window.
struct DocsSectionView: View {
	@ObservedObject var viewModel: DocsViewModel
	@Environment(\.openWindow) private var openWindow

	var body: some View {
		VStack(spacing: 0) {
			actionBar
			Divider()
			HStack(spacing: 0) {
				if viewModel.readingMode == .half {
					DocsListView(viewModel: viewModel)
						.frame(width: DocsConstants.listWidth)
					Divider()
				}
				VStack(spacing: 0) {
					DocsPageHeaderView(viewModel: viewModel)
						.padding(.horizontal, TestForgeConstants.Spacing.large)
						.padding(.vertical, TestForgeConstants.Spacing.medium)
					Divider()
					DocsPageView(viewModel: viewModel)
				}
			}
		}
		.modifier(DocsDropModifier(viewModel: viewModel))
		.fileImporter(
			isPresented: $viewModel.isImporterPresented,
			allowedContentTypes: Self.openableTypes,
			allowsMultipleSelection: true,
			onCompletion: viewModel.importerFinished
		)
		.onAppear {
			if viewModel.entries.isEmpty && !viewModel.isListing {
				viewModel.load()
			}
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(DocsConstants.Accessibility.section)
	}

	/// Markdown by extension where the system knows it, plain text, and folders (their Markdown is added).
	static var openableTypes: [UTType] {
		let markdown = DocsFileKind.markdownExtensions.compactMap { UTType(filenameExtension: $0) }
		return markdown + [.plainText, .folder]
	}

	private var actionBar: some View {
		VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
			HStack(spacing: TestForgeConstants.Spacing.medium) {
				Button {
					viewModel.isImporterPresented = true
				} label: {
					Label("Open…", systemImage: "folder")
				}
				.help("Open Markdown files or a folder of them (⌘O). You can also drop them on this page.")
				.accessibilityIdentifier(DocsConstants.Accessibility.openButton)
				.tutorialAnchor(.docsOpenButton)
				Button(action: viewModel.reload) {
					if viewModel.isListing || viewModel.isLoading {
						ActionProgressLabel(title: String(localized: "Reload"), busyTitle: String(localized: "Reloading…"), isBusy: true)
					} else {
						Label("Reload", systemImage: "arrow.clockwise")
					}
				}
				.disabled(viewModel.isListing)
				.help("Read the list and the open document again, after a file changed on disk")
				.accessibilityIdentifier(DocsConstants.Accessibility.reloadButton)
				Spacer()
				Picker("Layout", selection: $viewModel.readingMode) {
					ForEach(DocsReadingMode.allCases) { mode in
						Label(mode.title, systemImage: mode.symbolName)
							.tag(mode)
					}
				}
				.pickerStyle(.segmented)
				.fixedSize()
				.help("Half: the list beside the page. Full: the page takes the whole window.")
				.accessibilityIdentifier(DocsConstants.Accessibility.modePicker)
				.tutorialAnchor(.docsModePicker)
				windowMenu
			}
			if let notice = viewModel.noticeText {
				DocsNoticeView(text: notice, isWarning: viewModel.isNoticeWarning, dismiss: viewModel.dismissNotice)
			}
			if let message = viewModel.windowMessage {
				DocsNoticeView(text: message, isWarning: true, dismiss: nil)
			}
		}
		.padding(TestForgeConstants.Spacing.large)
	}

	private var windowMenu: some View {
		Menu {
			Button("Open in a window") {
				openWindow(id: DocsConstants.windowId)
			}
			.accessibilityIdentifier(DocsConstants.Accessibility.windowMenuPrefix + "plain")
			Divider()
			ForEach(DocsWindowLayout.allCases) { layout in
				Button {
					openWindow(id: DocsConstants.windowId)
					Task { await viewModel.arrangeWindow(layout) }
				} label: {
					Label(layout.title, systemImage: layout.symbolName)
				}
				.accessibilityIdentifier(DocsConstants.Accessibility.windowMenuPrefix + layout.rawValue)
			}
		} label: {
			if let layout = viewModel.arrangingLayout {
				ActionProgressLabel(title: layout.title, busyTitle: String(localized: "Opening…"), isBusy: true)
			} else {
				Label("Window", systemImage: "macwindow")
			}
		}
		.fixedSize()
		.help("Read this document in its own window: left half, right half or full screen")
		.accessibilityIdentifier(DocsConstants.Accessibility.windowButton)
		.tutorialAnchor(.docsWindowButton)
	}
}

/// The separate Docs window: the same document as the section, with buttons that move the window to a half of
/// the screen or into full screen.
struct DocsWindowView: View {
	@ObservedObject var viewModel: DocsViewModel

	var body: some View {
		VStack(spacing: 0) {
			HStack(spacing: TestForgeConstants.Spacing.medium) {
				DocsPageHeaderView(viewModel: viewModel, showsTips: false)
				Divider()
					.frame(height: TestForgeConstants.Spacing.extraLarge)
				ForEach(DocsWindowLayout.allCases) { layout in
					Button {
						Task { await viewModel.arrangeWindow(layout) }
					} label: {
						Label(layout.title, systemImage: layout.symbolName)
					}
					.labelStyle(.iconOnly)
					.help(layout.title)
					.accessibilityIdentifier(DocsConstants.Accessibility.windowLayoutPrefix + layout.rawValue)
				}
			}
			.padding(.horizontal, TestForgeConstants.Spacing.large)
			.padding(.vertical, TestForgeConstants.Spacing.medium)
			if let message = viewModel.windowMessage ?? viewModel.noticeText {
				DocsNoticeView(text: message, isWarning: viewModel.windowMessage != nil || viewModel.isNoticeWarning, dismiss: nil)
					.padding(.horizontal, TestForgeConstants.Spacing.large)
					.padding(.bottom, TestForgeConstants.Spacing.small)
					.accessibilityIdentifier(DocsConstants.Accessibility.windowLayoutStatus)
			}
			Divider()
			DocsPageView(viewModel: viewModel, showsTips: false)
		}
		.frame(minWidth: DocsConstants.windowMinWidth, minHeight: DocsConstants.windowMinHeight)
		.modifier(DocsDropModifier(viewModel: viewModel))
		.onAppear {
			if viewModel.entries.isEmpty && !viewModel.isListing {
				viewModel.load()
			}
		}
		.navigationTitle(Text(viewModel.selectedEntry?.title ?? String(localized: "Docs")))
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(DocsConstants.Accessibility.window)
	}
}

/// Drop Markdown files or folders anywhere on the page; a tinted border says the drop will be taken.
struct DocsDropModifier: ViewModifier {
	@ObservedObject var viewModel: DocsViewModel

	func body(content: Content) -> some View {
		content
			.dropDestination(for: URL.self) { urls, _ in
				viewModel.add(urls)
			} isTargeted: { isTargeted in
				viewModel.isDropTargeted = isTargeted
			}
			.overlay {
				if viewModel.isDropTargeted {
					RoundedRectangle(cornerRadius: DocsConstants.dropCornerRadius)
						.strokeBorder(Color.accentColor, lineWidth: DocsConstants.dropBorderWidth)
						.background(
							Color.accentColor.opacity(DocsConstants.dropBackgroundOpacity),
							in: RoundedRectangle(cornerRadius: DocsConstants.dropCornerRadius)
						)
						.overlay {
							Label("Drop to read: Markdown files or a folder of them", systemImage: "arrow.down.doc")
								.font(.title3)
								.padding()
								.background(.regularMaterial, in: Capsule())
						}
						.padding(TestForgeConstants.Spacing.small)
						.allowsHitTesting(false)
						.accessibilityIdentifier(DocsConstants.Accessibility.dropOverlay)
				}
			}
			.accessibilityIdentifier(DocsConstants.Accessibility.dropZone)
	}
}

struct DocsNoticeView: View {
	let text: String
	let isWarning: Bool
	let dismiss: (() -> Void)?

	var body: some View {
		HStack(spacing: TestForgeConstants.Spacing.small) {
			Label(text, systemImage: isWarning ? "exclamationmark.triangle" : "checkmark.circle")
				.font(.callout)
				.foregroundStyle(isWarning ? Color.orange : Color.secondary)
				.textSelection(.enabled)
			if let dismiss {
				Button("Dismiss", action: dismiss)
					.buttonStyle(.link)
					.font(.callout)
			}
		}
		.accessibilityElement(children: .contain)
		.accessibilityIdentifier(DocsConstants.Accessibility.notice)
	}
}
