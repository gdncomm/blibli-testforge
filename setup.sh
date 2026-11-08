#!/bin/bash
# One-command setup for a new machine: checks the tools, installs the server's dependencies,
# builds the Mac app and enables the repo's git hook. Safe to re-run. Changes nothing outside
# this checkout except what `make-app.sh` writes (its build/ folder).
#
#   ./setup.sh            check, install, build
#   ./setup.sh --check    only check the tools
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ] && ! command -v node >/dev/null 2>&1; then
	# shellcheck disable=SC1091
	. "$HOME/.nvm/nvm.sh"
fi

MIN_NODE_MAJOR=18
missing=0

ok() { printf '  ok       %s\n' "$1"; }
bad() { printf '  MISSING  %s\n' "$1"; missing=1; }
warn() { printf '  optional %s\n' "$1"; }

echo "Checking this Mac"
[ "$(uname -s)" = "Darwin" ] && ok "macOS" || bad "macOS (TestForge only runs on a Mac)"

if xcodebuild -version >/dev/null 2>&1; then
	ok "Xcode ($(xcodebuild -version | head -1))"
else
	bad "Xcode, with the iOS Simulator (App Store: https://apps.apple.com/app/xcode/id497799835)"
fi

if command -v node >/dev/null 2>&1; then
	major="$(node -p 'process.versions.node.split(".")[0]')"
	if [ "$major" -ge "$MIN_NODE_MAJOR" ]; then
		ok "Node $(node -v)"
	else
		bad "Node $MIN_NODE_MAJOR or newer (found $(node -v)); https://nodejs.org/en/download"
	fi
else
	bad "Node $MIN_NODE_MAJOR or newer; https://nodejs.org/en/download"
fi

command -v claude >/dev/null 2>&1 && ok "Claude Code" || bad "Claude Code; https://docs.anthropic.com/en/docs/claude-code/setup"
command -v ffmpeg >/dev/null 2>&1 && ok "ffmpeg" || warn "ffmpeg (brew install ffmpeg): without it videos are kept uncut"

if [ "$missing" -ne 0 ]; then
	echo
	echo "Install what is marked MISSING, then run ./setup.sh again."
	exit 1
fi
[ "$CHECK_ONLY" -eq 1 ] && exit 0

echo
echo "Installing the server's dependencies"
(cd "$ROOT/server" && npm install --no-audit --no-fund)

echo
echo "Clearing the download flag macOS puts on files a Git app pulled"
# Sourcetree marks files it pulls as downloaded, and macOS then refuses to open the scripts on double-click.
xattr -d com.apple.quarantine "$ROOT"/*.command "$ROOT"/*.sh "$ROOT"/mac-app/scripts/*.sh "$ROOT"/server/start.sh 2>/dev/null || true

echo
echo "Enabling the git hook that refuses a push to master"
git -C "$ROOT" config core.hooksPath .githooks

echo
echo "Building the Mac app"
(cd "$ROOT/mac-app" && ./scripts/make-app.sh)

cat <<DONE

Done. Next:
  1. open "$ROOT/mac-app/build/TestForge.app"
     First launch asks for two folders: this checkout and your clone of the Blibli iOS app.
  2. Add the Claude Code plugin (once):
       claude plugin marketplace add "$ROOT"
       claude plugin install test-flow-recorder@testforge
     then restart Claude Code.
DONE
