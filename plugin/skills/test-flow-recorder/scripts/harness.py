#!/usr/bin/env python3
"""Keeps the XCUITest driver session alive, so a run does not stop dead when it dies.

The harness dies for ordinary reasons — an XCTest raise inside a command handler unwinds
`testLiveSession` and takes the whole session with it, so one unscoped swipe against a screen whose
scroll view does not resolve ends a 40-case run at case 12. Restarting it by hand costs a
conversation turn and the developer's attention, for something entirely mechanical.

Two operations are deliberately separated, because only one of them is cheap and safe to automate:

  build-for-testing        compiles the test bundle. Slow, may need network or VPN access for
                           dependency resolution, and fails in ways a person has to read. Stays the
                           developer's job — this script refuses to run it and says so.
  test-without-building    starts the session from a bundle that already exists. Seconds of CPU, no
                           network, no decisions. This is what gets restarted automatically.

Readiness is proven the only way that means anything: a real command completes. A process being
alive, a port listening and `test_forge_status` all report "up" for a harness that answers nothing.

Usage:
    harness.py status            what is actually true right now
    harness.py ensure            start it if a real command does not complete; no-op if healthy
    harness.py start             start it even if one seems to be running (refuses to double-start)
    harness.py stop              terminate the session
    harness.py logs [n]          tail the session log
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

BASE = os.environ.get("TEST_FORGE_DRIVER_URL", "http://127.0.0.1:8789")
SCHEME = os.environ.get("TEST_FORGE_SCHEME", "TestForgeDriver")
CONFIGURATION = os.environ.get("TEST_FORGE_CONFIGURATION", "Debug")
# Optional. Named, the runner app is matched exactly; unnamed, any `*-Runner.app` in the products
# directory is taken, which is right whenever a project has one UI test target.
RUNNER_TARGET = os.environ.get("TEST_FORGE_UITEST_TARGET")
RUNNER_PATTERN = f"{RUNNER_TARGET}-Runner" if RUNNER_TARGET else "-Runner"
# Optional, for a build kept apart from the developer's (a QA copy): its own DerivedData, and a
# named simulator rather than whichever one happens to be booted.
DERIVED_DATA = os.environ.get("TEST_FORGE_DERIVED_DATA")
SIMULATOR_UDID = os.environ.get("TEST_FORGE_SIMULATOR_UDID")
BUILD_PATTERN = rf"xcodebuild test-without-building.*-scheme {SCHEME}"
SCRATCH = pathlib.Path(os.environ.get("TEST_FORGE_SCRATCH", os.environ.get("TMPDIR", "/tmp")))
LOG = SCRATCH / "test-forge-harness.log"
# A cold `test-without-building` installs the runner and waits for the app, which is comfortably
# under two minutes on this project but nowhere near instant.
READY_TIMEOUT = 210.0
PROBE_TIMEOUT = 25.0


def resolve_workspace() -> tuple[pathlib.Path, str]:
    """(project directory, workspace filename).

    Searched from the caller's cwd rather than from this file: shipped in a plugin, this script
    lives nowhere near the project it drives. TEST_FORGE_PROJECT_DIR skips the search entirely.
    """
    explicit = os.environ.get("TEST_FORGE_PROJECT_DIR")
    starts = [pathlib.Path(explicit).expanduser()] if explicit else [pathlib.Path.cwd(), *pathlib.Path.cwd().parents]
    for candidate in starts:
        found = sorted(candidate.glob("*.xcworkspace"))
        if found:
            return candidate, found[0].name
    where = explicit or f"{pathlib.Path.cwd()} or any parent"
    raise SystemExit(f"no .xcworkspace in {where} — set TEST_FORGE_PROJECT_DIR to the project directory")


def repo_root() -> pathlib.Path:
    return resolve_workspace()[0]


def booted_udid() -> str | None:
    listed = subprocess.run(["xcrun", "simctl", "list", "devices", "booted", "-j"],
                            capture_output=True, text=True).stdout
    try:
        devices = json.loads(listed).get("devices", {})
    except ValueError:
        return None
    return next((device["udid"] for group in devices.values() for device in group), None)


def is_booted(udid: str) -> bool:
    listed = subprocess.run(["xcrun", "simctl", "list", "devices", "booted", "-j"],
                            capture_output=True, text=True).stdout
    try:
        devices = json.loads(listed).get("devices", {})
    except ValueError:
        return False
    return any(device["udid"] == udid for group in devices.values() for device in group)


def processes(pattern: str) -> list[int]:
    result = subprocess.run(["pgrep", "-f", pattern], capture_output=True, text=True)
    return [int(pid) for pid in result.stdout.split()]


def probe(timeout: float = PROBE_TIMEOUT) -> tuple[bool, str]:
    """One real command, start to finish. The only trustworthy liveness check.

    `deviceInfo` rather than a screenshot: it proves the same round trip without writing a PNG per
    probe into the session folder (thousands of them once a dashboard polls the harness)."""
    try:
        request = urllib.request.Request(f"{BASE}/command",
                                         data=json.dumps({"kind": "deviceInfo"}).encode(),
                                         headers={"content-type": "application/json"})
        identifier = json.load(urllib.request.urlopen(request, timeout=8))["id"]
    except (urllib.error.URLError, OSError, ValueError) as error:
        return False, f"queue server unreachable at {BASE}: {error}"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            payload = json.load(urllib.request.urlopen(f"{BASE}/result?id={identifier}", timeout=8))
        except (urllib.error.URLError, OSError, ValueError) as error:
            return False, f"result read failed: {error}"
        if not payload.get("pending"):
            return True, str((payload.get("result") or {}).get("value") or payload.get("result"))
        time.sleep(0.5)
    return False, f"no answer to a probe within {timeout:.0f}s — queue up, nothing collecting"


def test_bundle_built(root: pathlib.Path) -> pathlib.Path | None:
    """The runner app under DerivedData. Absent means `build-for-testing` has never run."""
    runner = f"{RUNNER_TARGET + '-Runner' if RUNNER_TARGET else '*-Runner'}.app"
    if DERIVED_DATA:
        derived, pattern = pathlib.Path(DERIVED_DATA).expanduser(), f"Build/Products/{CONFIGURATION}-iphonesimulator/{runner}"
    else:
        derived = pathlib.Path.home() / "Library/Developer/Xcode/DerivedData"
        pattern = f"{root.name}-*/Build/Products/{CONFIGURATION}-iphonesimulator/{runner}"
    candidates = sorted(derived.glob(pattern),
                        key=lambda path: path.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def start(root: pathlib.Path, force: bool = False) -> int:
    workspace = resolve_workspace()[1]
    running = processes(BUILD_PATTERN)
    if running and not force:
        print(f"  · a test-without-building is already running (pid {running[0]}); not double-starting")
        return 0
    udid = booted_udid()
    if SIMULATOR_UDID:
        if not is_booted(SIMULATOR_UDID):
            print(f"  ! simulator {SIMULATOR_UDID} (TEST_FORGE_SIMULATOR_UDID) is not booted — boot it first")
            return 1
        udid = SIMULATOR_UDID
    if not udid:
        print("  ! no booted simulator — boot one first, this script will not choose a device for you")
        return 1
    derived_args = ["-derivedDataPath", str(pathlib.Path(DERIVED_DATA).expanduser())] if DERIVED_DATA else []
    built = test_bundle_built(root)
    if not built:
        # The one case that genuinely needs a person: it is slow, it needs the VPN, and its failures
        # have to be read rather than retried.
        print(f"  ! no test bundle built for the {SCHEME} scheme. Run this once:\n"
              f"      xcodebuild build-for-testing -workspace {workspace} -scheme {SCHEME} "
              f"-configuration {CONFIGURATION} {' '.join(derived_args)} -destination \"platform=iOS Simulator,id={udid}\"")
        return 2
    command = ["xcodebuild", "test-without-building", "-workspace", workspace,
               "-scheme", SCHEME, "-configuration", CONFIGURATION, *derived_args,
               "-destination", f"platform=iOS Simulator,id={udid}"]
    LOG.parent.mkdir(parents=True, exist_ok=True)
    handle = LOG.open("a")
    handle.write(f"\n=== started {time.strftime('%Y-%m-%d %H:%M:%S')} on {udid} ===\n")
    handle.flush()
    # Detached: the session has to outlive this process, and its own log is the only record of why
    # it stopped if it stops again.
    process = subprocess.Popen(command, cwd=root, stdout=handle, stderr=subprocess.STDOUT,
                               start_new_session=True)
    print(f"  + started (pid {process.pid}), runner {built.name}, log {LOG}")
    return 0


def wait_ready(deadline_seconds: float = READY_TIMEOUT) -> bool:
    deadline = time.time() + deadline_seconds
    while time.time() < deadline:
        ok, _ = probe(timeout=10)
        if ok:
            return True
        if not processes(BUILD_PATTERN):
            # It exited while we waited: the log holds the reason, and retrying the same command
            # would just reproduce it.
            return False
        time.sleep(4)
    return False


def stop() -> int:
    stopped = 0
    for pattern in (BUILD_PATTERN, RUNNER_PATTERN):
        for pid in processes(pattern):
            try:
                os.kill(pid, signal.SIGTERM)
                stopped += 1
            except ProcessLookupError:
                pass
    print(f"  · terminated {stopped} process(es)")
    return 0


def status() -> int:
    ok, detail = probe()
    build = processes(BUILD_PATTERN)
    runner = processes(RUNNER_PATTERN)
    print(f"  probe    {'PASS' if ok else 'FAIL'}  {detail}")
    print(f"  xcodebuild {build or 'none'}")
    print(f"  runner     {runner or 'none'}")
    if not ok and (build or runner):
        print("  ~ a process is alive but answers nothing — it is wedged, not running. `stop` then `ensure`.")
    return 0 if ok else 1


def ensure(root: pathlib.Path, attempts: int = 2) -> int:
    """Healthy → no-op. Otherwise restart, bounded, and prove it with a real command.

    Bounded because a harness that dies on startup dies the same way every time; looping on it burns
    minutes and produces the same log. Two attempts, then hand back with the log path.
    """
    ok, detail = probe()
    if ok:
        print(f"  ✓ harness healthy: {detail}")
        return 0
    print(f"  ! harness not answering: {detail}")
    for attempt in range(1, attempts + 1):
        if processes(BUILD_PATTERN) or processes(RUNNER_PATTERN):
            print("  · clearing a wedged session first")
            stop()
            time.sleep(3)
        code = start(root, force=True)
        if code:
            return code
        print(f"  · attempt {attempt}/{attempts}: waiting for it to collect a command…")
        if wait_ready():
            ok, detail = probe()
            print(f"  ✓ harness back up: {detail}")
            return 0
        print(f"  ! attempt {attempt} did not come up; log: {LOG}")
    tail(20)
    return 1


def tail(count: int = 40) -> int:
    if not LOG.exists():
        print(f"  · no log at {LOG}")
        return 0
    lines = LOG.read_text(errors="ignore").splitlines()
    interesting = [line for line in lines if re.search(r"error|fail|Test Case|Live session|===", line, re.I)]
    for line in (interesting or lines)[-count:]:
        print("   ", line[:200])
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=("status", "ensure", "start", "stop", "logs"))
    parser.add_argument("count", nargs="?", type=int, default=40)
    parser.add_argument("--attempts", type=int, default=2)
    args = parser.parse_args()
    root = repo_root()
    if args.action == "status":
        return status()
    if args.action == "ensure":
        return ensure(root, args.attempts)
    if args.action == "start":
        return start(root, force=True)
    if args.action == "stop":
        return stop()
    return tail(args.count)


if __name__ == "__main__":
    sys.exit(main())
