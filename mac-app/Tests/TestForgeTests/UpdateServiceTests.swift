import Foundation
import Testing
@testable import TestForge

/// Answers each command from a script keyed on a fragment of its arguments, and records what ran.
private final class ScriptedRunner: CommandRunning, @unchecked Sendable {
	private(set) var commands: [String] = []
	private let answers: [(fragment: String, output: CommandOutput)]

	init(_ answers: [(String, CommandOutput)]) {
		self.answers = answers.map { (fragment: $0.0, output: $0.1) }
	}

	func run(_ request: CommandRequest) async throws -> CommandOutput {
		let line = ([request.executable] + request.arguments).joined(separator: " ")
		commands.append(line)
		return answers.first { line.contains($0.fragment) }?.output ?? ok("")
	}
}

private func ok(_ text: String) -> CommandOutput {
	CommandOutput(status: 0, output: text, errorOutput: "")
}

private func failed(_ text: String) -> CommandOutput {
	CommandOutput(status: 1, output: "", errorOutput: text)
}

@Suite("Update state")
struct UpdateStateTests {
	@Test("on master, clean, behind: available")
	func available() {
		#expect(GitAppUpdateService.state(branch: "master", isDirty: false, ahead: 0, behind: 3) == .available(count: 3))
	}

	@Test("on master and level: up to date")
	func upToDate() {
		#expect(GitAppUpdateService.state(branch: "master", isDirty: false, ahead: 0, behind: 0) == .upToDate)
	}

	@Test("another branch is blocked, even when behind")
	func notOnTrunk() {
		#expect(GitAppUpdateService.state(branch: "darshan/feature/x", isDirty: false, ahead: 0, behind: 2) == .blocked(.notOnTrunk(branch: "darshan/feature/x")))
	}

	@Test("local changes block an update that is waiting")
	func localChanges() {
		#expect(GitAppUpdateService.state(branch: "master", isDirty: true, ahead: 0, behind: 1) == .blocked(.localChanges))
	}

	@Test("local changes do not matter when nothing is waiting")
	func dirtyButCurrent() {
		#expect(GitAppUpdateService.state(branch: "master", isDirty: true, ahead: 0, behind: 0) == .upToDate)
	}

	@Test("commits master lacks block a fast-forward")
	func diverged() {
		#expect(GitAppUpdateService.state(branch: "master", isDirty: false, ahead: 1, behind: 1) == .blocked(.diverged))
	}

	@Test("the build log is cut to its last lines")
	func tail() {
		let log = (1...20).map { "line \($0)" }.joined(separator: "\n")
		let cut = GitAppUpdateService.tail(of: log)
		#expect(cut.split(separator: "\n").count == UpdateConstants.errorTailLines)
		#expect(cut.hasSuffix("line 20"))
	}
}

@Suite("GitAppUpdateService")
struct GitAppUpdateServiceTests {
	private let repo = URL(fileURLWithPath: "/tmp/test-forge-repo", isDirectory: true)

	private func behindRunner() -> ScriptedRunner {
		ScriptedRunner([
			("rev-parse --abbrev-ref", ok("master\n")),
			("status --porcelain", ok("")),
			("rev-list --left-right", ok("0\t2\n")),
			("rev-parse --short HEAD", ok("aaa1111\n")),
			("rev-parse --short origin/master", ok("bbb2222\n")),
			("log --format", ok("Second change\nFirst change\n"))
		])
	}

	@Test("no checkout is an error, not a crash")
	func noCheckout() async {
		let service = GitAppUpdateService(runner: ScriptedRunner([]), repo: nil)
		await #expect(throws: UpdateError.self) {
			_ = try await service.checkStatus()
		}
	}

	@Test("a status check reports what is waiting")
	func status() async throws {
		let runner = behindRunner()
		let status = try await GitAppUpdateService(runner: runner, repo: repo).checkStatus()
		#expect(status.state == .available(count: 2))
		#expect(status.currentCommit == "aaa1111")
		#expect(status.latestCommit == "bbb2222")
		#expect(status.incoming == ["Second change", "First change"])
		#expect(runner.commands.first?.contains("fetch") == true)
		#expect(runner.commands.first?.contains("BatchMode=yes") == true)
	}

	@Test("a failed fetch says GitHub could not be reached")
	func fetchFails() async {
		let runner = ScriptedRunner([("fetch", failed("Could not resolve host"))])
		let service = GitAppUpdateService(runner: runner, repo: repo)
		await #expect(throws: UpdateError.self) {
			_ = try await service.checkStatus()
		}
	}

	@Test("update refuses when nothing is waiting and never pulls")
	func nothingToUpdate() async {
		let runner = ScriptedRunner([
			("rev-parse --abbrev-ref", ok("master\n")),
			("rev-list --left-right", ok("0\t0\n"))
		])
		let service = GitAppUpdateService(runner: runner, repo: repo)
		await #expect(throws: UpdateError.self) {
			_ = try await service.update { _ in }
		}
		#expect(!runner.commands.contains { $0.contains("pull") })
	}

	@Test("update pulls fast-forward only, then builds")
	func updateOrder() async throws {
		let runner = behindRunner()
		let service = GitAppUpdateService(runner: runner, repo: repo)
		_ = try? await service.update { _ in }
		let pullIndex = runner.commands.firstIndex { $0.contains("pull --ff-only origin master") }
		let buildIndex = runner.commands.firstIndex { $0.contains("make-app.sh") }
		#expect(pullIndex != nil)
		#expect(buildIndex != nil)
		if let pullIndex, let buildIndex {
			#expect(pullIndex < buildIndex)
		}
	}

	@Test("a failed pull stops before the build")
	func pullFails() async {
		let failing = ScriptedRunner([
			("pull", failed("Not possible to fast-forward")),
			("rev-parse --abbrev-ref", ok("master\n")),
			("status --porcelain", ok("")),
			("rev-list --left-right", ok("0\t1\n")),
			("rev-parse --short", ok("abc1234\n")),
			("log --format", ok("A change\n"))
		])
		let service = GitAppUpdateService(runner: failing, repo: repo)
		await #expect(throws: UpdateError.self) {
			_ = try await service.update { _ in }
		}
		#expect(!failing.commands.contains { $0.contains("make-app.sh") })
	}
}
