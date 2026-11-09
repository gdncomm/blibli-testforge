import CoreGraphics

/// D-199: Prepare code, the run queue, test logins and run popups, moved here from the web UI.
extension TestForgeConstants.Accessibility {
	static let getReadyPrepareCodeButton = "TestForge_GetReady_PrepareCodeButton"
	static let getReadyRunQueueButton = "TestForge_GetReady_RunQueueButton"

	static let prepareCodeSheet = "TestForge_PrepareCode_Sheet"
	static let prepareCodeSource = "TestForge_PrepareCode_Source"
	static let prepareCodeRepository = "TestForge_PrepareCode_Repository"
	static let prepareCodeBranchField = "TestForge_PrepareCode_BranchField"
	static let prepareCodeBranchPrefix = "TestForge_PrepareCode_Branch_"
	static let prepareCodeBranchNote = "TestForge_PrepareCode_BranchNote"
	static let prepareCodeAskGitHub = "TestForge_PrepareCode_AskGitHub"
	static let prepareCodeLocalNote = "TestForge_PrepareCode_LocalNote"
	static let prepareCodeCurrent = "TestForge_PrepareCode_Current"
	static let prepareCodeStart = "TestForge_PrepareCode_Start"
	static let prepareCodeCancel = "TestForge_PrepareCode_Cancel"
	static let prepareCodeDone = "TestForge_PrepareCode_Done"
	static let prepareCodeProgressPrefix = "TestForge_PrepareCode_Progress_"
	static let prepareCodeResult = "TestForge_PrepareCode_Result"

	static let runQueueSheet = "TestForge_RunQueue_Sheet"
	static let runQueueDevice = "TestForge_RunQueue_Device"
	static let runQueueEmpty = "TestForge_RunQueue_Empty"
	static let runQueueClearFinished = "TestForge_RunQueue_ClearFinished"
	static let runQueueDone = "TestForge_RunQueue_Done"
	static let runQueueRowPrefix = "TestForge_RunQueue_Row_"
	static let runQueueMoveUpPrefix = "TestForge_RunQueue_MoveUp_"
	static let runQueueMoveDownPrefix = "TestForge_RunQueue_MoveDown_"
	static let runQueueCancelPrefix = "TestForge_RunQueue_Cancel_"
	static let runQueueRetryPrefix = "TestForge_RunQueue_Retry_"
	static let runQueueMessage = "TestForge_RunQueue_Message"

	static let loginsSettings = "TestForge_Logins_Settings"
	static let loginsRowPrefix = "TestForge_Logins_Row_"
	static let loginsRemovePrefix = "TestForge_Logins_Remove_"
	static let loginsEnvironment = "TestForge_Logins_Environment"
	static let loginsProfile = "TestForge_Logins_Profile"
	static let loginsEmail = "TestForge_Logins_Email"
	static let loginsPassword = "TestForge_Logins_Password"
	static let loginsOtp = "TestForge_Logins_Otp"
	static let loginsSave = "TestForge_Logins_Save"
	static let loginsMessage = "TestForge_Logins_Message"
	static let loginsMailOtp = "TestForge_Logins_MailOtp"
	static let loginsMailLink = "TestForge_Logins_MailLink"
	static let loginsMailUnlink = "TestForge_Logins_MailUnlink"
	static let loginsMailCode = "TestForge_Logins_MailCode"

	static let runPromptSheet = "TestForge_RunPrompt_Sheet"
	static let runPromptInput = "TestForge_RunPrompt_Input"
	static let runPromptDone = "TestForge_RunPrompt_Done"
	static let runPromptSkip = "TestForge_RunPrompt_Skip"
	static let runPromptStop = "TestForge_RunPrompt_Stop"
	static let runPromptShowSimulator = "TestForge_RunPrompt_ShowSimulator"
	static let runPromptMessage = "TestForge_RunPrompt_Message"
}

extension TestForgeConstants.GetReady {
	static let prepareCodeWidth: CGFloat = 620
	static let prepareCodeHeight: CGFloat = 560
	static let runQueueWidth: CGFloat = 600
	static let runQueueHeight: CGFloat = 480
	static let runPromptWidth: CGFloat = 460
	static let branchListMaxHeight: CGFloat = 220
}
