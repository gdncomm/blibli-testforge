import Foundation

/// The documents the Docs section lists from the TestForge checkout (D-218, D-219). Only the README and the two
/// guides are listed; other repo docs open in place from their links. Files that are missing are left out.
struct DocsCatalog {
	static let readmePath = "README.md"
	static let usageGuidePath = "docs/Usage-guide.md"
	static let featuresPath = "docs/Features.md"

	/// The listed guides, in the order they are listed.
	static let guidePaths = [readmePath, usageGuidePath, featuresPath]

	private let fileManager: FileManager

	init(fileManager: FileManager = .default) {
		self.fileManager = fileManager
	}

	func entries(inRepo root: URL) -> [DocsEntry] {
		Self.guidePaths.compactMap { entry(at: $0, in: root, group: .guides) }
	}

	/// A file's title: its first `# ` heading, else its name without the extension.
	func title(of url: URL) -> String {
		if let handle = try? FileHandle(forReadingFrom: url) {
			defer { try? handle.close() }
			let head = (try? handle.read(upToCount: DocsConstants.titleProbeBytes)) ?? Data()
			let text = String(decoding: head, as: UTF8.self)
			for line in text.split(separator: "\n", omittingEmptySubsequences: true).prefix(DocsConstants.titleProbeLines) {
				let trimmed = line.trimmingCharacters(in: .whitespaces)
				if trimmed.hasPrefix("# ") {
					return MarkdownAnchor.plainText(of: String(trimmed.dropFirst(2)))
				}
			}
		}
		return url.deletingPathExtension().lastPathComponent
	}

	func entry(forFile url: URL) -> DocsEntry {
		let standardized = url.standardizedFileURL
		return DocsEntry(
			url: standardized,
			title: title(of: standardized),
			subtitle: (standardized.deletingLastPathComponent().path as NSString).abbreviatingWithTildeInPath,
			group: .yours
		)
	}

	private func entry(at path: String, in root: URL, group: DocsGroup) -> DocsEntry? {
		let url = root.appendingPathComponent(path).standardizedFileURL
		guard fileManager.fileExists(atPath: url.path) else {
			return nil
		}
		return DocsEntry(url: url, title: title(of: url), subtitle: path, group: group)
	}
}

/// Expands a drop or an Open panel choice into readable files: a folder adds the Markdown inside it.
struct DocsFileCollector {
	private let fileManager: FileManager

	init(fileManager: FileManager = .default) {
		self.fileManager = fileManager
	}

	struct Result: Equatable {
		var files: [URL] = []
		var skipped: [URL] = []
	}

	func collect(_ urls: [URL]) -> Result {
		var result = Result()
		for url in urls {
			var isDirectory: ObjCBool = false
			guard fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) else {
				result.skipped.append(url)
				continue
			}
			if isDirectory.boolValue {
				result.files += markdownFiles(in: url)
			} else if DocsFileKind.isReadable(url) {
				result.files.append(url.standardizedFileURL)
			} else {
				result.skipped.append(url)
			}
		}
		return result
	}

	private func markdownFiles(in folder: URL) -> [URL] {
		guard let enumerator = fileManager.enumerator(
			at: folder,
			includingPropertiesForKeys: [.isRegularFileKey],
			options: [.skipsHiddenFiles, .skipsPackageDescendants]
		) else {
			return []
		}
		var files: [URL] = []
		for case let url as URL in enumerator {
			if enumerator.level > DocsConstants.folderDepth {
				enumerator.skipDescendants()
				continue
			}
			if DocsFileKind.isReadable(url), url.pathExtension.lowercased() != "txt" {
				files.append(url.standardizedFileURL)
			}
			if files.count >= DocsConstants.folderFileLimit {
				break
			}
		}
		return files.sorted { $0.path.localizedStandardCompare($1.path) == .orderedAscending }
	}
}

/// The files someone opened, newest first, kept in the app's defaults.
struct DocsRecentStore {
	private let defaults: UserDefaults

	init(defaults: UserDefaults = .standard) {
		self.defaults = defaults
	}

	var paths: [String] {
		defaults.stringArray(forKey: DocsConstants.Storage.recentFiles) ?? []
	}

	func add(_ urls: [URL]) {
		let added = urls.map(\.standardizedFileURL.path)
		var kept = added
		for path in paths where !added.contains(path) {
			kept.append(path)
		}
		defaults.set(Array(kept.prefix(DocsConstants.recentLimit)), forKey: DocsConstants.Storage.recentFiles)
	}

	func remove(_ url: URL) {
		let path = url.standardizedFileURL.path
		defaults.set(paths.filter { $0 != path }, forKey: DocsConstants.Storage.recentFiles)
	}
}
