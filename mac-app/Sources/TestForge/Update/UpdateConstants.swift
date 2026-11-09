import Foundation

enum UpdateConstants {
	static let gitPath = "/usr/bin/git"
	static let shellPath = "/bin/zsh"
	static let trunkBranch = "master"
	static let remoteName = "origin"
	static let incomingLimit = 5
	static let builtAppPath = "mac-app/build/TestForge.app"
	static let buildScript = "cd \"$1/mac-app\" && ./scripts/make-app.sh"
	static let errorTailLines = 6

	/// Never wait on an SSH passphrase prompt nobody can see.
	static let batchSSH = "core.sshCommand=ssh -o BatchMode=yes"

	enum Accessibility {
		static let menuItem = "TestForge_Update_MenuItem"
		static let section = "TestForge_Update_Section"
		static let statusText = "TestForge_Update_Status"
		static let incomingList = "TestForge_Update_Incoming"
		static let incomingRowPrefix = "TestForge_Update_Incoming_"
		static let checkButton = "TestForge_Update_Check"
		static let updateButton = "TestForge_Update_Apply"
		static let progressText = "TestForge_Update_Progress"
		static let failureText = "TestForge_Update_Failure"
		static let hintText = "TestForge_Update_Hint"
	}
}
