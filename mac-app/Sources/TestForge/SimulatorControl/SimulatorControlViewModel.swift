import Combine
import Foundation

enum SimulatorDevicesState: Equatable {
	case loading
	case loaded([SimulatorDevice])
	case failed(message: String)
}

/// D-213: which button's work runs, so its own card shows the progress and the result.
enum SimulatorAction: Hashable {
	case boot
	case shutdown
	case showSimulator
	case useForTests
	case relaunchApp
	case killApp
	case readDefault
	case writeDefault
	case deleteDefault
	case resetPrivacy
	case resetKeychain
	case erase
}

struct SimulatorActionResult: Equatable {
	let title: String
	let message: String
	let isSuccess: Bool
	var action: SimulatorAction?
}

struct SimulatorControlDependencies {
	let service: SimulatorControlling
	let store: StateStore
	let desktop: DesktopActing
	let testDevice: TestDeviceActing
	let deeplinks: DeeplinkProviding
}

/// The Simulator screen: device, display, app, saved settings and reset, each a plain simctl call.
/// Everything is locked while a test or scan holds the phone, so a button can't disturb a run.
@MainActor
final class SimulatorControlViewModel: ObservableObject {
	static let defaultBundleId = "com.blibli.mobile"

	@Published private(set) var devicesState: SimulatorDevicesState = .loading
	@Published var selectedUDID: String? {
		didSet {
			refreshBlendedLayers()
		}
	}

	/// Nil until read; Color Blended Layers is read from CoreSimulator, not simctl.
	@Published private(set) var isBlendedLayersOn: Bool?

	@Published var bundleId = SimulatorControlViewModel.defaultBundleId
	@Published var defaultKey = ""
	@Published var defaultType: UserDefaultValueType = .string
	@Published var defaultValue = ""
	@Published var isEraseConfirmationShown = false
	@Published private(set) var runningActionTitle: String?
	@Published private(set) var runningAction: SimulatorAction?
	@Published private(set) var isRefreshingDevices = false

	/// Why the server couldn't say which simulator tests use; the list still loads without it.
	@Published private(set) var testDeviceError: String?
	@Published private(set) var lastResult: SimulatorActionResult?
	@Published private(set) var isLocked = false

	/// The simulator tests run on (D-120); nil until the server answers.
	@Published private(set) var testDevice: TestDevice?

	/// The Deeplinks card's own view model; this page builds it and hands it to the card.
	let deeplinksViewModel: DeeplinksSectionViewModel
	let physicalDevicesViewModel: PhysicalDevicesViewModel

	private let dependencies: SimulatorControlDependencies
	private var actionTask: Task<Void, Never>?
	private var loadTask: Task<Void, Never>?
	private var cancellables = Set<AnyCancellable>()

	init(dependencies: SimulatorControlDependencies) {
		self.dependencies = dependencies
		deeplinksViewModel = DeeplinksSectionViewModel(service: dependencies.deeplinks, store: dependencies.store)
		physicalDevicesViewModel = PhysicalDevicesViewModel(service: dependencies.testDevice)
		observeLock()
	}

	deinit {
		actionTask?.cancel()
		loadTask?.cancel()
	}

	var selectedDevice: SimulatorDevice? {
		guard case .loaded(let devices) = devicesState else {
			return nil
		}
		return devices.first { $0.id == selectedUDID }
	}

	var canAct: Bool {
		!isLocked && runningActionTitle == nil && selectedUDID != nil
	}

	var isSelectedTestDevice: Bool {
		selectedUDID != nil && selectedUDID == testDevice?.udid
	}

	/// "Back to the QA clone" only makes sense while another simulator was chosen for tests.
	var canUseTestForgeCloneForTests: Bool {
		isSelectedTestDevice && testDevice?.isChosen == true
	}

	func isTestDevice(udid: String) -> Bool {
		udid == testDevice?.udid
	}

	/// Opens on the simulator tests use (asked from the server, not the test runner), else the first booted one.
	func loadDevices() {
		loadTask?.cancel()
		isRefreshingDevices = true
		let service = dependencies.service
		let testDeviceService = dependencies.testDevice
		loadTask = Task { [weak self] in
			do {
				let devices = try await service.devices()
				let current = await self?.currentTestDevice(service: testDeviceService)
				self?.testDevice = current
				self?.didLoad(devices: devices, preferredUDID: current?.udid)
			} catch {
				self?.devicesState = .failed(message: error.localizedDescription)
			}
			if !Task.isCancelled {
				self?.isRefreshingDevices = false
			}
		}
	}

	func useSelectedForTests() {
		guard let udid = selectedUDID else {
			return
		}
		changeTestDevice(to: udid)
	}

	func useTestForgeCloneForTests() {
		changeTestDevice(to: nil)
	}

	func setBlendedLayers(isOn: Bool) {
		guard let udid = selectedUDID,
			canAct
		else {
			return
		}
		do {
			try dependencies.service.setBlendedLayers(udid: udid, isOn: isOn)
			isBlendedLayersOn = isOn
			let state = isOn ? String(localized: "on") : String(localized: "off")
			lastResult = SimulatorActionResult(title: String(localized: "Color Blended Layers"), message: state, isSuccess: true)
		} catch {
			lastResult = SimulatorActionResult(title: String(localized: "Color Blended Layers"), message: error.localizedDescription, isSuccess: false)
		}
	}

	func boot() {
		perform(action: .boot, title: String(localized: "Boot")) { service, udid in
			try await service.boot(udid: udid)
		}
	}

	func shutdown() {
		perform(action: .shutdown, title: String(localized: "Shut down")) { service, udid in
			try await service.shutdown(udid: udid)
		}
	}

	func showSimulatorApp() {
		perform(action: .showSimulator, title: String(localized: "Show Simulator")) { service, _ in
			try await service.showSimulatorApp()
		}
	}

	func copySelectedUDID() {
		guard let udid = selectedUDID else {
			return
		}
		dependencies.desktop.copy(text: udid)
		lastResult = SimulatorActionResult(title: String(localized: "Copy UDID"), message: udid, isSuccess: true)
	}

	func relaunchApp() {
		let bundleId = trimmedBundleId
		perform(action: .relaunchApp, title: String(localized: "Relaunch app")) { service, udid in
			try await service.launch(udid: udid, bundleId: bundleId)
		}
	}

	func killApp() {
		let bundleId = trimmedBundleId
		perform(action: .killApp, title: String(localized: "Kill app")) { service, udid in
			try await service.terminate(udid: udid, bundleId: bundleId)
		}
	}

	func readDefault() {
		let bundleId = trimmedBundleId
		let key = defaultKey.trimmingCharacters(in: .whitespaces)
		perform(action: .readDefault, title: String(localized: "Read \(key)")) { service, udid in
			try await service.readDefault(udid: udid, bundleId: bundleId, key: key)
		}
	}

	/// The app reads its settings at launch, so a write is followed by a relaunch.
	func writeDefaultAndRelaunch() {
		let entry = UserDefaultEntry(
			bundleId: trimmedBundleId,
			key: defaultKey.trimmingCharacters(in: .whitespaces),
			type: defaultType,
			value: defaultValue
		)
		perform(action: .writeDefault, title: String(localized: "Write \(entry.key) and relaunch")) { service, udid in
			let written = try await service.writeDefault(udid: udid, entry: entry)
			guard written.isSuccess else {
				return written
			}
			return try await service.launch(udid: udid, bundleId: entry.bundleId)
		}
	}

	func deleteDefault() {
		let bundleId = trimmedBundleId
		let key = defaultKey.trimmingCharacters(in: .whitespaces)
		perform(action: .deleteDefault, title: String(localized: "Delete \(key)")) { service, udid in
			try await service.deleteDefault(udid: udid, bundleId: bundleId, key: key)
		}
	}

	func resetPrivacy() {
		let bundleId = trimmedBundleId
		perform(action: .resetPrivacy, title: String(localized: "Reset permissions")) { service, udid in
			try await service.resetPrivacy(udid: udid, bundleId: bundleId)
		}
	}

	func resetKeychain() {
		perform(action: .resetKeychain, title: String(localized: "Reset keychain")) { service, udid in
			try await service.resetKeychain(udid: udid)
		}
	}

	func confirmErase() {
		perform(action: .erase, title: String(localized: "Erase device")) { service, udid in
			try await service.erase(udid: udid)
		}
	}

	var hasDefaultKey: Bool {
		!defaultKey.trimmingCharacters(in: .whitespaces).isEmpty
	}

	private var trimmedBundleId: String {
		let trimmed = bundleId.trimmingCharacters(in: .whitespaces)
		return trimmed.isEmpty ? Self.defaultBundleId : trimmed
	}

	private func perform(
		action: SimulatorAction,
		title: String,
		operation: @escaping (SimulatorControlling, String) async throws -> CommandOutput
	) {
		guard let udid = selectedUDID,
			canAct
		else {
			return
		}
		runningActionTitle = title
		runningAction = action
		let service = dependencies.service
		actionTask = Task { [weak self] in
			let result: SimulatorActionResult
			do {
				let output = try await operation(service, udid)
				let message = output.summary.isEmpty ? String(localized: "Done") : output.summary
				result = SimulatorActionResult(title: title, message: message, isSuccess: output.isSuccess, action: action)
			} catch {
				result = SimulatorActionResult(title: title, message: error.localizedDescription, isSuccess: false, action: action)
			}
			self?.finish(result: result)
		}
	}

	private func currentTestDevice(service: TestDeviceActing) async -> TestDevice? {
		do {
			let current = try await service.current()
			testDeviceError = nil
			return current
		} catch {
			testDeviceError = error.localizedDescription
			return testDevice
		}
	}

	/// The server refuses while a test runs and moves the test runner to the new device.
	private func changeTestDevice(to udid: String?) {
		guard !isLocked,
			runningActionTitle == nil
		else {
			return
		}
		let title = String(localized: "Use for tests")
		runningActionTitle = title
		runningAction = .useForTests
		let testDeviceService = dependencies.testDevice
		actionTask = Task { [weak self] in
			do {
				let device = try await testDeviceService.use(udid: udid)
				self?.testDevice = device
				let message = device.map { String(localized: "tests now run on \($0.name)") } ?? String(localized: "no test simulator")
				self?.finish(result: SimulatorActionResult(title: title, message: message, isSuccess: true, action: .useForTests))
			} catch {
				self?.finish(result: SimulatorActionResult(title: title, message: error.localizedDescription, isSuccess: false, action: .useForTests))
			}
		}
	}

	private func finish(result: SimulatorActionResult) {
		runningActionTitle = nil
		runningAction = nil
		lastResult = result
		loadDevices()
	}

	private func didLoad(devices: [SimulatorDevice], preferredUDID: String?) {
		devicesState = .loaded(devices)
		let isSelectionValid = devices.contains { $0.id == selectedUDID }
		guard !isSelectionValid else {
			refreshBlendedLayers()
			return
		}
		let preferred = devices.first { $0.id == preferredUDID } ?? devices.first { $0.isBooted } ?? devices.first
		selectedUDID = preferred?.id
	}

	private func refreshBlendedLayers() {
		guard let udid = selectedUDID,
			selectedDevice?.isBooted == true
		else {
			isBlendedLayersOn = nil
			return
		}
		isBlendedLayersOn = try? dependencies.service.isBlendedLayersOn(udid: udid)
	}

	private func observeLock() {
		let store = dependencies.store
		store.$slices
			.receive(on: RunLoop.main)
			.sink { [weak self] _ in
				let isRunning = store.value(of: .queue, as: QueueState.self)?.hasActiveTask ?? false
				let isScanning = store.value(of: .scan, as: ScanState.self)?.isActive ?? false
				self?.isLocked = isRunning || isScanning
			}
			.store(in: &cancellables)
	}
}
