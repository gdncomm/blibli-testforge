#!/bin/bash
# Double-click in Finder to update TestForge: pull the latest master, rebuild the Mac app and open it.
# Stops without changing anything when this checkout has local changes or is not on master.
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT" || exit 1

finish() {
	echo
	read -n 1 -s -r -p "Press any key to close."
	exit "$1"
}

branch="$(git branch --show-current)"
if [ "$branch" != "master" ]; then
	echo "This checkout is on '$branch', not master. Switch with: git switch master"
	finish 1
fi
if [ -n "$(git status --porcelain)" ]; then
	echo "This checkout has local changes. Commit or stash them first:"
	git status --short
	finish 1
fi

before="$(git rev-parse --short HEAD)"
echo "Updating from origin/master…"
if ! git pull --ff-only; then
	echo "Could not fast-forward master."
	finish 1
fi
after="$(git rev-parse --short HEAD)"
if [ "$before" = "$after" ]; then
	echo "Already up to date ($after)."
else
	echo "Updated $before → $after:"
	git log --oneline "$before..$after"
fi

# Sourcetree marks files it pulls as downloaded, and macOS then refuses to open the scripts on double-click.
xattr -d com.apple.quarantine "$ROOT"/*.command "$ROOT"/*.sh "$ROOT"/mac-app/scripts/*.sh "$ROOT"/server/start.sh 2>/dev/null || true

echo
exec "$ROOT/build-app.command"
