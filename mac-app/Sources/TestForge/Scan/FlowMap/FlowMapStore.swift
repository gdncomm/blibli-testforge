import Foundation

/// Where flow maps live: `~/.test-forge/flows/<local time>/flow.json`, thumbnails beside it.
protocol FlowMapStoring {
	func makeFolder(now: Date) throws -> URL
	func save(map: FlowMap, in folder: URL) throws
	func latest() -> (map: FlowMap, folder: URL)?
}

struct FileFlowMapStore: FlowMapStoring {
	private static let fileName = "flow.json"

	let root: URL

	init(root: URL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".test-forge/flows", isDirectory: true)) {
		self.root = root
	}

	func makeFolder(now: Date) throws -> URL {
		let formatter = DateFormatter()
		formatter.dateFormat = "yyyy-MM-dd_HH-mm-ss"
		let folderName = formatter.string(from: now)
		let folder = root.appendingPathComponent(folderName, isDirectory: true)
		try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
		return folder
	}

	func save(map: FlowMap, in folder: URL) throws {
		let encoder = JSONEncoder()
		encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
		encoder.dateEncodingStrategy = .iso8601
		let data = try encoder.encode(map)
		try data.write(to: folder.appendingPathComponent(Self.fileName), options: .atomic)
	}

	/// The newest saved map, so the Scan screen opens on the last flow after a relaunch.
	func latest() -> (map: FlowMap, folder: URL)? {
		let folders = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
		let decoder = JSONDecoder()
		decoder.dateDecodingStrategy = .iso8601
		for folder in folders.sorted(by: { $0.lastPathComponent > $1.lastPathComponent }) {
			guard let data = try? Data(contentsOf: folder.appendingPathComponent(Self.fileName)),
				let map = try? decoder.decode(FlowMap.self, from: data)
			else {
				continue
			}
			return (map, folder)
		}
		return nil
	}
}
