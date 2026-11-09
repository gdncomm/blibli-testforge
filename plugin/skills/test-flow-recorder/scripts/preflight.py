#!/usr/bin/env python3
"""Proves the plumbing before a single test case runs. Fails closed.

Two sessions were lost to infrastructure that *reported success*: an MCP holding a container path
the app had stopped using, and one malformed mock rule that made the app silently drop all seven of
its rules. Both presented as "mocking is broken" and both were invisible to every status flag in the
stack — the live channel kept answering "on" while the app talked to the real backend.

So each gate here checks the thing itself rather than something's opinion of it: a real driver
command instead of the attach flag, the session file under the container `simctl` resolves *now*
instead of the one an MCP resolved once, and `isMockServed` in the trace instead of an armed-variant
acknowledgement.

Statuses: PASS · WARN (worth knowing, does not block) · FAIL (blocks) · SKIP (not asked for).
Exit code is 1 if any gate failed, so a caller can gate a run on this script alone.

Usage:
    preflight.py [--endpoint "/<service>/<resource>"]… \\
        [--manifest fixtures/<feature>/manifest.json --responses-dir fixtures/<feature>/api-responses] \\
        [--mcp-container <path lens_status printed>] [--rule <candidate rule>.json] \\
        --bundle-id <app bundle id> [--driver-url http://127.0.0.1:8789] [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))
from dataplane import LENS_RELATIVE, container_path, exchanges, read_session, trace_dir  # noqa: E402
from audit_platform_skills import audit, load_recorded_fingerprint, platform_requirement  # noqa: E402

DEFAULT_DRIVER = "http://127.0.0.1:8789"
# A trace older than this describes a previous app run, so `isMockServed` in it proves nothing about
# the process now under test.
DEFAULT_TRACE_AGE = 900
UUID = re.compile(r"^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$")
REQUIRED_RULE_KEYS = ("id", "endpointKey", "match", "isEnabled", "activeVariantID", "variants")
REQUIRED_VARIANT_KEYS = ("id", "name", "exhaustion", "steps")
STATUS_MARK = {"PASS": "✓", "WARN": "~", "FAIL": "!", "SKIP": "·"}


class Report:
    def __init__(self) -> None:
        self.gates: list[dict[str, Any]] = []

    def add(self, gate: str, status: str, detail: str, **extra: Any) -> None:
        self.gates.append({"gate": gate, "status": status, "detail": detail, **extra})

    @property
    def failed(self) -> list[dict[str, Any]]:
        return [gate for gate in self.gates if gate["status"] == "FAIL"]


def post_command(base: str, command: dict[str, Any], timeout: float) -> dict[str, Any]:
    """One command, start to finish. The queue is POST-then-poll, and `/commands` drains on read."""
    request = urllib.request.Request(f"{base}/command", data=json.dumps(command).encode(),
                                     headers={"content-type": "application/json"})
    identifier = json.load(urllib.request.urlopen(request, timeout=10))["id"]
    deadline = time.time() + timeout
    while time.time() < deadline:
        payload = json.load(urllib.request.urlopen(f"{base}/result?id={identifier}", timeout=10))
        if not payload.get("pending"):
            # The harness answers `{result: {value: {...}, id, at}}` — the payload a command
            # returns is one level further in than the envelope suggests, and reading the envelope
            # made every screenshot look like a driver that answered without a path.
            result = payload.get("result") or {}
            return result.get("value") if isinstance(result.get("value"), dict) else result
        time.sleep(0.4)
    raise TimeoutError(f"no result for {command.get('kind')} within {timeout:.0f}s")


def gate_driver(report: Report, base: str, timeout: float) -> None:
    """A real command, never the attach flag.

    `test_forge_status` tracks queue polls and goes stale: a live harness reports "never polled" right after
    a restart while its own log says it is listening. A screenshot is the cheapest command that can
    only succeed if the collector is actually pumping the queue.
    """
    try:
        result = post_command(base, {"kind": "screenshot", "label": "preflight"}, timeout)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        report.add("driver", "FAIL", f"no response from {base}: {error}. Start the harness "
                                     "(TestForgeDriver scheme, Debug) and re-run.")
        return
    path = result.get("path")
    if not path:
        report.add("driver", "FAIL", f"driver answered without a screenshot path: {json.dumps(result)[:160]}")
        return
    report.add("driver", "PASS", f"screenshot returned {path}", path=path)


def gate_media(report: Report, screenshot: str | None, claimed: str | None) -> None:
    """The stills and the video have to land in the same folder, and two processes decide that.

    Screenshots are written inside the runner, from the **test plan's** `TEST_FORGE_MEDIA_ROOT`; recordings
    are written host-side by the driver MCP, from **its own** environment. Nothing makes those agree,
    and when they disagree neither side errors: a case ends with its screenshots under one root and
    its recording under another, and the report cites a file the reviewer cannot find beside the rest.
    Seen live on 2026-09-06 — stills under `Bazaar-QA`, clips under `Blibli-Test` — which is what
    running one project's cases from another project's directory produces.

    `claimed` is the media root `test_forge_status` prints. Pass it every time, the same way `--mcp-container`
    turns the container gate from a heuristic into a comparison.
    """
    if not screenshot:
        report.add("media", "SKIP", "no screenshot path from the driver gate, nothing to compare")
        return
    # `<root>/<caseId>/<file>.png` — two levels up from the capture is the root both halves share.
    runner_root = Path(screenshot).parent.parent
    if not claimed:
        report.add("media", "WARN", f"runner writes under {runner_root}; pass --mcp-media-root "
                                    "(from test_forge_status) to prove the driver agrees")
        return
    if Path(claimed).expanduser().resolve() == runner_root.resolve():
        report.add("media", "PASS", f"screenshots and recordings share {runner_root}")
        return
    report.add("media", "FAIL",
               f"split evidence: the runner writes screenshots under {runner_root} while the driver "
               f"records video under {claimed}. Set TEST_FORGE_MEDIA_ROOT to the same value in the test plan "
               "and in the driver MCP's environment, then restart both.")


def gate_skill_audit(report: Report, project_root: Path, platform: str) -> None:
    """The platform's governing view-code skill, re-checked cheaply against the fingerprint
    `/test-forge-init` step 8 recorded — catches the skill having been deleted or renamed since setup, which
    `/test-forge-init` running once has no way to know about. A platform that declares no requirement
    (`platforms/<platform>.md`'s "Host-project skills required") has nothing to check here.
    """
    platforms_dir = Path(__file__).parent.parent / "platforms"
    requirement = platform_requirement(platform, platforms_dir)
    if not requirement.required:
        report.add("skill-audit", "SKIP", f"{platform} declares no host-project skill requirement")
        return

    recorded = load_recorded_fingerprint(project_root, platform)
    if recorded is None:
        report.add("skill-audit", "FAIL", f"no recorded skill audit for {platform} — "
                                          "run /test-forge-init step 8 before any run")
        return

    result = audit(project_root, platform, platforms_dir)
    if result.status == "missing_blocking":
        report.add("skill-audit", "FAIL", f"{platform} has no governing skill anymore — "
                                          "re-run /test-forge-init step 8")
        return
    if result.fingerprint != recorded:
        report.add("skill-audit", "WARN", f"skill audit state changed since /test-forge-init (recorded "
                                          f"{recorded}, now {result.fingerprint}) — consider "
                                          "re-running /test-forge-init step 8")
        return
    report.add("skill-audit", "PASS", f"{platform} governing skill present ({result.fingerprint})")


def gate_devices(report: Report) -> None:
    """Exactly one booted simulator, or a host-side command cannot know which one it is driving.

    Screen commands go through the harness and are bound to its device. Everything host-side —
    `simctl io recordVideo`, `simctl openurl`, `get_app_container` — takes a device argument, and
    `booted` silently resolves to whichever one simctl picks. On 2026-09-06 that put ten recordings
    on an idle second simulator: same app, same screen, no error, and only the frame dimensions gave
    it away. Pin `TEST_FORGE_DEVICE_UDID`, or shut the extra device down.
    """
    try:
        listing = subprocess.run(["xcrun", "simctl", "list", "devices", "booted", "-j"],
                                 capture_output=True, text=True, timeout=60)
        devices = [device for group in json.loads(listing.stdout)["devices"].values() for device in group]
    except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
        report.add("devices", "WARN", f"could not list booted simulators: {error}")
        return
    if not devices:
        report.add("devices", "FAIL", "no booted simulator")
        return
    if len(devices) == 1:
        report.add("devices", "PASS", f"one booted simulator: {devices[0]['name']} ({devices[0]['udid']})")
        return
    if os.environ.get("TEST_FORGE_DEVICE_UDID"):
        report.add("devices", "PASS", f"{len(devices)} booted, pinned by TEST_FORGE_DEVICE_UDID="
                                      f"{os.environ['TEST_FORGE_DEVICE_UDID']}")
        return
    names = ", ".join(f"{device['name']} ({device['udid'][:8]})" for device in devices)
    report.add("devices", "FAIL", f"{len(devices)} simulators booted with no TEST_FORGE_DEVICE_UDID: {names}. "
                                  "Host-side commands resolve `booted` to whichever simctl picks, so a "
                                  "recording can land on the wrong device with nothing reporting it.")


def gate_data(report: Report, session: dict[str, Any] | None, source: str) -> None:
    if session is None:
        report.add("data", "FAIL", f"no {source} — the app has never written mock state. "
                                   "Relaunch the app, then re-run.")
        return
    mocks = session.get("mocks") or []
    enabled = [mock for mock in mocks if mock.get("isEnabled")]
    if not session.get("isMockingEnabled"):
        report.add("data", "FAIL", f"mocking is switched off ({len(mocks)} rule(s) on file). "
                                   "Enable it before arming anything.")
        return
    if not enabled:
        report.add("data", "FAIL", f"{len(mocks)} rule(s) on file, none enabled — the app is serving "
                                   "live traffic. One malformed rule makes the app drop every rule, "
                                   "so check the schema gate below before re-authoring.")
        return
    report.add("data", "PASS", f"{len(enabled)}/{len(mocks)} rule(s) enabled, mocking on",
               enabledRules=len(enabled), totalRules=len(mocks))
    report.add("data-live", "WARN", "this is the session *file*. What the running app holds can "
                                    "differ — confirm with the data channel's own rule count "
                                    "(`lens_live`).")


def gate_container(report: Report, container: Path, claimed: str | None, bundle_id: str) -> None:
    """The stale-container trap, made visible.

    An MCP resolves the container once and keeps reporting it. Reads then answer "no trace" for a
    trace sitting in the new container, writes land where the app will never read them, and the live
    channel keeps saying "on" throughout. Pass `--mcp-container` with the path the channel printed
    and this becomes a direct comparison; without it, the newest trace on disk is the tell.
    """
    if claimed:
        if Path(claimed).resolve() == container.resolve():
            report.add("container", "PASS", f"data channel and simctl agree on {container.name}")
        else:
            report.add("container", "FAIL",
                       f"data channel holds {Path(claimed).name}, simctl says {container.name}. "
                       "Reconnect the MCP (`/mcp`) — a symlink bridge goes stale on the next reinstall.")
        return

    siblings = sorted(container.parent.glob(f"*/{LENS_RELATIVE}/trace*.ndjson"),
                      key=lambda path: path.stat().st_mtime, reverse=True)
    if not siblings:
        report.add("container", "WARN", f"no trace under any container for {bundle_id}; "
                                        f"simctl resolves {container.name}")
        return
    # the trace file sits three directories inside the container, so the container is that many
    # parents up — hardcoding an index printed "Library" as if it were a container.
    newest = siblings[0].parents[len(Path(LENS_RELATIVE).parts)]
    if newest.resolve() != container.resolve():
        report.add("container", "WARN",
                   f"simctl resolves {container.name} but the newest trace is under {newest.name}. "
                   "Harmless if that container is a previous install — a red flag if the app is "
                   "running now. Compare against the data channel's resolved path.")
        return
    report.add("container", "PASS", f"{container.name} holds the newest trace; pass --mcp-container "
                                    "to compare against the channel's own path")


def validate_rule(rule: dict[str, Any], index: int) -> list[str]:
    """Why a hand-written rule takes the whole rule set down with it.

    The app decodes the rule array as a unit: one rule missing `exhaustion`, or carrying a variant id
    that is not a UUID, and *every* rule is dropped — including the six that were fine. Nothing is
    logged. So a candidate rule is validated against the shape the app itself writes before it is
    ever installed.
    """
    label = rule.get("endpointKey") or f"rule[{index}]"
    problems = []
    for key in REQUIRED_RULE_KEYS:
        if key not in rule:
            problems.append(f"{label}: missing `{key}`")
    for key in ("id", "activeVariantID"):
        value = rule.get(key)
        if value is not None and not UUID.match(str(value)):
            problems.append(f"{label}: `{key}` is not a UUID ({value!r})")
    variants = rule.get("variants")
    if not isinstance(variants, list) or not variants:
        problems.append(f"{label}: `variants` must be a non-empty list")
        return problems
    ids = set()
    for position, variant in enumerate(variants):
        name = variant.get("name") or f"variant[{position}]"
        for key in REQUIRED_VARIANT_KEYS:
            if key not in variant:
                problems.append(f"{label}/{name}: missing `{key}`")
        if variant.get("id") is not None and not UUID.match(str(variant.get("id"))):
            problems.append(f"{label}/{name}: `id` is not a UUID ({variant.get('id')!r})")
        if not variant.get("steps"):
            problems.append(f"{label}/{name}: `steps` is empty")
        ids.add(str(variant.get("id")))
    active = str(rule.get("activeVariantID"))
    if active not in ids:
        problems.append(f"{label}: `activeVariantID` {active} matches none of its {len(ids)} variant id(s)")
    return problems


def gate_schema(report: Report, rules: list[dict[str, Any]], candidate: Path | None, source: str = "session file") -> None:
    rules = list(rules)
    if candidate:
        loaded = json.loads(candidate.read_text())
        extra = loaded if isinstance(loaded, list) else loaded.get("mocks") or [loaded]
        rules += extra
        source = f"session file + {candidate.name}"
    if not rules:
        report.add("schema", "SKIP", "no rules to validate")
        return
    problems = [problem for index, rule in enumerate(rules) for problem in validate_rule(rule, index)]
    if problems:
        report.add("schema", "FAIL", f"{len(problems)} problem(s) across {len(rules)} rule(s) ({source}); "
                                     "the app drops every rule when one is malformed",
                   problems=problems[:12])
        return
    report.add("schema", "PASS", f"{len(rules)} rule(s) valid ({source})")


def age_of(started_at: str | None) -> float | None:
    if not started_at:
        return None
    try:
        moment = datetime.fromisoformat(str(started_at).replace("Z", "+00:00"))
    except ValueError:
        return None
    return (datetime.now(timezone.utc) - moment).total_seconds()


def gate_mock_proof(report: Report, lens_dir: Path, endpoints: list[str], max_age: float) -> None:
    """The gate that matters most, and the only one the app itself cannot fake.

    A data channel reporting an armed variant while the app talks to the real backend has cost this
    project more time than every screen-layer bug combined. `isMockServed` on the endpoint just armed
    is the answer, and it has to be recent: a hit from the previous app run says nothing about this one.

    `lens_dir` is whatever `dataplane.trace_dir()` resolved — the NetworkLens directory under the
    booted simulator's container. It is just a directory holding `trace*.ndjson`.
    """
    if not endpoints:
        report.add("mock-proof", "SKIP", "no --endpoint given; nothing armed to prove")
        return
    if not any(lens_dir.glob("trace*.ndjson")):
        report.add("mock-proof", "FAIL", f"no trace under {lens_dir}")
        return
    rows = exchanges(lens_dir)
    for endpoint in endpoints:
        matching = [row for row in rows
                    if str(row.get("endpointKey", "")).split("?")[0].rstrip("/").endswith(endpoint.rstrip("/"))]
        if not matching:
            report.add("mock-proof", "FAIL", f"{endpoint}: never appears in the trace — the screen has "
                                             "not called it yet, so nothing is proven either way",
                       endpoint=endpoint)
            continue
        latest = matching[-1]
        age = age_of(latest.get("startedAt"))
        if not latest.get("isMockServed"):
            report.add("mock-proof", "FAIL", f"{endpoint}: last call was served LIVE, not mocked "
                                             f"(status {latest.get('response', {}).get('statusCode')}). "
                                             "No case may run against this endpoint.", endpoint=endpoint)
            continue
        if age is not None and age > max_age:
            report.add("mock-proof", "WARN", f"{endpoint}: mock-served, but {age / 60:.0f} min ago — "
                                             "that is a previous app run. Re-exercise the screen.",
                       endpoint=endpoint, ageSeconds=round(age))
            continue
        when = f"{age:.0f}s ago" if age is not None else "time unknown"
        report.add("mock-proof", "PASS", f"{endpoint}: isMockServed true, {when}", endpoint=endpoint)


def gate_fixtures(report: Report, manifest: Path | None, responses_dir: Path | None, source_root: Path) -> None:
    """Unexercisable cases are cheaper to know about now than to discover as a false discrepancy."""
    if not manifest or not responses_dir:
        report.add("fixtures", "SKIP", "no --manifest/--responses-dir given")
        return
    script = Path(__file__).parent / "check_baseline.py"
    result = subprocess.run([sys.executable, str(script), "--manifest", str(manifest),
                             "--responses-dir", str(responses_dir), "--source-root", str(source_root)],
                            capture_output=True, text=True)
    output = (result.stdout + result.stderr).strip()
    findings = [line.strip() for line in output.splitlines() if line.strip().startswith("!")]
    match = re.search(r"(\d+) finding\(s\)", output)
    count = int(match.group(1)) if match else len(findings)
    if result.returncode != 0:
        report.add("fixtures", "FAIL", f"check_baseline.py exited {result.returncode}: {output[-300:]}")
        return
    status = "WARN" if count else "PASS"
    report.add("fixtures", status,
               f"{count} baseline finding(s) — a field absent or redacted makes any case asserting on "
               "it unexercisable, so mark those before running" if count else "baselines clean",
               findings=findings[:12])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--driver-url", default=DEFAULT_DRIVER)
    parser.add_argument("--driver-timeout", type=float, default=60.0)
    parser.add_argument("--endpoint", action="append", default=[],
                        help="Endpoint that should be answering from a mock. Repeatable.")
    parser.add_argument("--mcp-container", help="Container path the data channel reports, for comparison.")
    parser.add_argument("--mcp-media-root", help="Media root test_forge_status reports, for comparison against "
                                                 "where the runner actually writes screenshots.")
    parser.add_argument("--rule", type=Path, help="Candidate rule (or rule array) to validate before installing.")
    parser.add_argument("--manifest", type=Path)
    parser.add_argument("--responses-dir", type=Path)
    parser.add_argument("--source-root", type=Path, default=Path("."),
                        help="App Swift source dir, for the fixtures gate's model lookup.")
    parser.add_argument("--project-root", type=Path, default=Path("."),
                        help="Project git root (holds .claude/), for the skill-audit gate.")
    parser.add_argument("--platform", default="ios", choices=("ios", "android", "web"))
    parser.add_argument("--max-trace-age", type=float, default=DEFAULT_TRACE_AGE)
    parser.add_argument("--skip", action="append", default=[], choices=(
        "skill-audit", "devices", "driver", "media", "data", "container", "schema", "mock-proof", "fixtures"),
        help="Gate to skip. Use sparingly and say so in the run's notes — this stage exists because "
             "the failures it catches are the ones that report success.")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    report = Report()

    # `session` is NetworkLens's session file under the booted simulator's container — the only
    # data plane (`simctl`, alias `networklens`); `container_path()` fails loudly on any other value.
    container = container_path(args.bundle_id)
    if container is None:
        report.add("container", "FAIL", f"no booted simulator with {args.bundle_id} installed")
        session, session_source = None, "session file"
    else:
        session, session_path = read_session(container)
        session_source = f"session file at {session_path}"

    if "skill-audit" not in args.skip:
        gate_skill_audit(report, args.project_root, args.platform)
    if "devices" not in args.skip:
        gate_devices(report)
    if "driver" not in args.skip:
        gate_driver(report, args.driver_url.rstrip("/"), args.driver_timeout)
    if "media" not in args.skip:
        driver_gate = next((gate for gate in report.gates if gate["gate"] == "driver"), {})
        gate_media(report, driver_gate.get("path"), args.mcp_media_root)
    if container is not None:
        if "data" not in args.skip:
            gate_data(report, session, session_source)
        if "container" not in args.skip:
            gate_container(report, container, args.mcp_container, args.bundle_id)
        if "schema" not in args.skip:
            gate_schema(report, list((session or {}).get("mocks") or []), args.rule, source=session_source)
        if "mock-proof" not in args.skip:
            try:
                lens_dir = trace_dir(args.bundle_id)
            except SystemExit as error:
                report.add("mock-proof", "FAIL", str(error))
            else:
                gate_mock_proof(report, lens_dir, args.endpoint, args.max_trace_age)
    if "fixtures" not in args.skip:
        gate_fixtures(report, args.manifest, args.responses_dir, args.source_root)
    for gate in args.skip:
        report.add(gate, "SKIP", "skipped on the command line")

    if args.json:
        print(json.dumps({"ok": not report.failed, "gates": report.gates}, indent=2))
    else:
        for gate in report.gates:
            print(f"  {STATUS_MARK.get(gate['status'], '?')} {gate['gate']:<12} {gate['status']:<5} {gate['detail']}")
            for problem in gate.get("problems") or gate.get("findings") or []:
                print(f"        {problem}")
        if report.failed:
            print(f"\n  BLOCKED — {len(report.failed)} gate(s) failed. No case runs until they pass: "
                  "every failure above is one that some status flag elsewhere reports as fine.")
        else:
            print("\n  Preflight clear.")
    return 1 if report.failed else 0


if __name__ == "__main__":
    sys.exit(main())
