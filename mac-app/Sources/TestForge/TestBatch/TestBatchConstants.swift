import Foundation

/// Reopening an ended Test Batch (D-184); pausing and resuming one (D-212).
extension TestForgeConstants.TestBatch {
		/// Newest ended batches offered under Reopen Test Batch.
		static let reopenMenuLimit = 8
}

extension TestForgeConstants.Accessibility {
		static let testBatchReopenMenu = "TestForge_TestBatch_ReopenMenu"
		static let testBatchReopenItemPrefix = "TestForge_TestBatch_ReopenItem_"
		static let testBatchReopenConfirmButton = "TestForge_TestBatch_ReopenConfirm"
		static let testBatchPauseItem = "TestForge_TestBatch_PauseItem"
		static let testBatchStartAnotherItem = "TestForge_TestBatch_StartAnotherItem"
		static let testBatchStartNote = "TestForge_TestBatch_StartNote"
		static let testBatchResumeMenu = "TestForge_TestBatch_ResumeMenu"
		static let testBatchResumeItemPrefix = "TestForge_TestBatch_ResumeItem_"
		static let testBatchPausedList = "TestForge_TestBatch_PausedList"
		static let testBatchSheetResumePrefix = "TestForge_TestBatch_SheetResume_"
}
