import Foundation

/// D-213: progress and result lines beside the Network, Simulator, Claude, Remote Control and Build controls that started the work.
extension TestForgeConstants.Accessibility {
		static let buildStopFailure = "TestForge_Build_StopFailure"
		static let buildRefreshProgress = "TestForge_Build_RefreshProgress"
		static let networkResetFailure = "TestForge_Network_ResetFailure"
		static let networkScenarioFailure = "TestForge_Network_ScenarioFailure"
		static let networkScenarioProgress = "TestForge_Network_ScenarioProgress"
		static let networkCallActionResult = "TestForge_Network_CallActionResult"
		static let networkBreakpointRemovingPrefix = "TestForge_Network_BreakpointRemoving_"
		static let networkBreakpointFailure = "TestForge_Network_BreakpointFailure"
		static let networkBubbleProgress = "TestForge_Network_BubbleProgress"
		static let networkTrackerReportProgress = "TestForge_Network_TrackerReportProgress"
		static let networkTrackerReportMenu = "TestForge_Network_TrackerReportMenu"
		static let networkTrackerReportResult = "TestForge_Network_TrackerReportResult"
		static let simulatorCardProgressPrefix = "TestForge_SimulatorControl_CardProgress_"
		static let simulatorCardResultPrefix = "TestForge_SimulatorControl_CardResult_"
		static let simulatorTestDeviceError = "TestForge_SimulatorControl_TestDeviceError"
		static let claudeStopFailure = "TestForge_Claude_StopFailure"
		static let claudeApprovalFailure = "TestForge_Claude_ApprovalFailure"
		static let claudeQuestionFailure = "TestForge_Claude_QuestionFailure"
		static let remoteControlFailure = "TestForge_RemoteControl_Failure"
}
