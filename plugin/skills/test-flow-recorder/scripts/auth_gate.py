#!/usr/bin/env python3
"""Run this immediately before the auth pause, and only raise the pause if it exits 0.

Two questions, both of which cost the user a hand sign-in when guessed wrong.

**Is the harness already collecting?** `TestForgeDriverRunner.runLiveSession()` calls `app.launch()` at the
top, and `XCUIApplication.launch()` terminates any running instance first — so starting or restarting
the harness relaunches the app under test. Asking someone to sign in and *then* bringing the harness
up spends that sign-in on a process that no longer exists. This exits non-zero until the harness
answers a real command, so the pause cannot be raised early.

**Does the session survive a relaunch?** In a normal production app the token is in the Keychain or
`UserDefaults`, a relaunch keeps it, and `test_forge_relaunch_app` stays available to the gated batch like any
other. An app that holds the token only in memory loses it every relaunch, and the batch has to reach
each case's state by navigation instead. The answer comes from reading the auth source, because
finding out by experiment costs the sign-in this script exists to protect.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_DRIVER = "http://127.0.0.1:8789"

# A write to either of these outlives the process. `kSecClass` catches a raw SecItem call that never
# names "Keychain" in the source.
PERSISTENT = re.compile(r"Keychain|kSecClass|UserDefaults|NSUbiquitousKeyValueStore")

# Where a token lives when it does not persist. Reported as supporting detail, never on its own —
# an app can hold a published copy *and* write it through to the Keychain.
IN_MEMORY = re.compile(r"@Published[^\n]*\b(token|session|auth)", re.IGNORECASE)

SOURCE_SUFFIXES = (".swift", ".kt", ".java", ".ts", ".tsx")


def probe(base: str, timeout: float) -> tuple[bool, str]:
    """One real command. The attach flag is not evidence: it reads 'never polled' on a live harness."""
    try:
        request = urllib.request.Request(f"{base}/command",
                                         data=json.dumps({"kind": "screenshot",
                                                          "label": "auth-gate"}).encode(),
                                         headers={"content-type": "application/json"})
        identifier = json.load(urllib.request.urlopen(request, timeout=10))["id"]
    except (urllib.error.URLError, TimeoutError, OSError, KeyError, ValueError) as error:
        return False, f"queue unreachable at {base}: {error}"

    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            payload = json.load(urllib.request.urlopen(f"{base}/result?id={identifier}", timeout=10))
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as error:
            return False, f"queue stopped answering: {error}"
        if not payload.get("pending"):
            result = payload.get("result") or {}
            value = result.get("value") if isinstance(result.get("value"), dict) else result
            path = (value or {}).get("path")
            return (True, f"harness collecting — {path}") if path else (False, f"answered without a path: {value}")
        time.sleep(1.0)
    return False, (f"queued but nothing collected it within {timeout:.0f}s. Start the harness "
                   "(TestForgeDriver scheme, Debug) and wait for it before raising the pause.")


def sources(paths: list[Path]) -> list[Path]:
    found: list[Path] = []
    for path in paths:
        if path.is_file():
            found.append(path)
        elif path.is_dir():
            found += [child for child in path.rglob("*") if child.suffix in SOURCE_SUFFIXES]
    return found


def persistence(paths: list[Path]) -> tuple[str, list[str]]:
    """`persistent`, `in-memory`, or `unknown` — with the lines behind the answer."""
    persistent_hits: list[str] = []
    memory_hits: list[str] = []
    for file in sources(paths):
        try:
            lines = file.read_text(errors="ignore").splitlines()
        except OSError:
            continue
        for number, line in enumerate(lines, start=1):
            if PERSISTENT.search(line):
                persistent_hits.append(f"{file}:{number}: {line.strip()[:110]}")
            elif IN_MEMORY.search(line):
                memory_hits.append(f"{file}:{number}: {line.strip()[:110]}")
    if persistent_hits:
        return "persistent", persistent_hits[:6]
    if memory_hits:
        return "in-memory", memory_hits[:6]
    return "unknown", []


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--driver-url", default=DEFAULT_DRIVER)
    parser.add_argument("--driver-timeout", type=float, default=60.0)
    parser.add_argument("--auth-source", type=Path, action="append", default=[],
                        help="File or folder holding the app's session/auth type. Repeatable. "
                             "Without it the persistence question is reported `unknown`, which the "
                             "run must resolve by hand before planning the gated batch.")
    args = parser.parse_args()

    collecting, detail = probe(args.driver_url.rstrip("/"), args.driver_timeout)
    print(f"  {'✓' if collecting else '!'} harness     {detail}")
    if not collecting:
        print("\n  DO NOT raise the auth pause. Bringing the harness up relaunches the app and would "
              "throw the sign-in away — get it collecting first, then ask.")
        return 1

    state, evidence = persistence(args.auth_source)
    mark = {"persistent": "✓", "in-memory": "~", "unknown": "!"}[state]
    print(f"  {mark} session     {state}")
    for line in evidence:
        print(f"        {line}")

    if state == "persistent":
        print("\n  Raise the pause. The token outlives a relaunch, so `test_forge_relaunch_app` stays "
              "available to the gated batch and one sign-in covers the run.")
    elif state == "in-memory":
        print("\n  Raise the pause, and say in it that a relaunch will cost the session. "
              "Plan every gated case to reach its state by navigation — no `test_forge_relaunch_app` "
              "anywhere in the batch, and a harness restart means asking again.")
    else:
        print("\n  Pass --auth-source, or read the session type by hand, before raising the pause: "
              "guessing wrong costs the user a second sign-in.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
