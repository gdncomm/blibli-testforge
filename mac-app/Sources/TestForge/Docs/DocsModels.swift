import CoreGraphics
import Foundation

/// Where a document in the Docs list comes from (D-218).
enum DocsGroup: String, CaseIterable, Identifiable {
	/// The checkout's README, the usage guide and the feature list.
	case guides

	/// Files someone dropped or opened; kept between launches.
	case yours

	var id: String { rawValue }

	var title: String {
		switch self {
			case .guides:
				return String(localized: "TestForge guides")
			case .yours:
				return String(localized: "Your files")
		}
	}
}

struct DocsEntry: Equatable, Identifiable {
	let url: URL
	let title: String

	/// The path under the checkout, or the folder for a file of yours.
	let subtitle: String
	let group: DocsGroup

	var id: String { url.standardizedFileURL.path }
}

struct DocsDocument: Equatable {
	let entry: DocsEntry
	let blocks: [MarkdownBlockItem]
	let headings: [MarkdownHeading]
	let modified: Date?
}

enum DocsDocumentState: Equatable {
	case empty
	case loading(DocsEntry)
	case loaded(DocsDocument)
	case failed(DocsEntry, String)
}

/// How the Docs section uses the window: list and page side by side, or the page alone.
enum DocsReadingMode: String, CaseIterable, Identifiable {
	case half
	case full

	var id: String { rawValue }

	var title: String {
		switch self {
			case .half:
				return String(localized: "Half")
			case .full:
				return String(localized: "Full")
		}
	}

	var symbolName: String {
		switch self {
			case .half:
				return "rectangle.split.2x1"
			case .full:
				return "rectangle"
		}
	}
}

/// Where the separate Docs window goes on its screen.
enum DocsWindowLayout: String, CaseIterable, Identifiable {
	case leftHalf
	case rightHalf
	case fullScreen

	var id: String { rawValue }

	var title: String {
		switch self {
			case .leftHalf:
				return String(localized: "Left half")
			case .rightHalf:
				return String(localized: "Right half")
			case .fullScreen:
				return String(localized: "Full screen")
		}
	}

	var symbolName: String {
		switch self {
			case .leftHalf:
				return "rectangle.lefthalf.filled"
			case .rightHalf:
				return "rectangle.righthalf.filled"
			case .fullScreen:
				return "arrow.up.left.and.arrow.down.right"
		}
	}

	/// The window frame for a half; nil for full screen, which is the system's own mode.
	func frame(in visibleFrame: CGRect) -> CGRect? {
		let width = (visibleFrame.width / 2).rounded(.down)
		switch self {
			case .leftHalf:
				return CGRect(x: visibleFrame.minX, y: visibleFrame.minY, width: width, height: visibleFrame.height)
			case .rightHalf:
				return CGRect(x: visibleFrame.maxX - width, y: visibleFrame.minY, width: width, height: visibleFrame.height)
			case .fullScreen:
				return nil
		}
	}
}

enum DocsFileKind {
	static let markdownExtensions: Set<String> = ["md", "markdown", "mdown", "mkd", "txt"]

	static func isReadable(_ url: URL) -> Bool {
		markdownExtensions.contains(url.pathExtension.lowercased())
	}
}
