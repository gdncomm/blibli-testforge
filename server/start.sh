#!/bin/bash
# Installs deps on first run and starts the QA server (the TestForge Mac app runs this).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Launched from the Mac app, a GUI process hands us a bare /usr/bin:/bin PATH — node, npm
# and claude live in Homebrew / ~/.local/bin / nvm, none of which a GUI launch inherits.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ] && ! command -v node >/dev/null 2>&1; then
	# shellcheck disable=SC1091
	. "$HOME/.nvm/nvm.sh"
fi

if [ ! -d node_modules ]; then
	npm install --no-audit --no-fund
fi

# Per-machine settings and secrets (gitignored). See .env.local.example.
if [ -f .env.local ]; then
	set -a
	# shellcheck disable=SC1091
	. ./.env.local
	set +a
fi

export NETWORKLENS_BUNDLE_ID="${NETWORKLENS_BUNDLE_ID:-com.blibli.mobile}"
export TEST_FORGE_SERVER_PORT="${TEST_FORGE_SERVER_PORT:-4545}"
# The iOS project under test (the folder holding the .xcworkspace). Set TEST_FORGE_PROJECT_DIR to your clone of the app repo,
# for example ~/Projects/BlibliIOSApp/BlibliMobile-iOS. When this server still sits inside that repo
# (tools/test-forge-server), the sibling BlibliMobile-iOS folder is used.
if [ -z "${TEST_FORGE_PROJECT_DIR:-}" ]; then
	if [ -d "$SCRIPT_DIR/../../BlibliMobile-iOS" ]; then
		TEST_FORGE_PROJECT_DIR="$(cd "$SCRIPT_DIR/../../BlibliMobile-iOS" && pwd)"
	else
		echo "TEST_FORGE_PROJECT_DIR is not set. Point it at BlibliMobile-iOS in your app clone (put it in .env.local)." >&2
		exit 1
	fi
fi
export TEST_FORGE_PROJECT_DIR
export TEST_FORGE_UITEST_TARGET="${TEST_FORGE_UITEST_TARGET:-BlibliMobile_XCUITest}"
# The driver was consolidated onto the PerfTest scheme (default test plan TestForgeDriver.xctestplan);
# harness.py's own defaults (scheme TestForgeDriver, config Debug) do not exist in this project.
export TEST_FORGE_SCHEME="${TEST_FORGE_SCHEME:-BlibliMobile-iOS-PerfTest}"
export TEST_FORGE_CONFIGURATION="${TEST_FORGE_CONFIGURATION:-PerformanceTest}"

exec node server.js
