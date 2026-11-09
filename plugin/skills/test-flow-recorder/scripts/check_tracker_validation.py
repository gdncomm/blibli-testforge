#!/usr/bin/env python3
"""Checks a case's tracker fires against a TRMS-derived payload contract, per case window.

Same shape as `check_network_trail.py`, one level down: that script checks a case's whole API
surface against the trace; this one checks a case's *trackers* — the TRMS ids it names — against
the trace's tracker fires and a payload contract sourced from TRMS itself, not hand-typed.

**Per-case window**, same convention as `check_network_trail.py`: a case is only checked when its
result entry in `results.json` carries both `networkWindowStart` and `networkWindowEnd`. A case
missing either field gets no `trackerTrail` key at all — this script and `build_evidence.py` both
read that as **never checked**, not as clean, the same absent-vs-empty rule `evidenceIntegrity`
and `networkTrail` already use.

**Which TRMS ids a case exercises**: `parse_test_cases.py`'s `trmsIds` field, populated from a
tracker column the tester tags each case with — not a separately hand-maintained mapping file.

**Where the payload contract comes from**: this script does not parse TRMS pages itself. It shells
out to the host project's own already-built, tested extractor —
`.claude/skills/ios-analytics-tracker/scripts/extract_webarchive_contract.py` — which reads a
tester-saved `.webarchive`/`.html` snapshot of a TRMS tracker-detail page and returns a
cross-validated `{event, datalayer_params, params, warnings}` per id (see that script's own
docstring for how it cross-checks the dataLayer script against the parameter table). Snapshots are
looked up by id under `--snapshot-dir` (default: `$TEST_FORGE_MEDIA_ROOT/trms/`, the same media-root
convention screenshots and recordings already use), as `<TRMS-ID>.webarchive` or `.html`/`.htm`.

**Contract derivation, and its one known gap**: the extractor's `datalayer_params` holds only the
dataLayer script's flat, string-valued keys (`origin_screen`, `component`, ...) — every one of
those becomes both `required` and `expect` (TRMS's own worked example is the exact value a real
fire is expected to carry). An `items[]`-nested value (a products-list tracker's `items` array) is
never a plain string, so the extractor cannot parse it as a `key: "value"` pair either — it shows
up in that id's `warnings` as a skipped key, not as a silently-passed check. **Item-level fields
are not checked by this script yet** — flagged, not guessed at, pending a real multi-item TRMS
sample to verify the table's row shape against.

**Duplicate fires**: when a TRMS id fires more than once in a case's window, each hit's payload is
hashed (exact JSON equality) and repeats are counted into `entry["duplicateFires"]`. This tells a
true duplicate (the same event posted twice for the same element — a real double-fire bug) from a
legitimate multi-fire (a list-impression tracker firing once per distinct card/item in view, each
with different `items`/`component` content) apart, rather than flagging any `fired > 1` on sight.
**Known limitation**: two genuinely distinct fires that happen to serialize identically (e.g. two
items with the same displayed content) would read as one duplicate — flagged here, not silently
assumed away, same posture as the `items[]` gap above.

**This is informational, never a verdict change** — same reasoning as `check_network_trail.py`:
whether a tracker problem is a test-writing gap, an app bug, or a stale TRMS page is a call for a
person, exactly the class `contracts/healing.md` sends to adjudication rather than resolving
automatically.

Usage:
    check_tracker_validation.py cases.json results.json --bundle-id com.example.app
    check_tracker_validation.py cases.json results.json --trace <dir> \\
        --snapshot-dir ~/Documents/TestForge-Test/trms --format markdown
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))
from dataplane import trace_dir  # noqa: E402
from extract_trackers import check_contract, collect, load_exchanges  # noqa: E402

BUNDLE_ID = os.environ.get("NETWORKLENS_BUNDLE_ID", "com.blibli.mobile")
MEDIA_ROOT = Path(os.environ.get("TEST_FORGE_MEDIA_ROOT") or (Path.home() / "Documents" / "TestForge-Test"))
SNAPSHOT_EXTENSIONS = (".webarchive", ".html", ".htm")
EXTRACTOR_RELATIVE = Path(".claude/skills/ios-analytics-tracker/scripts/extract_webarchive_contract.py")


def resolve_trace(explicit: str | None, bundle_id: str) -> Path:
    """Same seam every other trace-reading script in this skill uses."""
    return Path(explicit) if explicit else trace_dir(bundle_id)


def find_extractor(explicit: str | None) -> Path | None:
    """The host project's `extract_webarchive_contract.py`, discovered the same way `$LENS` is —
    under the project's own git root, not this plugin's. `None` when the host project doesn't ship
    one (a project without `ios-analytics-tracker` installed): callers skip with a clear reason
    rather than crashing."""
    if explicit:
        path = Path(explicit)
        return path if path.exists() else None
    try:
        result = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                                capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        return None
    if result.returncode != 0:
        return None
    candidate = Path(result.stdout.strip()) / EXTRACTOR_RELATIVE
    return candidate if candidate.exists() else None


def snapshot_path(snapshot_dir: Path, trms_id: str) -> Path | None:
    for ext in SNAPSHOT_EXTENSIONS:
        candidate = snapshot_dir / f"{trms_id}{ext}"
        if candidate.exists():
            return candidate
    return None


def extract_contracts(extractor: Path, paths: list[Path]) -> dict[str, dict[str, Any]]:
    """One subprocess call for every snapshot at once — the extractor's own batch mode — indexed
    by the TRMS id it reports for each `ok` result. A failed extraction is kept too, keyed by the
    input path's stem, so a caller can still say *why* a given id has no contract."""
    if not paths:
        return {}
    result = subprocess.run(
        [sys.executable, str(extractor), *[str(path) for path in paths]],
        capture_output=True, text=True, timeout=30,
    )
    try:
        parsed = json.loads(result.stdout)
    except json.JSONDecodeError:
        return {path.stem: {"status": "extraction_failed",
                            "reason": f"extractor produced no valid JSON: {result.stderr.strip()[:200]}"}
                for path in paths}
    by_id: dict[str, dict[str, Any]] = {}
    for entry, path in zip(parsed, paths):
        key = entry.get("trms_id") or path.stem
        by_id[key] = entry
    return by_id


def build_rule(extracted: dict[str, Any]) -> dict[str, Any]:
    """`extract_trackers.check_contract`'s rule shape (event/origin_screen/required/expect), from
    one `ok` extractor result. Only top-level, string-valued dataLayer params are covered — see
    this module's docstring for why `items[]`-nested fields are excluded rather than guessed at."""
    params = dict(extracted.get("datalayer_params") or {})
    origin_screen = params.pop("origin_screen", None)
    params.pop("trms_id", None)
    return {
        "event": extracted.get("event"),
        "origin_screen": origin_screen,
        "required": sorted(params),
        "expect": dict(params),
    }


def _parse_instant(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def load_results(path: Path) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    loaded = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(loaded, dict):
        return list(loaded.get("results") or []), dict(loaded)
    return list(loaded), {}


def write_results(path: Path, results: list[dict[str, Any]], envelope: dict[str, Any]) -> None:
    if envelope:
        envelope["results"] = results
        path.write_text(json.dumps(envelope, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    else:
        path.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def check_case(result: dict[str, Any], case: dict[str, Any], fires: dict[str, list[dict[str, Any]]],
              contracts: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    """The `trackerTrail` finding for one case, or `None` when it has no window to check."""
    start = _parse_instant(result.get("networkWindowStart"))
    end = _parse_instant(result.get("networkWindowEnd"))
    if start is None or end is None:
        return None

    trms_ids = case.get("trmsIds") or []

    def in_window(hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [hit for hit in hits
               if (started := _parse_instant(hit.get("startedAt"))) is not None and start <= started <= end]

    finding: dict[str, Any] = {
        "window": {"start": result["networkWindowStart"], "end": result["networkWindowEnd"]},
        "expected": trms_ids,
        "trackers": {},
    }
    for trms_id in trms_ids:
        hits_in_window = in_window(fires.get(trms_id, []))
        entry: dict[str, Any] = {"fired": len(hits_in_window)}

        if len(hits_in_window) > 1:
            signatures: "OrderedDict[str, int]" = OrderedDict()
            for hit in hits_in_window:
                signature = json.dumps(hit["body"].get("payload"), sort_keys=True, default=str)
                signatures[signature] = signatures.get(signature, 0) + 1
            duplicates = sum(count - 1 for count in signatures.values() if count > 1)
            if duplicates:
                entry["duplicateFires"] = duplicates

        extracted = contracts.get(trms_id)
        if extracted is None:
            entry["contractError"] = "no saved TRMS snapshot found for this id under --snapshot-dir"
        elif extracted.get("status") != "ok":
            entry["contractError"] = extracted.get("reason", "extraction_failed")
        else:
            entry["extractorWarnings"] = list(extracted.get("warnings") or [])
            if hits_in_window:
                rule = build_rule(extracted)
                problems: "OrderedDict[str, int]" = OrderedDict()
                for hit in hits_in_window:
                    for problem in check_contract(hit, rule):
                        problems[problem] = problems.get(problem, 0) + 1
                if problems:
                    entry["problems"] = [f"{problem}" + (f" ({count}x)" if count > 1 else "")
                                         for problem, count in problems.items()]
        finding["trackers"][trms_id] = entry

    # An id nobody named on this case, firing inside its window anyway — usually a copy-pasted
    # TRMS id in the tracker code, and a real defect even when everything expected also fired.
    # Same "fired but not on the list" idea `extract_trackers.py`'s own report already surfaces,
    # scoped here to one case's window instead of a whole session.
    unexpected = sorted(trms_id for trms_id in fires if trms_id not in trms_ids and in_window(fires[trms_id]))
    if unexpected:
        finding["unexpectedTrmsIds"] = [{"trmsId": trms_id, "fired": len(in_window(fires[trms_id]))}
                                        for trms_id in unexpected]
    return finding


def render_markdown(findings: dict[str, dict[str, Any]], checked_total: int, unchecked: list[str],
                    no_trms: list[str]) -> str:
    lines = ["# Tracker Trail", "",
             f"{checked_total} case(s) checked, "
             f"{len(unchecked)} not checked (no network window recorded), "
             f"{len(no_trms)} named no TRMS id.", ""]
    flagged = {case_id: finding for case_id, finding in findings.items()
              if finding.get("unexpectedTrmsIds")
              or any(entry.get("fired") == 0 or entry.get("problems") or entry.get("contractError")
                     or entry.get("duplicateFires")
                     for entry in finding["trackers"].values())}
    if not flagged:
        lines.append("Every checked case's named trackers fired with no contract problems.")
        return "\n".join(lines)

    lines += ["| Test Case ID | TRMS ID | Fired | Problems |", "|---|---|---|---|"]
    for case_id, finding in flagged.items():
        for trms_id, entry in finding["trackers"].items():
            parts = []
            if not entry.get("fired"):
                parts.append("**did not fire in window**")
            if entry.get("contractError"):
                parts.append(f"_no contract: {entry['contractError']}_")
            if entry.get("problems"):
                parts.append("; ".join(entry["problems"]))
            if entry.get("duplicateFires"):
                parts.append(f"_{entry['duplicateFires']} duplicate fire(s) — identical payload "
                             "posted more than once_")
            if not parts:
                continue
            lines.append(f"| {case_id} | {trms_id} | {entry.get('fired', 0)} | {'; '.join(parts)} |")
        for extra in finding.get("unexpectedTrmsIds") or []:
            lines.append(f"| {case_id} | {extra['trmsId']} | {extra['fired']} "
                         "| _fired but not on this case's list_ |")
    lines.append("")
    lines.append("Informational only — none of this changes a case's verdict. Same reasoning as "
                 "the Network trail gate: whether a miss is a test-writing gap, an app bug, or a "
                 "stale TRMS page is a call for a person, per `contracts/healing.md`.")
    return "\n".join(lines)


def write_report(text: str, out_path: str | None) -> None:
    if not out_path:
        print(text)
        return
    destination = Path(out_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(text + "\n", encoding="utf-8")
    print(f"Wrote {destination}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("cases", type=Path)
    parser.add_argument("results", type=Path, help="mutated in place — each checked case gains a `trackerTrail` field")
    parser.add_argument("--trace", help="directory holding trace*.ndjson; defaults to the active "
                        "TEST_FORGE_DATA_PLANE's resolved trace dir")
    parser.add_argument("--bundle-id", default=BUNDLE_ID,
                        help="app bundle id, when the data plane needs one to resolve a trace dir "
                        "(default: %(default)s, or $NETWORKLENS_BUNDLE_ID)")
    parser.add_argument("--snapshot-dir", type=Path, default=MEDIA_ROOT / "trms",
                        help="directory holding <TRMS-ID>.webarchive/.html snapshots "
                        "(default: $TEST_FORGE_MEDIA_ROOT/trms)")
    parser.add_argument("--extractor", help="path to extract_webarchive_contract.py, overriding "
                        "discovery under the host project's own git root "
                        f"({EXTRACTOR_RELATIVE})")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--out", help="write the summary report here instead of stdout")
    args = parser.parse_args()

    cases = {case["caseId"]: case for case in json.loads(args.cases.read_text(encoding="utf-8"))}
    results, envelope = load_results(args.results)

    trace_path = resolve_trace(args.trace, args.bundle_id)
    exchanges, _sessions = load_exchanges(trace_path)
    fires = collect(exchanges)

    all_trms_ids = sorted({trms_id for case in cases.values() for trms_id in (case.get("trmsIds") or [])})
    extractor = find_extractor(args.extractor)
    contracts: dict[str, dict[str, Any]] = {}
    if extractor is None and all_trms_ids:
        print(f"! no extract_webarchive_contract.py found (looked under {EXTRACTOR_RELATIVE} from "
              "the host project's git root) — every tracker check will report a missing contract",
              file=sys.stderr)
    elif all_trms_ids:
        paths = [path for trms_id in all_trms_ids
                if (path := snapshot_path(args.snapshot_dir, trms_id)) is not None]
        missing = [trms_id for trms_id in all_trms_ids if snapshot_path(args.snapshot_dir, trms_id) is None]
        if missing:
            print(f"! no saved snapshot under {args.snapshot_dir} for: {', '.join(missing)}", file=sys.stderr)
        contracts = extract_contracts(extractor, paths)

    findings: dict[str, dict[str, Any]] = {}
    unchecked: list[str] = []
    no_trms: list[str] = []
    for result in results:
        case = cases.get(result.get("caseId"), {})
        if not case.get("trmsIds"):
            no_trms.append(result.get("caseId", "?"))
        finding = check_case(result, case, fires, contracts)
        if finding is None:
            unchecked.append(result.get("caseId", "?"))
            continue
        result["trackerTrail"] = finding
        findings[result["caseId"]] = finding

    write_results(args.results, results, envelope)

    if args.format == "json":
        write_report(json.dumps({"trace": str(trace_path), "checked": findings,
                                 "unchecked": unchecked, "noTrmsId": no_trms},
                                indent=2, ensure_ascii=False), args.out)
    else:
        write_report(render_markdown(findings, len(findings), unchecked, no_trms), args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
