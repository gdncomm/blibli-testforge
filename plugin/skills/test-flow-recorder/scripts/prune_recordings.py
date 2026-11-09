#!/usr/bin/env python3
"""Leaves one recording per attempt in a case's media folder and deletes the rest, permanently.

A live run produces recordings a report has no use for: a clip that was already rolling while the
tree was dumped, a re-recording of an attempt that had to be restarted, a zero-byte file from a
`test_forge_stop_recording` that never got a `test_forge_start_recording`. Left alone they accumulate at roughly a
megabyte a second and a reviewer cannot tell which clip belongs to the verdict.

The rule is one clip per **attempt**, because `evidence.md` treats the attempt sequence as the proof
of what a heal changed — the before clip and the after clip are two different results, not two copies
of one. Everything else in the folder is a duplicate of an attempt, and duplicates go. A case that
passed first time therefore ends with exactly one recording, which is the common case.

`--only-final` collapses even the attempt sequence to the single clip matching the case's verdict.
That discards heal evidence, so it is a flag rather than the default.

Deletion is `unlink`: the file does not go to the Trash, because a Trash that fills with discarded
screen recordings is the same disk problem one directory over.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# `interacts` decides which cases owe a recording at all, and it has to be the *same* rule the report
# gates on — two copies of it would drift, and a pruner that disagreed with the gate would delete a
# clip the report then demands. The two scripts ship together, so this import is not optional.
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_evidence import interacts  # noqa: E402

RECORDING_SUFFIXES = (".mov", ".mp4")

# `<caseId>-attempt<N>-<verdict>.mp4`, the name `evidence.md` specifies. A file that does not match
# carries no attempt number, so it cannot be the recording of an attempt — it is a stray.
ATTEMPT_NAME = re.compile(r"^(?P<case>.+?)-attempt(?P<attempt>\d+)-(?P<verdict>[A-Za-z]+)\.(mov|mp4)$")


def recordings(folder: Path) -> list[Path]:
    return sorted(path for path in folder.iterdir()
                  if path.is_file() and path.suffix.lower() in RECORDING_SUFFIXES)


def attempt_of(path: Path) -> int | None:
    match = ATTEMPT_NAME.match(path.name)
    return int(match.group("attempt")) if match else None


def verdict_of(path: Path) -> str:
    match = ATTEMPT_NAME.match(path.name)
    return match.group("verdict").upper() if match else ""


def canonical(path: Path, case_id: str) -> bool:
    """`<caseId>.mov` — the name the recorder writes for the case itself."""
    return path.stem == case_id


def better(candidate: Path, incumbent: Path, case_id: str) -> bool:
    """Which of two clips of the same attempt to keep.

    The canonical name wins outright. Everything else in the folder got its name from a diagnosis
    pass or a restart, and a stray clip is routinely both the same length and *newer* than the real
    one — so ranking by size and time alone deletes the recording the report cites and keeps the
    throwaway. Seen exactly that way on 2026-09-06 against TC-003.

    Between two equally uncanonical clips, size decides: a recording truncated by a crashed session
    is the short one, and the longer clip covers everything the shorter one does. Time breaks a tie.
    """
    if canonical(candidate, case_id) != canonical(incumbent, case_id):
        return canonical(candidate, case_id)
    left, right = candidate.stat(), incumbent.stat()
    if left.st_size != right.st_size:
        return left.st_size > right.st_size
    return left.st_mtime > right.st_mtime


def keepers(folder: Path, final_verdict: str, only_final: bool) -> tuple[list[Path], list[Path]]:
    """Splits a case folder's recordings into what the report needs and what goes."""
    present = [path for path in recordings(folder) if path.stat().st_size]
    tagged = any(attempt_of(path) is not None for path in present)

    keep: dict[int | None, Path] = {}
    for path in present:
        attempt = attempt_of(path)
        if tagged and attempt is None:
            continue
        if attempt not in keep or better(path, keep[attempt], folder.name):
            keep[attempt] = path

    if only_final and keep:
        numbered = {attempt: path for attempt, path in keep.items() if attempt is not None}
        matching = [path for path in numbered.values() if verdict_of(path) == final_verdict.upper()]
        chosen = max(matching, key=lambda path: attempt_of(path) or 0) if matching else None
        if chosen is None:
            chosen = max(keep.values(),
                         key=lambda path: (canonical(path, folder.name), path.stat().st_size,
                                           path.stat().st_mtime))
        keep = {attempt_of(chosen): chosen}

    kept = sorted(keep.values())
    return kept, [path for path in recordings(folder) if path not in kept]


def prune_case(folder: Path, final_verdict: str, only_final: bool, dry_run: bool) -> tuple[list[Path], int]:
    kept, doomed = keepers(folder, final_verdict, only_final)
    reclaimed = 0
    for path in doomed:
        # Two rails, because this call is irreversible: the file has to live under the media root the
        # caller named, and it has to be a recording. Anything else is a bug in the caller, not a file
        # to delete on its behalf.
        if folder not in path.parents or path.suffix.lower() not in RECORDING_SUFFIXES:
            print(f"  ! refusing to delete outside the case folder: {path}")
            continue
        size = path.stat().st_size
        print(f"  - {'would delete' if dry_run else 'deleted'} {path.name} ({size / 1_000_000:.1f} MB)")
        if not dry_run:
            path.unlink()
        reclaimed += size
    return kept, reclaimed


def tilde(path: Path) -> str:
    try:
        return f"~/{path.relative_to(Path.home())}"
    except ValueError:
        return str(path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--media-dir", type=Path, required=True,
                        help="The run's media root — the folder holding one subfolder per case.")
    parser.add_argument("--case", action="append", default=[],
                        help="Prune only this case id. Repeatable. Default: every case folder present.")
    parser.add_argument("--verdict", default="",
                        help="The case's final verdict, for --only-final. Ignored without --results.")
    parser.add_argument("--results", type=Path,
                        help="results.json. Supplies each case's verdict and gets its `video` key "
                             "rewritten to what survived, so the report never cites a deleted file.")
    parser.add_argument("--drop-unneeded", action="store_true",
                        help="Also delete recordings belonging to read-only cases — ones that only "
                             "assert existence or read labels, which a screenshot settles on its own. "
                             "Needs --results, since the command trail is what decides.")
    parser.add_argument("--only-final", action="store_true",
                        help="Keep one clip for the whole case rather than one per attempt. Discards "
                             "heal evidence — see contracts/evidence.md before using it.")
    parser.add_argument("--dry-run", action="store_true", help="Report what would go, delete nothing.")
    args = parser.parse_args()

    media_dir = args.media_dir.expanduser().resolve()
    if not media_dir.is_dir():
        print(f"! not a directory: {media_dir}")
        return 1
    if media_dir == Path.home() or media_dir.parent == media_dir:
        print(f"! refusing to prune {media_dir} — point --media-dir at a run's media root")
        return 1

    verdicts: dict[str, str] = {}
    results: list[dict] = []
    # results.json is written either as a bare list or wrapped in `{"results": [...]}`. The wrapper
    # has to survive the rewrite — dropping it turns the file into a shape build_evidence.py reads
    # as a single malformed case.
    envelope: dict | None = None
    if args.results:
        payload = json.loads(args.results.expanduser().read_text())
        if isinstance(payload, dict):
            envelope, results = payload, payload.get("results", [])
        else:
            results = payload
        verdicts = {result["caseId"]: result.get("verdict", "") for result in results}

    wanted = set(args.case)
    folders = sorted(path for path in media_dir.iterdir()
                     if path.is_dir() and (not wanted or path.name in wanted))
    if not folders:
        print(f"! no case folders under {tilde(media_dir)}"
              + (f" matching {', '.join(sorted(wanted))}" if wanted else ""))
        return 1

    if args.drop_unneeded and not results:
        print("! --drop-unneeded needs --results: without the command trail nothing can be called read-only")
        return 1
    read_only = {result["caseId"] for result in results if interacts(result) is False}

    total = 0
    survivors: dict[str, list[str]] = {}
    for folder in folders:
        if args.drop_unneeded and folder.name in read_only:
            reclaimed = 0
            for path in recordings(folder):
                size = path.stat().st_size
                print(f"{folder.name}: {'would delete' if args.dry_run else 'deleted'} {path.name} "
                      f"({size / 1_000_000:.1f} MB) — read-only case, the screenshot is the evidence")
                if not args.dry_run:
                    path.unlink()
                reclaimed += size
            survivors[folder.name] = []
            total += reclaimed
            continue
        before = recordings(folder)
        if len(before) <= 1 and all(path.stat().st_size for path in before):
            survivors[folder.name] = [tilde(path) for path in before]
            continue
        print(f"{folder.name}: {len(before)} recording(s)")
        kept, reclaimed = prune_case(folder, verdicts.get(folder.name, args.verdict),
                                     args.only_final, args.dry_run)
        for path in kept:
            print(f"  + kept {path.name}")
        survivors[folder.name] = [tilde(path) for path in kept]
        total += reclaimed

    for result in results:
        paths = survivors.get(result["caseId"])
        if paths is None:
            continue
        result["video"] = paths[0] if len(paths) == 1 else paths
        if not paths:
            result.pop("video", None)
    if results and not args.dry_run:
        if envelope is not None:
            envelope["results"] = results
        args.results.expanduser().write_text(json.dumps(envelope if envelope is not None else results, indent=2) + "\n")
        print(f"rewrote `video` on {len(results)} result(s) in {tilde(args.results.expanduser())}")

    verb = "would reclaim" if args.dry_run else "reclaimed"
    print(f"{verb} {total / 1_000_000:.1f} MB across {len(folders)} case folder(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
