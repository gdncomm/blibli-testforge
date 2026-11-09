import Foundation

/// D-213: identifiers for the inline progress, confirmation and failure lines in Scan, Results, Reports and Advanced.
extension TestForgeConstants.Accessibility {
		static let scanMarkConfirmation = "TestForge_Scan_MarkConfirmation"
		static let flowMapDetailSaveFailure = "TestForge_FlowMap_Detail_SaveFailure"
		static let flowMapStepsSaveFailure = "TestForge_FlowMap_Steps_SaveFailure"
		static let resultsRunActionConfirmation = "TestForge_Results_RunAction_Confirmation"
		static let resultsReviewConfirmation = "TestForge_Results_Review_Confirmation"
		static let overrideFailure = "TestForge_Results_Override_Failure"
		static let fakeDataMasterSwitchProgress = "TestForge_FakeData_MasterSwitch_Progress"
		static let demoLibraryRefreshProgress = "TestForge_DemoLibrary_Refresh_Progress"
		static let sessionExportProgress = "TestForge_SessionReport_Export_Progress"
}

/// D-213: how long a control keeps its "…ing" state while the server's slice catches up with an accepted request.
extension TestForgeConstants {
	enum FeedbackReview {
		static let settlePollNanoseconds: UInt64 = 250_000_000
		static let settlePollAttempts = 40
	}
}
