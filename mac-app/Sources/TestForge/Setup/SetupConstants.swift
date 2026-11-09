import Foundation

enum SetupConstants {
	enum Links {
		static let xcode = URL(string: "macappstore://apps.apple.com/app/xcode/id497799835")
		static let node = URL(string: "https://nodejs.org/en/download")
		static let claudeCode = URL(string: "https://docs.anthropic.com/en/docs/claude-code/setup")
	}

	enum Repo {
		static let dashboardPath = "server"
		static let serverScript = "start.sh"
		static let appProjectFolder = "BlibliMobile-iOS"
		static let workspaceExtension = "xcworkspace"
		static let searchDepth = 6
	}

	enum Tools {
		static let shell = "/bin/zsh"
		static let minimumNodeMajor = 18
		static let searchPath = "$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
	}

	enum Layout {
		static let width: CGFloat = 560
		static let statusIconWidth: CGFloat = 18
	}

	enum Accessibility {
		static let screen = "TestForge_Setup"
		static let chooseRepoButton = "TestForge_Setup_ChooseRepo"
		static let recheckButton = "TestForge_Setup_Recheck"
		static let continueButton = "TestForge_Setup_Continue"
		static let toolRowPrefix = "TestForge_Setup_Tool_"
		static let toolFixPrefix = "TestForge_Setup_Fix_"
		static let changeRepoButton = "TestForge_Settings_ChangeRepo"
		static let chooseAppRepoButton = "TestForge_Setup_ChooseAppRepo"
	}
}
