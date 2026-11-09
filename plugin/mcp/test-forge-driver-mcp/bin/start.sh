#!/bin/sh
# Launcher for the test-forge-driver MCP server, referenced by the app repo's .mcp.json.
#
# Same shape as tools/networklens-mcp/bin/start.sh, for the same reasons: dist/ is not committed,
# an MCP client launches this with no terminal attached, and everything diagnostic must go to
# stderr because stdout is the JSON-RPC channel.
set -e
DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

# An MCP client spawns this with a minimal PATH that need not include a Homebrew node — the same
# reason the `firebase` server in .mcp.json fails with "Executable not found in $PATH: npx".
PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export PATH

if ! command -v node >/dev/null 2>&1; then
    echo "test-forge-driver-mcp: no node on PATH ($PATH) — install it (brew install node) or point PATH at it." >&2
    exit 1
fi

if [ ! -f dist/index.js ] || [ src/index.ts -nt dist/index.js ]; then
    echo "test-forge-driver-mcp: building…" >&2
    if [ -d node_modules ]; then
        npm run build >&2
    else
        # `ci` not `install`, so the lockfile is the source of truth and a stale
        # node_modules can never silently change what the server is running.
        npm ci >&2 && npm run build >&2
    fi
fi

exec node dist/index.js
