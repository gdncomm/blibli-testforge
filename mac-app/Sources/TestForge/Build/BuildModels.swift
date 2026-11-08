import Foundation

/// `GET /api/build/status`: the prepared code, how it builds, and whether the QA build matches it.
struct BuildStatusSnapshot: Decodable, Equatable {
	let state: String
	let reason: String?
	let isBuilding: Bool
	let jobId: String?
	let preparedCode: PreparedCode?
	let profile: BuildProfile?
	let lastBuild: BuildRecord?

	private enum CodingKeys: String, CodingKey {
		case state
		case reason
		case isBuilding
		case jobId
		case preparedCode = "manifest"
		case profile
		case lastBuild = "last"
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		state = (try? container.decodeIfPresent(String.self, forKey: .state)) ?? "none"
		reason = try? container.decodeIfPresent(String.self, forKey: .reason)
		isBuilding = (try? container.decodeIfPresent(Bool.self, forKey: .isBuilding)) ?? false
		jobId = try? container.decodeIfPresent(String.self, forKey: .jobId)
		preparedCode = try? container.decodeIfPresent(PreparedCode.self, forKey: .preparedCode)
		profile = try? container.decodeIfPresent(BuildProfile.self, forKey: .profile)
		lastBuild = try? container.decodeIfPresent(BuildRecord.self, forKey: .lastBuild)
	}
}

struct PreparedCode: Decodable, Equatable {
	let repo: String
	let branch: String
	let snapshotId: String
	let copyPath: String

	private enum CodingKeys: String, CodingKey {
		case repo
		case branch
		case snapshotId
		case copyPath = "path"
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		repo = (try? container.decodeIfPresent(String.self, forKey: .repo)) ?? ""
		branch = (try? container.decodeIfPresent(String.self, forKey: .branch)) ?? ""
		snapshotId = (try? container.decodeIfPresent(String.self, forKey: .snapshotId)) ?? ""
		copyPath = (try? container.decodeIfPresent(String.self, forKey: .copyPath)) ?? ""
	}
}

struct BuildProfile: Decodable, Equatable {
	let scheme: String
	let configuration: String
	let projectDir: String
	let workspace: String
	let projectSubdir: String

	private enum CodingKeys: String, CodingKey {
		case scheme
		case configuration
		case projectDir
		case workspace
		case projectSubdir
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		scheme = (try? container.decodeIfPresent(String.self, forKey: .scheme)) ?? ""
		configuration = (try? container.decodeIfPresent(String.self, forKey: .configuration)) ?? ""
		projectDir = (try? container.decodeIfPresent(String.self, forKey: .projectDir)) ?? ""
		workspace = (try? container.decodeIfPresent(String.self, forKey: .workspace)) ?? ""
		projectSubdir = (try? container.decodeIfPresent(String.self, forKey: .projectSubdir)) ?? ""
	}
}

struct BuildRecord: Decodable, Equatable {
	let codeId: String
	let status: String
	let endedAt: String?
	let durationMs: Double?
	let derivedData: String?

	private enum CodingKeys: String, CodingKey {
		case codeId
		case status
		case endedAt
		case durationMs
		case derivedData
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		codeId = (try? container.decodeIfPresent(String.self, forKey: .codeId)) ?? ""
		status = (try? container.decodeIfPresent(String.self, forKey: .status)) ?? ""
		endedAt = try? container.decodeIfPresent(String.self, forKey: .endedAt)
		durationMs = try? container.decodeIfPresent(Double.self, forKey: .durationMs)
		derivedData = try? container.decodeIfPresent(String.self, forKey: .derivedData)
	}
}

/// The `jobs` slice: only which jobs run, so a build started from Get ready shows up here too.
struct ActiveJobsState: Decodable, Equatable {
	let jobIds: [String]

	private enum CodingKeys: String, CodingKey {
		case jobs
	}

	private struct Job: Decodable {
		let id: String

		private enum CodingKeys: String, CodingKey {
			case id
		}

		init(from decoder: Decoder) throws {
			let container = try decoder.container(keyedBy: CodingKeys.self)
			id = (try? container.decodeIfPresent(String.self, forKey: .id)) ?? ""
		}
	}

	init(from decoder: Decoder) throws {
		let container = try decoder.container(keyedBy: CodingKeys.self)
		let jobs = (try? container.decodeIfPresent([Job].self, forKey: .jobs)) ?? []
		jobIds = jobs.map(\.id)
	}
}
