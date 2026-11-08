import Combine
import SwiftUI

/// What Full does to the main window while the Docs section shows (D-218): the page gets the whole window.
enum DocsFullLayout {
	struct Saved: Equatable {
		let sidebar: NavigationSplitViewVisibility
		let isConsoleVisible: Bool
	}

	enum Change: Equatable {
		/// Hide the sidebar and console, keeping how they were.
		case enter(Saved)

		/// Put back what Full hid.
		case leave(Saved)

		case none
	}

	/// Full applies only while Docs is on screen; leaving the section or going back to Half restores the window.
	static func change(
		section: TestForgeSection,
		mode: DocsReadingMode,
		current: Saved,
		saved: Saved?
	) -> Change {
		let wantsFull = section == .docs && mode == .full
		switch (wantsFull, saved) {
			case (true, nil):
				return .enter(current)
			case (false, .some(let previous)):
				return .leave(previous)
			default:
				return .none
		}
	}
}

extension TestForgeViewModel {
	static func makeDocsViewModel(services: TestForgeServices) -> DocsViewModel {
		let dashboard = services.supervisor.location.dashboardDirectory
		let dependencies = DocsDependencies(
			repoRoot: RepoFolderResolver().repoRoot(containing: dashboard),
			desktop: services.desktop,
			windowArranger: DocsWindowArranger()
		)
		return DocsViewModel(dependencies: dependencies)
	}

	/// Opens the Docs section on one of the checkout's files, such as `docs/Usage-guide.md` from the Help menu.
	func showDoc(atRepoPath path: String) {
		selectedSection = .docs
		docsViewModel.open(repoPath: path)
	}

	func openMarkdownFiles() {
		selectedSection = .docs
		docsViewModel.isImporterPresented = true
	}

	func observeDocsLayout() {
		Publishers.CombineLatest($selectedSection, docsViewModel.$readingMode)
			.removeDuplicates { $0 == $1 }
			.sink { [weak self] section, mode in
				self?.applyDocsLayout(section: section, mode: mode)
			}
			.store(in: &docsCancellables)
	}

	private func applyDocsLayout(section: TestForgeSection, mode: DocsReadingMode) {
		let current = DocsFullLayout.Saved(sidebar: sidebarVisibility, isConsoleVisible: isConsoleVisible)
		switch DocsFullLayout.change(section: section, mode: mode, current: current, saved: layoutBeforeDocsFull) {
			case .enter(let saved):
				layoutBeforeDocsFull = saved
				sidebarVisibility = .detailOnly
				isConsoleVisible = false
			case .leave(let saved):
				layoutBeforeDocsFull = nil
				sidebarVisibility = saved.sidebar
				isConsoleVisible = saved.isConsoleVisible
			case .none:
				break
		}
	}
}
