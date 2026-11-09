#!/usr/bin/env python3
"""Checks a case's whole API surface against the trace, not just the one endpoint its precondition names.

`preflight.py`'s `gate_mock_proof` proves the ONE endpoint a case's precondition arms was actually
mock-served, before the case runs. Nothing else in this skill checks a case as a whole: whether an
endpoint it expected to call never fired (missing), whether one fired that nothing expected
(unexpected), or whether one fired more times than it should have (duplicate). This script is that
check, run after a case executes rather than before — it needs the trace of what actually happened,
which does not exist yet at preflight time.

Same problem shape as `extract_trackers.py` (expected-set vs observed-set over a trace), and
deliberately keeps its own fold-by-id trace loader rather than reusing `dataplane.py`'s `exchanges()`:
an append-and-revise trace can carry more than one line for the same exchange id (a later `edit`),
and counting lines instead of folded exchanges would report a revised response as a duplicate call
that never happened. `extract_trackers.py` already had to solve this for the same reason; this script
copies that fold rather than inventing a different one.

**Per-case window.** A case is only checked when its result entry in `results.json` carries both
`networkWindowStart` and `networkWindowEnd` — ISO-8601 timestamps recorded by whatever drove the run,
bracketing that case's own commands (same manual convention as recording `screenshots`/`video`
paths; nothing in the harness stamps these automatically today). A case missing either field is left
alone entirely: no `networkTrail` key is written, which this script and `build_evidence.py` both read
as **never checked**, not as clean — the same absent-vs-empty convention `evidenceIntegrity` already
uses in `contracts/evidence.md`.

**Expected set.** Parsed from the case's own `api` column (`cases.json`, from `parse_test_cases.py`)
by regex, looking for `METHOD /path` tokens and normalising each through `dataplane.endpoint_key()`.
A case whose `api` column is prose only ("the product listing endpoint") yields zero tokens — for
that case `missing` and `unexpected` are not computed at all (the key is left out of the finding,
not set to `[]`, so a reader cannot mistake "nothing to check" for "checked, zero problems").
`duplicates` still runs even then: a duplicate fire is a defect regardless of whether anyone wrote
down what to expect.

**This is informational, never a verdict change.** A missing or unexpected call is a real gap
worth a human's attention, but this script does not know whether it is a test-writing gap, an app
bug, or a legitimate call the case's `api` column simply didn't mention — that call belongs to a
person, the same way `contracts/healing.md` sends an expectation mismatch to adjudication rather
than auto-resolving it. This script only ever adds a `networkTrail` field; it never touches
`verdict`.

Usage:
    check_network_trail.py cases.json results.json --bundle-id com.example.bazaar
    check_network_trail.py cases.json results.json --trace <dir the data plane reports> \\
        --ignore-endpoints "GET /config,GET /health" --format markdown
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, OrderedDict
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))
from dataplane import endpoint_key, trace_dir  # noqa: E402

BUNDLE_ID = os.environ.get("NETWORKLENS_BUNDLE_ID", "com.blibli.mobile")

_METHOD_PATH = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE)\s+(\S+)", re.IGNORECASE)
# Trailing prose punctuation a case's free-text column tends to glue onto a path with no space
# ("GET /products/{id}."). `}` is deliberately excluded — it closes a `{id}`-style template segment,
# a real character in the path itself, not punctuation wrapping it.
_TRAILING_PUNCTUATION = ".,;:)]"


def resolve_trace(explicit: str | None, bundle_id: str) -> Path:
    """Same seam as `extract_trackers.py`'s `resolve_trace` — `--trace` escape hatch, else the
    active `TEST_FORGE_DATA_PLANE`'s resolved directory."""
    return Path(explicit) if explicit else trace_dir(bundle_id)


def load_exchanges(lens_dir: Path) -> "OrderedDict[str, dict[str, Any]]":
    """Every exchange, folded by id — last line wins.

    Deliberately not `dataplane.exchanges()`: that function is for callers who only care about
    recency (`preflight.py`), and it returns one row per *line*, not per exchange. An edited exchange
    would then look like two calls to the same endpoint, which is exactly the false positive a
    duplicate-call check exists to avoid.
    """
    traces = sorted((path for path in lens_dir.glob("trace*.ndjson") if path.is_file()),
                     key=lambda path: path.stat().st_mtime)
    if not traces:
        sys.exit(f"No trace under {lens_dir}\nIs the app running with tracing on?")
    collapsed: "OrderedDict[str, dict[str, Any]]" = OrderedDict()
    for path in traces:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                exchange = record.get("exchange")
                if not isinstance(exchange, dict) or "id" not in exchange:
                    continue
                collapsed[exchange["id"]] = exchange
    return collapsed


def _bare_path(raw: str) -> str:
    """Strips a scheme+host and a query/fragment, so a case document's own free-text URL normalises
    the same way a trace exchange's `pathname` already does before either reaches `endpoint_key()`."""
    path = raw.rstrip(_TRAILING_PUNCTUATION)
    if "://" in path:
        path = path.split("://", 1)[1]
        path = path[path.index("/"):] if "/" in path else "/"
    return path.split("?", 1)[0].split("#", 1)[0]


def expected_endpoints(api_text: str) -> list[str]:
    """`METHOD /path` tokens in a case's own `api` column, normalised to endpoint keys, in the order
    they appear, deduplicated. Empty when the column is prose with nothing machine-checkable in it."""
    seen: "OrderedDict[str, None]" = OrderedDict()
    for method, raw_path in _METHOD_PATH.findall(api_text or ""):
        key = endpoint_key(method, _bare_path(raw_path))
        seen.setdefault(key, None)
    return list(seen)


def _parse_instant(value: Any) -> datetime | None:
    """Real datetime comparison, not string comparison — two ISO timestamps of different precision
    (`...Z` vs `...123Z` vs a naive string) do not always sort the way they compare lexicographically."""
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
    """Same bare-array-or-envelope shape `build_evidence.py`'s `read_results` reads."""
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


def check_case(result: dict[str, Any], case: dict[str, Any],
               exchanges: "OrderedDict[str, dict[str, Any]]",
               ignored: set[str]) -> dict[str, Any] | None:
    """The `networkTrail` finding for one case, or `None` when it has no window to check."""
    start = _parse_instant(result.get("networkWindowStart"))
    end = _parse_instant(result.get("networkWindowEnd"))
    if start is None or end is None:
        return None

    in_window = [exchange for exchange in exchanges.values()
                 if (started := _parse_instant(exchange.get("startedAt"))) is not None
                 and start <= started <= end]
    counts = Counter(exchange.get("endpointKey", "?") for exchange in in_window)

    expected = expected_endpoints(case.get("api", ""))
    finding: dict[str, Any] = {
        "window": {"start": result["networkWindowStart"], "end": result["networkWindowEnd"]},
        "expected": expected,
        "expectedUnparseable": not expected,
    }

    if expected:
        finding["missing"] = [key for key in expected if counts.get(key, 0) == 0]
        unexpected_keys = sorted(key for key in counts if key not in expected and key not in ignored)
        finding["unexpected"] = [{"endpointKey": key, "count": counts[key]} for key in unexpected_keys]

    finding["duplicates"] = [{"endpointKey": key, "count": count}
                             for key, count in sorted(counts.items()) if count > 1]
    return finding


def render_markdown(findings: dict[str, dict[str, Any]], checked_total: int, unchecked: list[str]) -> str:
    flagged = {case_id: finding for case_id, finding in findings.items()
              if finding.get("missing") or finding.get("unexpected") or finding.get("duplicates")}
    lines = ["# Network Trail", "",
             f"{checked_total} case(s) checked, {len(flagged)} with a finding.",
             (f"{len(unchecked)} case(s) not checked (no `networkWindowStart`/`networkWindowEnd` "
              f"recorded): {', '.join(unchecked)}" if unchecked else "Every case in this run recorded a window."),
             ""]
    if not flagged:
        return "\n".join(lines)
    lines += ["| Test Case ID | Missing | Unexpected | Duplicates |", "|---|---|---|---|"]
    for case_id, finding in flagged.items():
        missing = ", ".join(f"`{key}`" for key in finding.get("missing") or []) or "—"
        unexpected = ", ".join(f"`{item['endpointKey']}` ×{item['count']}"
                               for item in finding.get("unexpected") or []) or "—"
        duplicates = ", ".join(f"`{item['endpointKey']}` ×{item['count']}"
                               for item in finding.get("duplicates") or []) or "—"
        note = " _(api column not machine-parseable — missing/unexpected not checked)_" if finding.get(
            "expectedUnparseable") else ""
        lines.append(f"| {case_id} | {missing} | {unexpected} | {duplicates}{note} |")
    lines.append("")
    lines.append("Informational only — none of this changes a case's verdict. A missing or "
                 "unexpected call is a real gap, but whether it is a test-writing gap, an app bug, "
                 "or a call the `api` column simply didn't mention is a call for a person, the same "
                 "way `contracts/healing.md` sends an expectation mismatch to adjudication rather "
                 "than resolving it automatically.")
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
    parser.add_argument("results", type=Path, help="mutated in place — each checked case gains a `networkTrail` field")
    parser.add_argument("--trace", help="directory holding trace*.ndjson; defaults to the active "
                        "TEST_FORGE_DATA_PLANE's resolved trace dir")
    parser.add_argument("--bundle-id", default=BUNDLE_ID,
                        help="app bundle id, when the data plane needs one to resolve a trace dir "
                        "(default: %(default)s, or $NETWORKLENS_BUNDLE_ID)")
    parser.add_argument("--ignore-endpoints", help="comma-separated endpoint keys to exclude from "
                        "`unexpected` (e.g. a config poll or analytics beacon every case triggers)")
    parser.add_argument("--ignore-endpoints-file", help="file with one endpoint key per line, same as "
                        "--ignore-endpoints")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("--out", help="write the summary report here instead of stdout")
    args = parser.parse_args()

    ignored: set[str] = set()
    if args.ignore_endpoints:
        ignored |= {key.strip() for key in args.ignore_endpoints.split(",") if key.strip()}
    if args.ignore_endpoints_file:
        text = Path(args.ignore_endpoints_file).read_text(encoding="utf-8")
        ignored |= {line.strip() for line in text.splitlines() if line.strip() and not line.startswith("#")}

    cases = {case["caseId"]: case for case in json.loads(args.cases.read_text(encoding="utf-8"))}
    results, envelope = load_results(args.results)

    trace_path = resolve_trace(args.trace, args.bundle_id)
    exchanges = load_exchanges(trace_path)

    findings: dict[str, dict[str, Any]] = {}
    unchecked: list[str] = []
    for result in results:
        case = cases.get(result.get("caseId"), {})
        finding = check_case(result, case, exchanges, ignored)
        if finding is None:
            unchecked.append(result.get("caseId", "?"))
            continue
        result["networkTrail"] = finding
        findings[result["caseId"]] = finding

    write_results(args.results, results, envelope)

    if args.format == "json":
        write_report(json.dumps({"trace": str(trace_path), "checked": findings, "unchecked": unchecked},
                                indent=2, ensure_ascii=False), args.out)
    else:
        write_report(render_markdown(findings, len(findings), unchecked), args.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
