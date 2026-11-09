import Foundation

/// Follows the dashboard's `.data/dashboard.log` from its current end into the console.
/// The server writes to that file rather than a pipe, so it survives the app quitting mid-run.
final class ServerLogTailer {
	private let logURL: URL
	private let fileManager: FileManager
	private weak var console: ConsoleLogging?
	private let queue = DispatchQueue(label: "test-forge.log-tailer")
	private var fileHandle: FileHandle?
	private var watchSource: DispatchSourceFileSystemObject?
	private var pendingFragment = ""

	init(logURL: URL, console: ConsoleLogging, fileManager: FileManager = .default) {
		self.logURL = logURL
		self.console = console
		self.fileManager = fileManager
	}

	deinit {
		stop()
	}

	func start() {
		queue.async { [weak self] in
			self?.openAndWatch()
		}
	}

	func stop() {
		watchSource?.cancel()
		watchSource = nil
	}

	private func openAndWatch() {
		guard watchSource == nil else {
			return
		}
		// A fresh checkout has no `.data/` yet; without it the first launch's npm install output would be lost.
		let dataDirectory = logURL.deletingLastPathComponent()
		try? fileManager.createDirectory(at: dataDirectory, withIntermediateDirectories: true)
		if !fileManager.fileExists(atPath: logURL.path) {
			fileManager.createFile(atPath: logURL.path, contents: nil)
		}
		guard let handle = try? FileHandle(forReadingFrom: logURL) else {
			console?.append(text: "can't read \(logURL.path)", source: .app)
			return
		}
		_ = try? handle.seekToEnd()
		fileHandle = handle
		let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: handle.fileDescriptor, eventMask: [.extend, .write], queue: queue)
		source.setEventHandler { [weak self] in
			self?.readNewLines()
		}
		source.setCancelHandler { [weak self] in
			try? self?.fileHandle?.close()
			self?.fileHandle = nil
		}
		watchSource = source
		source.resume()
	}

	private func readNewLines() {
		guard let data = try? fileHandle?.readToEnd(),
			!data.isEmpty
		else {
			return
		}
		let text = pendingFragment + String(decoding: data, as: UTF8.self)
		var lines = text.components(separatedBy: "\n")
		pendingFragment = lines.removeLast()
		for line in lines where !line.isEmpty {
			console?.append(text: line, source: .server)
		}
	}
}
