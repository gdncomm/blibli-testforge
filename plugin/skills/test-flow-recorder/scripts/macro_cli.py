#!/usr/bin/env python3
"""Records a named, reusable sequence of test-forge-driver commands, for a test-case precondition to
reference later instead of re-describing the same taps every time.

This script never drives anything itself — it has no import of, and no call into, `queue_cli.py` or
the test-forge-driver command queue. The actual driving happens the ordinary way, through real
`mcp__test-forge-driver__*` tool calls Claude issues from an operator's narration (see `commands/test-forge-macro.md`);
this script only records what already happened, one step at a time, and later hands a saved
sequence back for splicing into a plan (see `SKILL.md`, Stage 3's "Rules for the plan itself").

A macro's *final* stored steps are bare command objects — exactly `contracts/commands.md`'s
`{kind, ...args}` shapes, nothing wrapping them — so a replay is indistinguishable from any other
plan step: executed and checked individually, never as one atomic batch. The *in-progress* recording
keeps each step's outcome alongside its command, so a person can review what actually happened during
capture; `record-stop` strips outcomes before finalizing, because a replay must re-execute and
re-check live — trusting an old outcome as a future guarantee is exactly the mistake this would be
built to make.

Storage path: `<root>/macros/<slug>.json`, where `<root>` is the caller-resolved
`<UITestRoot>/<Module>/<Submodule>` directory — the same Hard-Constraint-1 path convention every
other generated file in this skill already uses (see `scripts/classify_module.py`,
`scripts/build_evidence.py --out-dir`). This script does not resolve `<UITestRoot>` itself; the
caller passes the already-resolved directory, exactly as `build_evidence.py --out-dir` does.

Usage:
    macro_cli.py record-start <name> --root <dir> [--narration "..."]
    macro_cli.py record-step  <name> --root <dir> '<command-json>' '<outcome-json>'
    macro_cli.py record-stop  <name> --root <dir> [--narration "..."]
    macro_cli.py resolve      <name> (--root <dir> | --search-root <dir>)
    macro_cli.py list         (--root <dir> | --search-root <dir>)

`--root` names one exact `<Module>/<Submodule>` directory. `--search-root` names `<UITestRoot>`
itself and searches every `*/macros/*.json` beneath it — for `resolve`/`list` only, when the caller
does not already know which module a macro lives under. A name matching more than one module under
`--search-root` is refused rather than guessed at: fail loudly, list every candidate.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
_SLUG_STRIP = re.compile(r"[^a-z0-9]+")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def git_user_name() -> str | None:
    """Hard Constraint 10's convention: every generated document names who ran the pass, defaulting
    to `git config user.name`. `None` when unset rather than a fabricated placeholder."""
    result = subprocess.run(["git", "config", "user.name"], capture_output=True, text=True)
    name = result.stdout.strip()
    return name or None


def slug_for(name: str) -> str:
    slug = _SLUG_STRIP.sub("-", name.strip().lower()).strip("-")
    if not slug:
        raise SystemExit(f"macro name {name!r} has no usable characters for a filename")
    return slug


def write_out(path: Path, document: dict[str, Any]) -> None:
    """Whole-file replace through a temporary, so a crash mid-write cannot leave a half-written macro."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def recording_path(root: Path, slug: str) -> Path:
    return root / "macros" / f"{slug}.recording.json"


def final_path(root: Path, slug: str) -> Path:
    return root / "macros" / f"{slug}.json"


def cmd_record_start(args: argparse.Namespace) -> int:
    root = Path(args.root)
    slug = slug_for(args.name)
    path = recording_path(root, slug)
    if path.exists():
        print(f"  ! replacing an already in-progress recording for {args.name!r} at {path}", file=sys.stderr)
    document = {
        "schemaVersion": SCHEMA_VERSION,
        "name": args.name,
        "startedAt": now(),
        "narration": args.narration or "",
        "steps": [],
    }
    write_out(path, document)
    print(f"recording started: {args.name!r} -> {path}")
    return 0


def cmd_record_step(args: argparse.Namespace) -> int:
    root = Path(args.root)
    slug = slug_for(args.name)
    path = recording_path(root, slug)
    if not path.exists():
        raise SystemExit(f"no recording in progress for {args.name!r} under {root} — run record-start first")
    document = json.loads(path.read_text())
    try:
        command = json.loads(args.command_json)
        outcome = json.loads(args.outcome_json)
    except json.JSONDecodeError as error:
        raise SystemExit(f"command/outcome must each be valid JSON: {error}")
    document["steps"].append({"command": command, "outcome": outcome, "recordedAt": now()})
    write_out(path, document)
    index = len(document["steps"])
    kind = command.get("kind", "?")
    warning = ""
    if isinstance(outcome, dict) and (outcome.get("error") or outcome.get("found") is False
                                      or outcome.get("exists") is False or outcome.get("hittable") is False):
        warning = "  ! this step's outcome looks like a failure — consider stopping and asking " \
                 "before recording more, rather than capturing a broken macro"
    print(f"  + step {index}: {kind}{warning}")
    return 0


def cmd_record_stop(args: argparse.Namespace) -> int:
    root = Path(args.root)
    slug = slug_for(args.name)
    in_progress = recording_path(root, slug)
    if not in_progress.exists():
        raise SystemExit(f"no recording in progress for {args.name!r} under {root}")
    document = json.loads(in_progress.read_text())
    steps = [entry["command"] for entry in document["steps"]]
    final_document = {
        "schemaVersion": SCHEMA_VERSION,
        "name": document["name"],
        "recordedAt": now(),
        "recordedBy": git_user_name(),
        "module": "/".join(root.parts[-2:]) if len(root.parts) >= 2 else root.name,
        "narration": args.narration or document.get("narration") or "",
        "steps": steps,
    }
    out_path = final_path(root, slug)
    write_out(out_path, final_document)
    in_progress.unlink()
    kinds = " -> ".join(step.get("kind", "?") for step in steps)
    print(f"macro saved: {document['name']!r} · {len(steps)} step(s) · {out_path}")
    if kinds:
        print(f"  {kinds}")
    return 0


def _candidates(search_root: Path, slug: str) -> list[Path]:
    return sorted(search_root.glob(f"*/*/macros/{slug}.json"))


def cmd_resolve(args: argparse.Namespace) -> int:
    slug = slug_for(args.name)
    if args.root:
        path = final_path(Path(args.root), slug)
        if not path.exists():
            raise SystemExit(f"no macro named {args.name!r} under {args.root}")
    else:
        matches = _candidates(Path(args.search_root), slug)
        if not matches:
            raise SystemExit(f"no macro named {args.name!r} found under any macros/ folder in {args.search_root}")
        if len(matches) > 1:
            listing = "\n".join(f"  - {match}" for match in matches)
            raise SystemExit(f"macro name {args.name!r} is ambiguous — found under more than one "
                             f"module, pass --root to pick one:\n{listing}")
        path = matches[0]
    document = json.loads(path.read_text())
    print(json.dumps(document["steps"]))
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    if args.root:
        paths = sorted(Path(args.root).glob("macros/*.json"))
    else:
        paths = sorted(Path(args.search_root).glob("*/*/macros/*.json"))
    if not paths:
        print("no macros found")
        return 0
    for path in paths:
        document = json.loads(path.read_text())
        print(f"{document.get('name', path.stem)} · {len(document.get('steps', []))} step(s) · {path}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    subparsers = parser.add_subparsers(dest="verb", required=True)

    start = subparsers.add_parser("record-start")
    start.add_argument("name")
    start.add_argument("--root", required=True)
    start.add_argument("--narration")
    start.set_defaults(func=cmd_record_start)

    step = subparsers.add_parser("record-step")
    step.add_argument("name")
    step.add_argument("--root", required=True)
    step.add_argument("command_json")
    step.add_argument("outcome_json")
    step.set_defaults(func=cmd_record_step)

    stop = subparsers.add_parser("record-stop")
    stop.add_argument("name")
    stop.add_argument("--root", required=True)
    stop.add_argument("--narration")
    stop.set_defaults(func=cmd_record_stop)

    resolve = subparsers.add_parser("resolve")
    resolve.add_argument("name")
    resolve_group = resolve.add_mutually_exclusive_group(required=True)
    resolve_group.add_argument("--root")
    resolve_group.add_argument("--search-root")
    resolve.set_defaults(func=cmd_resolve)

    list_parser = subparsers.add_parser("list")
    list_group = list_parser.add_mutually_exclusive_group(required=True)
    list_group.add_argument("--root")
    list_group.add_argument("--search-root")
    list_parser.set_defaults(func=cmd_list)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
