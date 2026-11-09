import SwiftUI

/// The device card: which simulator, its state, and power / window controls.
struct SimulatorDeviceSectionView: View {
	@ObservedObject var viewModel: SimulatorControlViewModel

	var body: some View {
		SimulatorCardView(card: Self.card) {
			switch viewModel.devicesState {
				case .loading:
					LoadingStateView(text: "Looking for simulators…")
						.frame(maxWidth: .infinity, alignment: .leading)
				case .failed(let message):
					Label(message, systemImage: "exclamationmark.triangle.fill")
						.foregroundStyle(.orange)
				case .loaded(let devices):
					HStack(alignment: .center, spacing: TestForgeConstants.Spacing.large) {
						deviceIcon
						deviceDetails(devices: devices)
						Spacer(minLength: TestForgeConstants.Spacing.large)
						controls
					}
			}
			if let testDeviceError = viewModel.testDeviceError {
				Label(String(localized: "Couldn't ask which simulator tests use: \(testDeviceError)"), systemImage: "exclamationmark.triangle")
					.font(.caption)
					.foregroundStyle(.orange)
					.textSelection(.enabled)
					.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorTestDeviceError)
			}
			SimulatorCardActivityView(activity: viewModel.activity(for: .device), card: .device)
		}
	}

	private var deviceIcon: some View {
		Image(systemName: "iphone")
			.font(.system(size: TestForgeConstants.SimulatorControl.deviceSymbolSize, weight: .light))
			.foregroundStyle(isBooted ? Color.accentColor : Color.secondary)
			.frame(width: TestForgeConstants.SimulatorControl.deviceIconSize, height: TestForgeConstants.SimulatorControl.deviceIconSize)
			.background(
				RoundedRectangle(cornerRadius: TestForgeConstants.SimulatorControl.deviceIconCornerRadius)
					.fill(Color.accentColor.opacity(TestForgeConstants.SimulatorControl.headerIconOpacity))
			)
	}

	private func deviceDetails(devices: [SimulatorDevice]) -> some View {
		VStack(alignment: .leading, spacing: TestForgeConstants.Spacing.small) {
			HStack(spacing: TestForgeConstants.Spacing.medium) {
				deviceMenu(devices: devices)
				if let device = viewModel.selectedDevice {
					SimulatorDeviceStateBadgeView(isBooted: device.isBooted)
				}
				testDeviceControls
			}
			if let device = viewModel.selectedDevice {
				HStack(spacing: TestForgeConstants.Spacing.small) {
					Label(device.runtime, systemImage: "apple.logo")
					Text("·")
					Text(device.id)
						.font(.caption.monospaced())
						.lineLimit(1)
						.truncationMode(.middle)
						.textSelection(.enabled)
					Button(action: viewModel.copySelectedUDID) {
						Image(systemName: "doc.on.doc")
					}
					.buttonStyle(.borderless)
					.help("Copy the UDID")
					.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorCopyUDIDButton)
				}
				.font(.callout)
				.foregroundStyle(.secondary)
			}
		}
	}

	/// D-120: the test device is marked; any other simulator can become it.
	@ViewBuilder
	private var testDeviceControls: some View {
		if viewModel.isSelectedTestDevice {
			Label("Used by tests", systemImage: "checkmark.seal.fill")
				.font(.caption.weight(.semibold))
				.foregroundStyle(Color.accentColor)
				.help("Tests, Measure's default and the test runner use this simulator")
				.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorTestDeviceBadge)
			if viewModel.canUseTestForgeCloneForTests {
				Button(action: viewModel.useTestForgeCloneForTests) {
					SimulatorActionLabel(title: "Back to the QA clone", systemImage: "arrow.uturn.backward", isBusy: viewModel.isRunning(.useForTests))
				}
				.buttonStyle(.borderless)
				.disabled(viewModel.isLocked || viewModel.runningActionTitle != nil)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorUseTestForgeCloneButton)
			}
		} else if viewModel.selectedDevice != nil {
			Button(action: viewModel.useSelectedForTests) {
				SimulatorActionLabel(title: "Use for tests", systemImage: "scope", isBusy: viewModel.isRunning(.useForTests))
			}
			.buttonStyle(.bordered)
			.controlSize(.small)
			.disabled(viewModel.isLocked || viewModel.runningActionTitle != nil)
			.help("Run tests on this simulator; the app and test runner are installed here by Build › Install for testing")
			.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorUseForTestsButton)
		}
	}

	private func menuRow(device: SimulatorDevice) -> some View {
		let isTestDevice = viewModel.isTestDevice(udid: device.id)
		let symbol = isTestDevice ? "checkmark.seal.fill" : (device.isBooted ? "iphone.radiowaves.left.and.right" : "iphone")
		let suffix = isTestDevice ? String(localized: " · used by tests") : ""
		return Label("\(device.name) · \(device.runtime)\(suffix)", systemImage: symbol)
	}

	private func deviceMenu(devices: [SimulatorDevice]) -> some View {
		Menu {
			Picker("Simulator", selection: $viewModel.selectedUDID) {
				ForEach(devices) { device in
					menuRow(device: device)
						.tag(String?.some(device.id))
				}
			}
			.pickerStyle(.inline)
		} label: {
			Text(viewModel.selectedDevice?.name ?? String(localized: "Choose a simulator"))
				.font(.title2.weight(.semibold))
		}
		.menuStyle(.borderlessButton)
		.fixedSize()
		.help("Switch simulator")
		.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorDevicePicker)
		.tutorialAnchor(.simulatorDevicePicker)
	}

	private var controls: some View {
		HStack(spacing: TestForgeConstants.Spacing.medium) {
			if isBooted {
				Button(action: viewModel.shutdown) {
					SimulatorActionLabel(title: "Shut down", systemImage: "power", isBusy: viewModel.isRunning(.shutdown))
				}
				.disabled(!viewModel.canAct)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorShutdownButton)
			} else {
				Button(action: viewModel.boot) {
					SimulatorActionLabel(title: "Boot", systemImage: "power", isBusy: viewModel.isRunning(.boot))
				}
				.buttonStyle(.borderedProminent)
				.disabled(!viewModel.canAct)
				.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorBootButton)
			}
			Button(action: viewModel.showSimulatorApp) {
				SimulatorActionLabel(title: "Show Simulator", systemImage: "macwindow", isBusy: viewModel.isRunning(.showSimulator))
			}
			.disabled(viewModel.runningActionTitle != nil)
			.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorShowButton)
			Button(action: viewModel.loadDevices) {
				if viewModel.isRefreshingDevices {
					ProgressView()
						.controlSize(.small)
				} else {
					Image(systemName: "arrow.clockwise")
				}
			}
			.disabled(viewModel.isRefreshingDevices)
			.help(viewModel.isRefreshingDevices ? "Refreshing the simulator list…" : "Refresh the simulator list")
			.accessibilityLabel("Refresh")
			.accessibilityIdentifier(TestForgeConstants.Accessibility.simulatorRefreshButton)
		}
		.controlSize(.large)
	}

	private var isBooted: Bool {
		viewModel.selectedDevice?.isBooted == true
	}
}

private extension SimulatorDeviceSectionView {
	static let card = SimulatorCard(name: "Device", title: nil, systemImage: "iphone", tint: .accentColor, footer: nil)
}
