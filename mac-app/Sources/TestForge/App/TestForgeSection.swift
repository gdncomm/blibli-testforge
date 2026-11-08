import SwiftUI

/// Sidebar destinations; Simulator (R4d) and Build (R4e) come after Advanced; Claude (D-133) sits under Get ready;
/// Docs (D-218) comes last.
enum TestForgeSection: String, CaseIterable, Identifiable {
	case getReady
	case claude
	case tests
	case scan
	case results
	case reports
	case advanced
	case network
	case simulator
	case build
	case docs

	var id: String { rawValue }

	var title: LocalizedStringResource {
		switch self {
			case .getReady:
				return "Get ready"
			case .claude:
				return "Claude"
			case .tests:
				return "Tests"
			case .scan:
				return "Scan"
			case .results:
				return "Results"
			case .reports:
				return "Reports"
			case .advanced:
				return "Advanced"
			case .network:
				return "Network"
			case .simulator:
				return "Simulator"
			case .build:
				return "Build"
			case .docs:
				return "Docs"
		}
	}

	var symbolName: String {
		switch self {
			case .getReady:
				return "checklist"
			case .claude:
				return "sparkles"
			case .tests:
				return "list.bullet.rectangle"
			case .scan:
				return "viewfinder"
			case .results:
				return "checkmark.seal"
			case .reports:
				return "doc.richtext"
			case .advanced:
				return "slider.horizontal.3"
			case .network:
				return "network"
			case .simulator:
				return "iphone.gen3"
			case .build:
				return "hammer"
			case .docs:
				return "book"
		}
	}

	/// ⌘1–⌘8 match Xcode's navigator shortcuts; Network and Claude (added after them) take ⌘9 and ⌘0; Docs takes ⌘D.
	var shortcutKey: KeyEquivalent {
		switch self {
			case .getReady:
				return "1"
			case .claude:
				return "0"
			case .tests:
				return "2"
			case .scan:
				return "3"
			case .results:
				return "4"
			case .reports:
				return "5"
			case .advanced:
				return "6"
			case .network:
				return "9"
			case .simulator:
				return "7"
			case .build:
				return "8"
			case .docs:
				return "d"
		}
	}

	/// Sidebar tile color, like System Settings: one hue per section so a section is found by color as well as name.
	var tint: Color {
		switch self {
			case .getReady:
				return .green
			case .claude:
				return .orange
			case .tests:
				return .blue
			case .scan:
				return .teal
			case .results:
				return .purple
			case .reports:
				return .indigo
			case .advanced:
				return .gray
			case .network:
				return .cyan
			case .simulator:
				return .red
			case .build:
				return .brown
			case .docs:
				return .mint
		}
	}
}
