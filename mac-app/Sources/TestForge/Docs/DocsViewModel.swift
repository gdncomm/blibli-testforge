import AppKit
import Combine
import Foundation
import SwiftUI

struct DocsDependencies {
	/// The TestForge checkout; nil before Setup or for an install with no checkout, so only your own files list.
	let repoRoot: URL?
	let desktop: DesktopActing
	let defaults: UserDefaults
	let catalog: DocsCatalog
	let collector: DocsFileCollector
	let windowArranger: DocsWindowArranging

	init(
		repoRoot: URL?,
		desktop: DesktopActing,
		defaults: UserDefaults = .standard,
		catalog: DocsCatalog = DocsCatalog(),
		collector: DocsFileCollector = DocsFileCollector(),
		windowArranger: DocsWindowArranging
	) {
		self.repoRoot = repoRoot
		self.desktop = desktop
		self.defaults = defaults
		self.catalog = catalog
		self.collector = collector
		self.windowArranger = windowArranger
	}
}

/// The Docs section and window share this model: the list, the open page, its outline, and how the page uses the window (D-218).
@MainActor
final class DocsViewModel: ObservableObject {
	@Published private(set) var entries: [DocsEntry] = []
	@Published private(set) var isListing = false
	@Published private(set) var selectedId: String?
	@Published private(set) var documentState: DocsDocumentState = .empty
	@Published private(set) var noticeText: String?
	@Published private(set) var isNoticeWarning = false
	@Published private(set) var history: [URL] = []

	/// The layout the Docs window is being moved to, while it opens; nil when idle.
	@Published private(set) var arrangingLayout: DocsWindowLayout?
	@Published private(set) var windowMessage: String?

	/// A heading anchor the page scrolls to; set by the outline and by `file.md#anchor` links.
	@Published var scrollTarget: String?
	@Published var filterText = ""
	@Published var isImporterPresented = false
	@Published var isDropTargeted = false

	@Published var readingMode: DocsReadingMode {
		didSet {
			dependencies.defaults.set(readingMode.rawValue, forKey: DocsConstants.Storage.readingMode)
		}
	}

	@Published var isOutlineShown: Bool {
		didSet {
			dependencies.defaults.set(isOutlineShown, forKey: DocsConstants.Storage.isOutlineShown)
		}
	}

	private let dependencies: DocsDependencies
	private let recents: DocsRecentStore
	private var loadTask: Task<Void, Never>?
	private var listTask: Task<Void, Never>?

	init(dependencies: DocsDependencies) {
		self.dependencies = dependencies
		recents = DocsRecentStore(defaults: dependencies.defaults)
		readingMode = dependencies.defaults.string(forKey: DocsConstants.Storage.readingMode).flatMap(DocsReadingMode.init) ?? .half
		isOutlineShown = dependencies.defaults.object(forKey: DocsConstants.Storage.isOutlineShown) as? Bool ?? true
	}

	var groups: [(group: DocsGroup, entries: [DocsEntry])] {
		let query = filterText.trimmingCharacters(in: .whitespaces)
		let shown = query.isEmpty ? entries : entries.filter { entry in
			entry.title.localizedCaseInsensitiveContains(query) || entry.subtitle.localizedCaseInsensitiveContains(query)
		}
		return DocsGroup.allCases.compactMap { group in
			let inGroup = shown.filter { $0.group == group }
			return inGroup.isEmpty ? nil : (group, inGroup)
		}
	}

	var document: DocsDocument? {
		if case .loaded(let document) = documentState {
			return document
		}
		return nil
	}

	var selectedEntry: DocsEntry? {
		entries.first { $0.id == selectedId }
	}

	var canGoBack: Bool {
		!history.isEmpty
	}

	var isLoading: Bool {
		if case .loading = documentState {
			return true
		}
		return false
	}

	/// Lists the README, the guides and your files, then opens the last page read (or the usage guide).
	func load() {
		listTask?.cancel()
		isListing = true
		let dependencies = dependencies
		let recentPaths = recents.paths
		listTask = Task { [weak self] in
			let entries = await Task.detached(priority: .userInitiated) {
				Self.makeEntries(dependencies: dependencies, recentPaths: recentPaths)
			}.value
			guard !Task.isCancelled else {
				return
			}
			self?.didList(entries)
		}
	}

	func select(_ entry: DocsEntry) {
		guard entry.id != selectedId || !isShowing(entry) else {
			return
		}
		if let current = selectedEntry {
			pushHistory(current.url)
		}
		open(entry)
	}

	/// Opens a checkout file such as `docs/Usage-guide.md`; before the list is read, it opens once the list arrives.
	func open(repoPath path: String) {
		if let entry = entries.first(where: { $0.group != .yours && $0.subtitle == path }) {
			select(entry)
			return
		}
		requestedRepoPath = path
		if !isListing {
			load()
		}
	}

	private var requestedRepoPath: String?

	func reload() {
		load()
		if let entry = selectedEntry {
			open(entry)
		}
	}

	func goBack() {
		guard let previous = history.popLast() else {
			return
		}
		if let entry = entries.first(where: { $0.url == previous }) {
			open(entry)
		} else {
			addAndOpen([previous], recordHistory: false)
		}
	}

	/// Files from a drop or the Open panel: folders add the Markdown inside them; the first file opens.
	@discardableResult
	func add(_ urls: [URL]) -> Bool {
		let result = dependencies.collector.collect(urls)
		guard !result.files.isEmpty else {
			showNotice(String(localized: "Only Markdown files (.md, .markdown, .txt) can be read here."), isWarning: true)
			return false
		}
		addAndOpen(result.files, recordHistory: true)
		let added = String(localized: "Added \(result.files.count) file(s) to Your files.")
		if result.skipped.isEmpty {
			showNotice(added, isWarning: false)
		} else {
			showNotice(added + " " + String(localized: "\(result.skipped.count) other file(s) skipped: not Markdown."), isWarning: true)
		}
		return true
	}

	func importerFinished(_ result: Result<[URL], Error>) {
		switch result {
			case .success(let urls):
				add(urls)
			case .failure(let error):
				showNotice(String(localized: "Couldn't open: \(error.localizedDescription)"), isWarning: true)
		}
	}

	func remove(_ entry: DocsEntry) {
		guard entry.group == .yours else {
			return
		}
		recents.remove(entry.url)
		entries.removeAll { $0.id == entry.id }
		history.removeAll { $0.standardizedFileURL == entry.url }
		if selectedId == entry.id {
			selectedId = nil
			documentState = .empty
			dependencies.defaults.removeObject(forKey: DocsConstants.Storage.selectedPath)
		}
	}

	func jump(to heading: MarkdownHeading) {
		scrollTarget = nil
		scrollTarget = heading.anchor
	}

	func dismissNotice() {
		noticeText = nil
	}

	func reveal() {
		guard let entry = selectedEntry else {
			return
		}
		dependencies.desktop.reveal(url: entry.url)
	}

	func openInDefaultApp() {
		guard let entry = selectedEntry else {
			return
		}
		dependencies.desktop.open(url: entry.url)
	}

	func copyPath() {
		guard let entry = selectedEntry else {
			return
		}
		dependencies.desktop.copy(text: entry.url.path)
		showNotice(String(localized: "Path copied."), isWarning: false)
	}

	/// A link inside the page: another Markdown file opens here, at its `#anchor` if it has one; anything else
	/// goes to the system (web links to the browser, other files to their app).
	func openLink(_ url: URL) -> OpenURLAction.Result {
		guard let target = resolve(url) else {
			return .systemAction
		}
		guard target.isFileURL else {
			return .systemAction(target)
		}
		let file = Self.withoutFragment(target)
		guard FileManager.default.fileExists(atPath: file.path) else {
			showNotice(String(localized: "That link points to \(file.lastPathComponent), which isn't on this Mac."), isWarning: true)
			return .handled
		}
		guard DocsFileKind.isReadable(file) else {
			dependencies.desktop.open(url: file)
			return .handled
		}
		let anchor = target.fragment
		if file == selectedEntry?.url {
			if let anchor {
				scrollTarget = nil
				scrollTarget = anchor
			}
			return .handled
		}
		if let entry = entries.first(where: { $0.url == file }) {
			select(entry)
		} else {
			addAndOpen([file], recordHistory: true)
		}
		pendingAnchor = anchor
		return .handled
	}

	/// The page jumps to this anchor once a linked file has loaded.
	private var pendingAnchor: String?

	/// Places the Docs window once SwiftUI has opened it; it may take a moment to appear after `openWindow`.
	func arrangeWindow(_ layout: DocsWindowLayout) async {
		arrangingLayout = layout
		windowMessage = nil
		defer { arrangingLayout = nil }
		for _ in 0..<DocsConstants.windowLookupAttempts {
			if dependencies.windowArranger.arrange(layout) {
				return
			}
			try? await Task.sleep(for: DocsConstants.windowLookupDelay)
		}
		windowMessage = String(localized: "The Docs window didn't open, so it couldn't be moved. Try again.")
	}

	// MARK: - Loading

	nonisolated static func makeEntries(dependencies: DocsDependencies, recentPaths: [String]) -> [DocsEntry] {
		let fromRepo = dependencies.repoRoot.map { dependencies.catalog.entries(inRepo: $0) } ?? []
		let repoIds = Set(fromRepo.map(\.id))
		let yours = recentPaths
			.map { URL(fileURLWithPath: $0) }
			.filter { FileManager.default.fileExists(atPath: $0.path) }
			.map { dependencies.catalog.entry(forFile: $0) }
			.filter { !repoIds.contains($0.id) }
		return fromRepo + yours
	}

	private func didList(_ listed: [DocsEntry]) {
		isListing = false
		entries = listed
		if let path = requestedRepoPath {
			requestedRepoPath = nil
			if let entry = listed.first(where: { $0.group != .yours && $0.subtitle == path }) {
				select(entry)
				return
			}
			showNotice(String(localized: "\(path) isn't in this TestForge checkout. Update TestForge to get it."), isWarning: true)
		}
		if let entry = selectedEntry {
			if !isShowing(entry) {
				open(entry)
			}
			return
		}
		let savedPath = dependencies.defaults.string(forKey: DocsConstants.Storage.selectedPath)
		if let entry = listed.first(where: { $0.id == savedPath }) ?? listed.first(where: { $0.subtitle == DocsCatalog.usageGuidePath }) ?? listed.first {
			open(entry)
		}
	}

	private func addAndOpen(_ files: [URL], recordHistory: Bool) {
		recents.add(files)
		let known = Set(entries.map(\.id))
		let added = files
			.map { dependencies.catalog.entry(forFile: $0) }
			.filter { !known.contains($0.id) }
		entries.append(contentsOf: added)
		guard let first = files.first.map(\.standardizedFileURL),
			let entry = entries.first(where: { $0.url == first })
		else {
			return
		}
		if recordHistory, let current = selectedEntry, current.id != entry.id {
			pushHistory(current.url)
		}
		open(entry)
	}

	private func open(_ entry: DocsEntry) {
		selectedId = entry.id
		dependencies.defaults.set(entry.id, forKey: DocsConstants.Storage.selectedPath)
		documentState = .loading(entry)
		loadTask?.cancel()
		loadTask = Task { [weak self] in
			let result = await Task.detached(priority: .userInitiated) { Self.read(entry) }.value
			guard !Task.isCancelled else {
				return
			}
			self?.didRead(result, for: entry)
		}
	}

	private func didRead(_ result: Result<DocsDocument, DocsReadError>, for entry: DocsEntry) {
		guard selectedId == entry.id else {
			return
		}
		switch result {
			case .success(let document):
				documentState = .loaded(document)
				scrollTarget = nil
				if let anchor = pendingAnchor {
					pendingAnchor = nil
					scrollTarget = anchor
				}
			case .failure(let error):
				pendingAnchor = nil
				documentState = .failed(entry, error.message)
		}
	}

	nonisolated static func read(_ entry: DocsEntry) -> Result<DocsDocument, DocsReadError> {
		do {
			let data = try Data(contentsOf: entry.url)
			let text = String(decoding: data, as: UTF8.self)
			let blocks = MarkdownParser.parse(text, baseURL: entry.url.deletingLastPathComponent())
			let modified = try? entry.url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate
			return .success(DocsDocument(entry: entry, blocks: blocks, headings: blocks.headings, modified: modified))
		} catch {
			let exists = FileManager.default.fileExists(atPath: entry.url.path)
			let message = exists
				? String(localized: "Couldn't read \(entry.url.lastPathComponent): \(error.localizedDescription)")
				: String(localized: "\(entry.url.lastPathComponent) isn't there any more. It was moved or deleted.")
			return .failure(DocsReadError(message: message))
		}
	}

	private func isShowing(_ entry: DocsEntry) -> Bool {
		switch documentState {
			case .loaded(let document):
				return document.entry.id == entry.id
			case .loading(let loading):
				return loading.id == entry.id
			case .failed, .empty:
				return false
		}
	}

	private func pushHistory(_ url: URL) {
		if history.last != url {
			history.append(url)
		}
		if history.count > DocsConstants.historyLimit {
			history.removeFirst(history.count - DocsConstants.historyLimit)
		}
	}

	private func resolve(_ url: URL) -> URL? {
		if url.scheme != nil {
			return url
		}
		guard let base = selectedEntry?.url else {
			return nil
		}
		return URL(string: url.relativeString, relativeTo: base)?.absoluteURL
	}

	private static func withoutFragment(_ url: URL) -> URL {
		guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
			return url.standardizedFileURL
		}
		components.fragment = nil
		return (components.url ?? url).standardizedFileURL
	}

	private func showNotice(_ text: String, isWarning: Bool) {
		noticeText = text
		isNoticeWarning = isWarning
	}
}

struct DocsReadError: Error, Equatable {
	let message: String
}
