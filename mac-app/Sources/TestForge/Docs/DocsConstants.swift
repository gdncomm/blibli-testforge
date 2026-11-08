import CoreGraphics
import Foundation

/// The Docs section and window (D-218).
enum DocsConstants {
	static let windowId = "docs"
	static let listWidth: CGFloat = 260
	static let listMinWidth: CGFloat = 200
	static let outlineWidth: CGFloat = 220
	static let outlineIndent: CGFloat = 12
	static let pageMinWidth: CGFloat = 360
	static let windowMinWidth: CGFloat = 480
	static let windowMinHeight: CGFloat = 400
	static let dropCornerRadius: CGFloat = 10
	static let dropBorderWidth: CGFloat = 2
	static let dropBackgroundOpacity: Double = 0.08

	static let recentLimit = 30
	static let folderDepth = 3
	static let folderFileLimit = 200
	static let titleProbeBytes = 4_096
	static let titleProbeLines = 20
	static let historyLimit = 50

	/// Tries to find the Docs window after asking SwiftUI to open it, before giving up on arranging it.
	static let windowLookupAttempts = 10
	static let windowLookupDelay: Duration = .milliseconds(100)

	enum Storage {
		static let recentFiles = "docs.recentFiles"
		static let selectedPath = "docs.selectedPath"
		static let readingMode = "docs.readingMode"
		static let isOutlineShown = "docs.isOutlineShown"
	}

	enum Accessibility {
		static let section = "QAW_Docs_Section"
		static let list = "QAW_Docs_List"
		static let listFilter = "QAW_Docs_ListFilter"
		static let groupPrefix = "QAW_Docs_Group_"
		static let rowPrefix = "QAW_Docs_Row_"
		static let rowTitlePrefix = "QAW_Docs_RowTitle_"
		static let rowSubtitlePrefix = "QAW_Docs_RowSubtitle_"
		static let rowRemovePrefix = "QAW_Docs_RowRemove_"
		static let openButton = "QAW_Docs_OpenButton"
		static let reloadButton = "QAW_Docs_ReloadButton"
		static let dropZone = "QAW_Docs_DropZone"
		static let dropOverlay = "QAW_Docs_DropOverlay"
		static let notice = "QAW_Docs_Notice"
		static let page = "QAW_Docs_Page"
		static let pageHeader = "QAW_Docs_PageHeader"
		static let pageTitle = "QAW_Docs_PageTitle"
		static let pagePath = "QAW_Docs_PagePath"
		static let pageEmpty = "QAW_Docs_PageEmpty"
		static let pageLoading = "QAW_Docs_PageLoading"
		static let pageFailed = "QAW_Docs_PageFailed"
		static let backButton = "QAW_Docs_BackButton"
		static let modePicker = "QAW_Docs_ModePicker"
		static let outlineToggle = "QAW_Docs_OutlineToggle"
		static let outline = "QAW_Docs_Outline"
		static let outlineRowPrefix = "QAW_Docs_OutlineRow_"
		static let windowButton = "QAW_Docs_WindowButton"
		static let windowMenuPrefix = "QAW_Docs_WindowMenu_"
		static let moreMenu = "QAW_Docs_MoreMenu"
		static let revealButton = "QAW_Docs_RevealButton"
		static let openDefaultButton = "QAW_Docs_OpenDefaultButton"
		static let copyPathButton = "QAW_Docs_CopyPathButton"
		static let window = "QAW_Docs_Window"
		static let windowLayoutPrefix = "QAW_Docs_WindowLayout_"
		static let windowLayoutStatus = "QAW_Docs_WindowLayoutStatus"
		static let openMenuItem = "QAW_Docs_OpenMenuItem"
	}
}
