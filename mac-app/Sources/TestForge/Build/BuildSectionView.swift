import SwiftUI

/// Sidebar › Build: the Xcode work a run needs, as buttons, without opening Xcode.
struct BuildSectionView: View {
	@ObservedObject var viewModel: BuildSectionViewModel
	let resetViewModel: ResetSectionViewModel
	@EnvironmentObject private var tutorials: TutorialCoordinator

	var body: some View {
		ScrollViewReader { proxy in
			Form {
				BuildStatusSectionView(viewModel: viewModel)
				BuildQASectionView(viewModel: viewModel)
					.id(BuildScrollTarget.qaBuild)
				BuildLogSectionView(lines: viewModel.logLines)
				BuildXcodeSectionView(viewModel: viewModel)
					.id(BuildScrollTarget.xcode)
				ResetSectionView(viewModel: resetViewModel)
					.id(BuildScrollTarget.clean)
				BuildRunnerSectionView(viewModel: viewModel)
			}
			.formStyle(.grouped)
			.onChange(of: tutorials.activeAnchor) {
				// A tip can only point at a control on screen, so bring the current tip's section into view.
				if let target = tutorials.activeAnchor.flatMap(BuildScrollTarget.init(anchor:)) {
					proxy.scrollTo(target, anchor: .top)
				}
			}
		}
		.onAppear {
			viewModel.load()
			resetViewModel.load()
		}
		.accessibilityIdentifier(TestForgeConstants.Accessibility.build)
	}
}

private enum BuildScrollTarget: Hashable {
	case qaBuild
	case xcode
	case clean

	init?(anchor: TutorialAnchor) {
		switch anchor {
			case .buildQASection, .buildStartButton:
				self = .qaBuild
			case .buildXcodeSection:
				self = .xcode
			case .buildCleanSection:
				self = .clean
			default:
				return nil
		}
	}
}
