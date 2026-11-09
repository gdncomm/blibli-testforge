import Foundation
import UniformTypeIdentifiers

enum SessionReportState: Equatable {
	case loading
	case loaded([MarkdownBlockItem])
	case failed(message: String)
}

enum SessionReportAction: Equatable {
	case refresh
	case exportMarkdown
	case exportConfluence
	case publish

	var isExport: Bool {
		self == .exportMarkdown || self == .exportConfluence
	}
}

/// Reports › Session report (D-176): the loaded document's report rendered in the app, exported as Markdown or
/// Confluence HTML, or published to the personal Confluence page after a confirm.
@MainActor
final class SessionReportViewModel: ObservableObject {
	@Published private(set) var state: SessionReportState = .loading
	@Published private(set) var noticeText: String?
	@Published var actionMessage: String?
	@Published private(set) var runningAction: SessionReportAction?
	@Published var isPublishConfirmationPresented = false

	private let service: SessionReporting
	private let desktop: DesktopActing
	private var markdown = ""

	init(service: SessionReporting, desktop: DesktopActing) {
		self.service = service
		self.desktop = desktop
	}

	var canShare: Bool {
		!markdown.isEmpty && runningAction == nil
	}

	var isExporting: Bool {
		runningAction?.isExport == true
	}

	func isRunning(_ action: SessionReportAction) -> Bool {
		runningAction == action
	}

	/// Refresh shows on its own button while a report is already on screen; the old "Saved…" notice is cleared.
	func load() {
		guard runningAction == nil else {
			return
		}
		if markdown.isEmpty {
			state = .loading
		}
		noticeText = nil
		runningAction = .refresh
		let service = service
		Task { [weak self] in
			do {
				let text = try await service.markdown()
				let blocks = await Task.detached(priority: .userInitiated) { MarkdownParser.parse(text) }.value
				self?.markdown = text
				self?.state = .loaded(blocks)
			} catch {
				self?.state = .failed(message: error.localizedDescription)
			}
			self?.runningAction = nil
		}
	}

	func exportMarkdown() {
		let text = markdown
		perform(.exportMarkdown) { [weak self] in
			guard let self,
				let url = try await desktop.saveText(text: text, suggestedFileName: Self.fileName(extension: "md"))
			else {
				return
			}
			noticeText = String(localized: "Saved to \(url.path)")
		}
	}

	func exportConfluence() {
		perform(.exportConfluence) { [weak self] in
			guard let self else {
				return
			}
			let html = try await service.confluenceHTML()
			let data = Data(Self.confluenceFile(body: html).utf8)
			guard let url = try await desktop.saveData(data, suggestedFileName: Self.fileName(extension: "html"), contentType: .html) else {
				return
			}
			noticeText = String(localized: "Saved to \(url.path). Open it in a browser, select all and paste into a Confluence page.")
		}
	}

	func copyMarkdown() {
		desktop.copy(text: markdown)
		noticeText = String(localized: "Report copied as Markdown.")
	}

	func confirmPublish() {
		isPublishConfirmationPresented = false
		perform(.publish) { [weak self] in
			guard let self else {
				return
			}
			let title = try await service.publish()
			noticeText = String(localized: "Publishing “\(title)” is queued. Claude creates the page under your personal page; follow it in Claude.")
		}
	}

	func dismissMessage() {
		actionMessage = nil
	}

	/// One request at a time, so a second click can't start the same export or publish twice.
	private func perform(_ action: SessionReportAction, operation: @escaping () async throws -> Void) {
		guard runningAction == nil else {
			return
		}
		noticeText = nil
		runningAction = action
		Task { [weak self] in
			do {
				try await operation()
			} catch {
				self?.actionMessage = error.localizedDescription
			}
			self?.runningAction = nil
		}
	}

	private static func fileName(extension fileExtension: String) -> String {
		let date = Date().formatted(.iso8601.year().month().day())
		return "test-forge-session-report-\(date).\(fileExtension)"
	}

	/// A standalone page, so a browser shows it and copy-paste into Confluence keeps the tables.
	private static func confluenceFile(body: String) -> String {
		"""
		<!doctype html>
		<html><head><meta charset="utf-8"><title>QA session report</title></head>
		<body>
		\(body)
		</body></html>
		"""
	}
}
