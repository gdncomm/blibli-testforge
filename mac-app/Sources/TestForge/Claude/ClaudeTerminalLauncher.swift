import AppKit

protocol TerminalLaunching {
	/// Runs `command` in a new window of the Mac's terminal app (D-222).
	func run(command: String, name: String) throws
}

/// Writes a one-off `.command` script and opens it: macOS runs it in the default terminal app (Terminal, or iTerm when
/// it is the handler). A login shell, so `claude` is on PATH as in any window the person opens; the script deletes
/// itself first, so nothing is left behind.
struct ClaudeTerminalLauncher: TerminalLaunching {
	private let fileManager: FileManager
	private let workspace: NSWorkspace

	init(fileManager: FileManager = .default, workspace: NSWorkspace = .shared) {
		self.fileManager = fileManager
		self.workspace = workspace
	}

	func run(command: String, name: String) throws {
		let folder = fileManager.temporaryDirectory.appendingPathComponent("TestForge-terminal", isDirectory: true)
		try fileManager.createDirectory(at: folder, withIntermediateDirectories: true)
		let script = folder.appendingPathComponent("\(name).command")
		try Self.script(command: command).write(to: script, atomically: true, encoding: .utf8)
		try fileManager.setAttributes([.posixPermissions: 0o755], ofItemAtPath: script.path)
		guard workspace.open(script) else {
			throw CocoaError(.fileReadUnknown, userInfo: [NSLocalizedDescriptionKey: String(localized: "macOS didn't open a terminal for the script")])
		}
	}

	static func script(command: String) -> String {
		"#!/bin/zsh -l\nrm -f -- \"$0\"\n\(command)\n"
	}
}
