import CoreGraphics
import Foundation
import Testing
import UniformTypeIdentifiers
@testable import TestForge

private final class RecordingDesktop: DesktopActing {
	private(set) var opened: [URL] = []
	private(set) var revealed: [URL] = []
	private(set) var copiedText: [String] = []

	func open(url: URL) { opened.append(url) }
	func copy(text: String) { copiedText.append(text) }
	func copy(pngData: Data) {}
	func reveal(url: URL) { revealed.append(url) }
	func saveImage(pngData: Data, suggestedFileName: String) async throws -> URL? { nil }
	func saveText(text: String, suggestedFileName: String) async throws -> URL? { nil }
	func chooseSaveLocation(suggestedFileName: String, contentType: UTType) async -> URL? { nil }
	func saveData(_ data: Data, suggestedFileName: String, contentType: UTType) async throws -> URL? { nil }
	func chooseFolder(prompt: String, startingAt startingURL: URL?) async -> URL? { nil }
	func chooseFile(prompt: String, contentTypes: [UTType]) async -> URL? { nil }
}

/// A throwaway folder laid out like a TestForge checkout.
private struct Sandbox {
	let root: URL

	init() throws {
		root = FileManager.default.temporaryDirectory
			.appendingPathComponent("DocsTests-\(UUID().uuidString)", isDirectory: true)
			.standardizedFileURL
		try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
	}

	@discardableResult
	func write(_ path: String, _ text: String) throws -> URL {
		let url = root.appendingPathComponent(path)
		try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
		try text.write(to: url, atomically: true, encoding: .utf8)
		return url.standardizedFileURL
	}

	func remove() {
		try? FileManager.default.removeItem(at: root)
	}
}

private func freshDefaults() -> UserDefaults {
	let name = "DocsTests-\(UUID().uuidString)"
	let defaults = UserDefaults(suiteName: name) ?? .standard
	defaults.removePersistentDomain(forName: name)
	return defaults
}

@MainActor
private func waitUntil(_ condition: @MainActor () -> Bool) async {
	for _ in 0..<200 where !condition() {
		try? await Task.sleep(for: .milliseconds(10))
	}
}

struct DocsCatalogTests {
	@Test func onlyTheReadmeAndGuidesAreListedWithTitles() throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		try sandbox.write("docs/Features.md", "# TestForge Mac app: features\n")
		try sandbox.write("docs/Usage-guide.md", "Intro line\n# TestForge Mac app: usage guide\n")
		try sandbox.write("README.md", "No heading here\n")
		try sandbox.write("docs/README.md", "# Not listed\n")
		try sandbox.write("server/docs/decision.md", "# Not listed\n")

		let entries = DocsCatalog().entries(inRepo: sandbox.root)

		#expect(entries.map(\.subtitle) == ["README.md", "docs/Usage-guide.md", "docs/Features.md"])
		#expect(entries.allSatisfy { $0.group == .guides })
		#expect(entries[0].title == "README")
		#expect(entries[1].title == "TestForge Mac app: usage guide")
	}

	@Test func missingGuidesAreLeftOut() throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		try sandbox.write("docs/Features.md", "# Features\n")
		try sandbox.write("server/docs/usage.md", "# Not listed\n")
		let entries = DocsCatalog().entries(inRepo: sandbox.root)
		#expect(entries.map(\.subtitle) == ["docs/Features.md"])
	}

	@Test func aDroppedFolderAddsItsMarkdownAndSkipsTheRest() throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		let first = try sandbox.write("notes/a.md", "# A")
		let second = try sandbox.write("notes/deep/b.markdown", "# B")
		try sandbox.write("notes/image.png", "")
		let other = try sandbox.write("loose.pdf", "")

		let result = DocsFileCollector().collect([sandbox.root.appendingPathComponent("notes"), other])

		#expect(result.files == [first, second])
		#expect(result.skipped == [other])
	}

	@Test func recentFilesAreNewestFirstWithoutRepeats() {
		let store = DocsRecentStore(defaults: freshDefaults())
		let a = URL(fileURLWithPath: "/tmp/a.md")
		let b = URL(fileURLWithPath: "/tmp/b.md")
		store.add([a])
		store.add([b])
		store.add([a])
		#expect(store.paths == ["/tmp/a.md", "/tmp/b.md"])
		store.remove(a)
		#expect(store.paths == ["/tmp/b.md"])
	}

	@Test func halvesSplitTheVisibleFrame() {
		let visible = CGRect(x: 0, y: 40, width: 1_441, height: 860)
		#expect(DocsWindowLayout.leftHalf.frame(in: visible) == CGRect(x: 0, y: 40, width: 720, height: 860))
		#expect(DocsWindowLayout.rightHalf.frame(in: visible) == CGRect(x: 721, y: 40, width: 720, height: 860))
		#expect(DocsWindowLayout.fullScreen.frame(in: visible) == nil)
	}
}

struct DocsFullLayoutTests {
	private let shown = DocsFullLayout.Saved(sidebar: .all, isConsoleVisible: true)

	@Test func fullOnDocsHidesTheSidebarAndConsoleAndRemembersThem() {
		let change = DocsFullLayout.change(section: .docs, mode: .full, current: shown, saved: nil)
		#expect(change == .enter(shown))
	}

	@Test func leavingDocsPutsThemBack() {
		let hidden = DocsFullLayout.Saved(sidebar: .detailOnly, isConsoleVisible: false)
		let change = DocsFullLayout.change(section: .tests, mode: .full, current: hidden, saved: shown)
		#expect(change == .leave(shown))
	}

	@Test func switchingToHalfPutsThemBack() {
		let change = DocsFullLayout.change(section: .docs, mode: .half, current: shown, saved: shown)
		#expect(change == .leave(shown))
	}

	@Test func otherSectionsAndHalfChangeNothing() {
		#expect(DocsFullLayout.change(section: .docs, mode: .half, current: shown, saved: nil) == .none)
		#expect(DocsFullLayout.change(section: .tests, mode: .full, current: shown, saved: nil) == .none)
		#expect(DocsFullLayout.change(section: .docs, mode: .full, current: shown, saved: shown) == .none)
	}
}

@MainActor
private final class RecordingArranger: DocsWindowArranging {
	var opensAfter: Int
	private(set) var attempts: [DocsWindowLayout] = []

	init(opensAfter: Int) {
		self.opensAfter = opensAfter
	}

	func arrange(_ layout: DocsWindowLayout) -> Bool {
		attempts.append(layout)
		return attempts.count > opensAfter
	}
}

@MainActor
struct DocsViewModelTests {
	private func makeViewModel(
		root: URL?,
		defaults: UserDefaults = freshDefaults(),
		arranger: DocsWindowArranging? = nil
	) -> (DocsViewModel, RecordingDesktop) {
		let desktop = RecordingDesktop()
		let dependencies = DocsDependencies(
			repoRoot: root,
			desktop: desktop,
			defaults: defaults,
			windowArranger: arranger ?? RecordingArranger(opensAfter: 0)
		)
		return (DocsViewModel(dependencies: dependencies), desktop)
	}

	@Test func theWindowIsPlacedOnceItHasOpened() async {
		let arranger = RecordingArranger(opensAfter: 2)
		let (viewModel, _) = makeViewModel(root: nil, arranger: arranger)

		await viewModel.arrangeWindow(.rightHalf)

		#expect(arranger.attempts == [.rightHalf, .rightHalf, .rightHalf])
		#expect(viewModel.windowMessage == nil)
		#expect(viewModel.arrangingLayout == nil)
	}

	@Test func aWindowThatNeverOpensIsReported() async {
		let (viewModel, _) = makeViewModel(root: nil, arranger: RecordingArranger(opensAfter: 1_000))

		await viewModel.arrangeWindow(.fullScreen)

		#expect(viewModel.windowMessage?.contains("didn't open") == true)
	}

	@Test func loadingOpensTheUsageGuideFirst() async throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		try sandbox.write("docs/Usage-guide.md", "# Usage\n## Steps\n")
		try sandbox.write("README.md", "# Readme\n")
		let (viewModel, _) = makeViewModel(root: sandbox.root)

		viewModel.load()
		await waitUntil { viewModel.document != nil }

		#expect(viewModel.document?.entry.subtitle == "docs/Usage-guide.md")
		#expect(viewModel.document?.headings.map(\.anchor) == ["usage", "steps"])
	}

	@Test func droppedFilesJoinYourFilesAndOpen() async throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		let notes = try sandbox.write("elsewhere/notes.md", "# My notes\n")
		let defaults = freshDefaults()
		let (viewModel, _) = makeViewModel(root: nil, defaults: defaults)

		#expect(viewModel.add([notes]))
		await waitUntil { viewModel.document != nil }

		#expect(viewModel.document?.entry.title == "My notes")
		#expect(viewModel.groups.map(\.group) == [.yours])
		#expect(DocsRecentStore(defaults: defaults).paths == [notes.path])
	}

	@Test func aNonMarkdownDropIsRefusedWithAReason() throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		let image = try sandbox.write("shot.png", "")
		let (viewModel, _) = makeViewModel(root: nil)

		#expect(!viewModel.add([image]))
		#expect(viewModel.isNoticeWarning)
		#expect(viewModel.noticeText?.contains("Only Markdown") == true)
	}

	@Test func aRelativeLinkOpensTheOtherFileAtItsAnchorAndBackReturns() async throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		try sandbox.write("docs/Usage-guide.md", "# Usage\nSee [features](Features.md#menus).\n")
		try sandbox.write("docs/Features.md", "# Features\n## Menus\n")
		let (viewModel, _) = makeViewModel(root: sandbox.root)
		viewModel.load()
		await waitUntil { viewModel.document?.entry.subtitle == "docs/Usage-guide.md" }

		_ = viewModel.openLink(try #require(URL(string: "Features.md#menus")))
		await waitUntil { viewModel.document?.entry.subtitle == "docs/Features.md" }

		#expect(viewModel.document?.entry.subtitle == "docs/Features.md")
		#expect(viewModel.scrollTarget == "menus")
		#expect(viewModel.canGoBack)

		viewModel.goBack()
		await waitUntil { viewModel.document?.entry.subtitle == "docs/Usage-guide.md" }
		#expect(viewModel.document?.entry.subtitle == "docs/Usage-guide.md")
	}

	@Test func aLinkToAMissingFileSaysSoAndStays() async throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		try sandbox.write("docs/Usage-guide.md", "# Usage\n")
		let (viewModel, _) = makeViewModel(root: sandbox.root)
		viewModel.load()
		await waitUntil { viewModel.document != nil }

		_ = viewModel.openLink(try #require(URL(string: "Gone.md")))

		#expect(viewModel.noticeText?.contains("Gone.md") == true)
		#expect(viewModel.document?.entry.subtitle == "docs/Usage-guide.md")
	}

	@Test func aLinkToAnotherKindOfFileOpensInItsApp() async throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		try sandbox.write("docs/Usage-guide.md", "# Usage\n")
		let script = try sandbox.write("build-app.command", "echo")
		let (viewModel, desktop) = makeViewModel(root: sandbox.root)
		viewModel.load()
		await waitUntil { viewModel.document != nil }

		_ = viewModel.openLink(try #require(URL(string: "../build-app.command")))

		#expect(desktop.opened == [script])
	}

	@Test func removingYourFileClearsThePage() async throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		let notes = try sandbox.write("notes.md", "# Notes\n")
		let (viewModel, _) = makeViewModel(root: nil)
		viewModel.add([notes])
		await waitUntil { viewModel.document != nil }
		let entry = try #require(viewModel.selectedEntry)

		viewModel.remove(entry)

		#expect(viewModel.entries.isEmpty)
		#expect(viewModel.documentState == .empty)
	}

	@Test func aGuideAskedForBeforeTheListArrivesOpensOnceListed() async throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		try sandbox.write("docs/Usage-guide.md", "# Usage\n")
		try sandbox.write("docs/Features.md", "# Features\n")
		let (viewModel, _) = makeViewModel(root: sandbox.root)

		viewModel.open(repoPath: "docs/Features.md")
		await waitUntil { viewModel.document != nil }

		#expect(viewModel.document?.entry.subtitle == "docs/Features.md")
	}

	@Test func aGuideMissingFromTheCheckoutSaysSo() async throws {
		let sandbox = try Sandbox()
		defer { sandbox.remove() }
		try sandbox.write("README.md", "# Readme\n")
		let (viewModel, _) = makeViewModel(root: sandbox.root)

		viewModel.open(repoPath: "docs/Features.md")
		await waitUntil { viewModel.noticeText != nil }

		#expect(viewModel.noticeText?.contains("docs/Features.md") == true)
	}

	@Test func readingModeAndOutlineAreRemembered() {
		let defaults = freshDefaults()
		let (first, _) = makeViewModel(root: nil, defaults: defaults)
		#expect(first.readingMode == .half)
		first.readingMode = .full
		first.isOutlineShown = false

		let (second, _) = makeViewModel(root: nil, defaults: defaults)
		#expect(second.readingMode == .full)
		#expect(!second.isOutlineShown)
	}
}
