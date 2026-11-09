import Foundation

/// Reports › Session report (D-176).
enum ReportsConstants {
	enum Accessibility {
		static let modePicker = "TestForge_Reports_ModePicker"
		static let sessionReport = "TestForge_SessionReport"
		static let sessionRefresh = "TestForge_SessionReport_Refresh"
		static let sessionCopy = "TestForge_SessionReport_Copy"
		static let sessionExportMenu = "TestForge_SessionReport_ExportMenu"
		static let sessionExportMarkdown = "TestForge_SessionReport_ExportMarkdown"
		static let sessionExportConfluence = "TestForge_SessionReport_ExportConfluence"
		static let sessionPublish = "TestForge_SessionReport_Publish"
		static let sessionPublishConfirm = "TestForge_SessionReport_PublishConfirm"
		static let sessionNotice = "TestForge_SessionReport_Notice"
		static let batchList = "TestForge_Batches_List"
		static let batchRowPrefix = "TestForge_Batches_Row_"
		static let batchDetail = "TestForge_Batches_Detail"
		static let batchProgress = "TestForge_Batches_Progress"
		static let batchReopen = "TestForge_Batches_Reopen"
		static let batchEnd = "TestForge_Batches_End"
		static let batchPause = "TestForge_Batches_Pause"
		static let batchResume = "TestForge_Batches_Resume"
		static let batchRemove = "TestForge_Batches_Remove"
		static let batchRemoveConfirm = "TestForge_Batches_RemoveConfirm"
		static let batchReveal = "TestForge_Batches_Reveal"
		static let batchRefresh = "TestForge_Batches_Refresh"
		static let batchReport = "TestForge_Batches_Report"
		static let batchReplay = "TestForge_Batches_Replay"
		static let batchReplayConfirm = "TestForge_Batches_ReplayConfirm"
		static let batchComparison = "TestForge_Batches_Comparison"
	}
}

enum ReportsMode: String, CaseIterable, Identifiable {
	case session
	case batches
	case runs
	case demos

	var id: String { rawValue }

	var title: String {
		switch self {
			case .session:
				return String(localized: "Session report")
			case .batches:
				return String(localized: "Batches")
			case .runs:
				return String(localized: "Runs by branch")
			case .demos:
				return String(localized: "Demos")
		}
	}
}
