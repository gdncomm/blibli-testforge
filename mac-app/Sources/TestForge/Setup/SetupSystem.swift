import AppKit

protocol AppRelaunching {
	/// Opens a fresh copy of this app, then quits this one, so the new repo folder is read at launch.
	@MainActor
	func relaunch()

	/// Opens a fresh copy of the app at `url` (a rebuilt bundle), then quits this one.
	@MainActor
	func relaunch(at url: URL)
}

protocol ClaudeSignInOpening {
	/// `claude auth login` asks questions in a terminal, so it opens in Terminal once; everything after stays in the app.
	func openClaudeSignIn() throws
}

struct SetupSystem: AppRelaunching, ClaudeSignInOpening {
	private let workspace: NSWorkspace
	private let application: NSApplication
	private let fileManager: FileManager

	init(workspace: NSWorkspace = .shared, application: NSApplication = .shared, fileManager: FileManager = .default) {
		self.workspace = workspace
		self.application = application
		self.fileManager = fileManager
	}

	@MainActor
	func relaunch() {
		relaunch(at: Bundle.main.bundleURL)
	}

	@MainActor
	func relaunch(at url: URL) {
		let configuration = NSWorkspace.OpenConfiguration()
		configuration.createsNewApplicationInstance = true
		let application = application
		workspace.openApplication(at: url, configuration: configuration) { _, _ in
			DispatchQueue.main.async {
				application.terminate(nil)
			}
		}
	}

	func openClaudeSignIn() throws {
		let scriptURL = fileManager.temporaryDirectory.appendingPathComponent("test-forge-claude-sign-in.command")
		let script = """
		#!/bin/zsh -l
		export PATH="\(SetupConstants.Tools.searchPath)"
		claude auth login
		echo
		echo "Done — go back to TestForge and press Check again."
		"""
		try script.write(to: scriptURL, atomically: true, encoding: .utf8)
		try fileManager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptURL.path)
		workspace.open(scriptURL)
	}
}
