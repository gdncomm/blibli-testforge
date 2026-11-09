#!/usr/bin/env python3
"""Inventories a scope before a run: what documentation exists, how addressable the UI is, and which
endpoints it talks to.

A scope that ships module- and section-level markdown beside its code resolves file paths and API
contracts in seconds. A legacy page has none of that, and the difference is not cosmetic: with a
tech document an expectation has two independent sources and a discrepancy can be adjudicated, while
without one there is only the test case document's word against the app's behaviour. This script
says which situation a run is in, in numbers, instead of the run discovering it case by case.

This scanner parses Swift. Android and web need their own, emitting the same `--json` keys
(`posture`, `documents`, `addressability`, `endpointLiterals`) — the report and the run record
read those keys, not this implementation. `documents` splits four ways, and the split is the
contract, not a detail: `looksLikeReference` (written, and about this scope), `projectLevel`
(written, about the app around it), `stubs` (this scope's own document, empty), `processOnly`.

Usage:
    scan_scope.py <folder> [--source-root <app source dir>] [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

IDENTIFIER_CALL = re.compile(r"accessibilityIdentifier|setAccessibilityIdentifier")
FUNCTION_DECLARATION = re.compile(r"func\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(")
# Legacy UIKit rarely subclasses `UIView` directly — it is cells, header/footer views and project
# base classes, and matching only `UIView`/`UIViewController` reported 5 view files in a 61-file
# legacy scope. Anything inheriting a `UI*` type, or named like a view, counts.
VIEW_DECLARATION = re.compile(
    r"\b(?:struct|final\s+class|class)\s+(\w*(?:View|ViewController|Cell|HeaderFooterView))\s*:"
    r"|\b(?:final\s+class|class)\s+\w+\s*:\s*UI\w+"
    r"|\bstruct\s+\w+\s*:\s*[^{\n]*\bView\b")
# The path prefix an app's API routes share, e.g. "backend" or "api". Without one, any quoted string
# that looks like a multi-segment absolute path counts — noisier, but a hardcoded prefix that belongs
# to some other app finds nothing at all and reports a scope as having no endpoints.
_API_PREFIX = os.environ.get("TEST_FORGE_API_PATH_PREFIX", "").strip("/")
ENDPOINT_LITERAL = re.compile(
    rf"\"(/?{re.escape(_API_PREFIX)}/[A-Za-z0-9_\-./{{}}]+)\"" if _API_PREFIX
    else r"\"(/[A-Za-z0-9_\-.{}]+(?:/[A-Za-z0-9_\-.{}]+)+)\"")
# A `docs/` folder beside the feature is the strongest signal there is, and far better than matching
# on filenames: a name pass misses every document whose title describes its subject rather than its
# kind, and matches others by accident on a substring — "spec" inside "SpecialPlacement".
DOC_DIR = re.compile(r"(^|/)(docs?|documentation)(/|$)", re.IGNORECASE)
DOC_HINT = re.compile(r"(tech|hld|design|api|contract|flow|spec|reference|readme)", re.IGNORECASE)
# Written for the people doing the work, not as a description of the feature. Present in the same
# folder, and counting one as a reference is how a scope with only a plan reads as `documented`.
PROCESS_DOC = re.compile(r"(plan|progress|todo|changelog|context|notes)", re.IGNORECASE)
# A reference document cites the files it describes, and that is a far better relevance signal
# than its filename: it is what attaches a section document (PriceBlock.md, Reviews.md) to the
# screen scope it belongs to, which no name match would ever find.
SOURCE_CITATION = re.compile(r"[A-Za-z0-9_][A-Za-z0-9_/]*/[A-Za-z0-9_]+\.(?:swift|kt|java|ts|tsx)")
FRONTMATTER = re.compile(r"\A---\n.*?\n---\n", re.DOTALL)
TABLE_ROW = re.compile(r"^\s*\|.*\|\s*$", re.MULTILINE)
# Calibrated against a real document set, where the smallest genuine reference carried ~110 body
# words and the stub carried 11. Anything in that gap separates them; 40 sits clear of both.
MIN_BODY_WORDS = 40
MIN_TABLE_ROWS = 3


def run(command: list[str]) -> str:
    try:
        return subprocess.run(command, capture_output=True, text=True).stdout
    except Exception:
        return ""


def swift_files(folder: Path) -> list[Path]:
    return sorted(path for path in folder.rglob("*.swift") if "Test" not in path.name)


def is_substantive(text: str) -> bool:
    """Whether a document carries enough to source an expectation from.

    A document's folder and filename say what it was *meant* to be; only its body says whether
    anyone wrote it. A stub in a `docs/` folder otherwise reads as a full reference and lifts a
    scope to `documented`, which is the strongest posture and the one that lets a discrepancy be
    adjudicated `app-wrong` -- off a file that says "TODO".

    Two ways to qualify, because a terse endpoint table is as useful as several paragraphs and
    carries almost no prose."""
    body = FRONTMATTER.sub("", text)
    rows = len(TABLE_ROW.findall(body))
    words = len([word for line in body.splitlines()
                 if not line.lstrip().startswith("#")
                 for word in line.split()])
    return words >= MIN_BODY_WORDS or rows >= MIN_TABLE_ROWS


def relevance(text: str, doc_path: Path, folder: Path) -> str:
    """Whether a document describes this scope, the app around it, or a different scope entirely.

    Without this every scope inherits every other scope's documents, so posture is identical
    everywhere and a scope with nothing written about it reads as documented off its neighbours'
    files.

    `scope`   -- the filename matches, or the body cites a file in this scope. Citation is what
                 attaches a section document to the screen scope it belongs to.
    `project` -- cites nothing, or only somewhere this scope sits under: an app overview's endpoint
                 table is genuinely useful here, but it holds no expectation for this screen.
    `foreign` -- describes a sibling scope, and is simply not this run's evidence.
    """
    name = folder.resolve().name.lower()
    scope_path = str(folder.resolve()).replace("\\", "/").lower()
    cited = [cited_folder(citation) for citation in SOURCE_CITATION.findall(text)]
    cited = [directory for directory in cited if directory]

    if doc_path.stem.lower() == name or any(directory.rsplit("/", 1)[-1] == name for directory in cited):
        return "scope"
    if not cited or any(f"/{directory}" in f"/{scope_path}" for directory in cited):
        return "project"
    return "foreign"


def cited_folder(citation: str) -> str:
    """The directory part of a cited source path, lowercased. A bare `File.swift` cites no folder."""
    return citation.rsplit("/", 1)[0].lower() if "/" in citation else ""


def documents(folder: Path, source_root: Path | None = None) -> dict[str, list[str]]:
    """Markdown in or above the scope, split into what describes the feature and what tracks work.

    Searches upward as well as down, bounded by the source root. A project that keeps its docs beside
    the code it describes and one that keeps a `docs/` tree at the repo root are equally common, and
    only looking inside the scope folder calls the second one undocumented — which silently caps every
    discrepancy at `undecided` for a scope that is in fact fully documented.
    """
    found = sorted(str(path) for path in folder.rglob("*.md"))
    boundary = (source_root or folder).resolve()
    ancestor = folder.resolve()
    def harvest(directory: Path) -> None:
        for sibling in sorted(directory.iterdir()):
            if sibling.is_dir() and DOC_DIR.search(sibling.name):
                found.extend(sorted(str(path) for path in sibling.rglob("*.md")))
            elif sibling.is_file() and sibling.suffix == ".md":
                found.append(str(sibling))

    walked = source_root is not None
    while ancestor != boundary and boundary in ancestor.parents:
        ancestor = ancestor.parent
        harvest(ancestor)
    if walked and boundary.parent != boundary:
        harvest(boundary.parent)

    found = sorted(set(found))
    reference, project_level, stubs, process = [], [], [], []
    for path in found:
        doc = Path(path)
        if PROCESS_DOC.search(doc.name):
            process.append(path)
            continue
        if not (DOC_DIR.search(str(doc.parent)) or DOC_HINT.search(doc.name)):
            continue
        body = doc.read_text(errors="ignore")
        bearing = relevance(body, doc, folder)
        if bearing == "foreign":
            continue
        if not is_substantive(body):
            # Only a stub about this scope is this scope's gap. An empty document that names nothing
            # is evidence about nothing, and reporting it under every scope in the project buries the
            # one place it means something.
            if bearing == "scope":
                stubs.append(path)
            continue
        if bearing == "scope":
            reference.append(path)
        else:
            project_level.append(path)
    return {"all": found, "looksLikeReference": reference, "projectLevel": project_level,
            "stubs": stubs, "processOnly": process}


def identifier_helpers(files: list[Path]) -> set[str]:
    """Names of project-local wrappers around `accessibilityIdentifier`.

    Almost every codebase wraps the modifier in one of its own — `.setAccessibilityIdentifier(_:)`,
    `.a11y(_:)`, `.testID(_:)`. Grepping only for the SDK call reports a fully addressable app as
    unreachable and sends the run down a retrofit path it does not need.
    """
    helpers: set[str] = set()
    for path in files:
        text = path.read_text(errors="ignore")
        for match in FUNCTION_DECLARATION.finditer(text):
            name, body = match.group(1), text[match.end(): match.end() + 400]
            if IDENTIFIER_CALL.search(body):
                helpers.add(name)
    helpers.discard("accessibilityIdentifier")
    return helpers


def addressability(files: list[Path], helpers: set[str] | None = None) -> dict[str, object]:
    """How much of the UI a run can reach by identifier — the cost driver on legacy scope.

    A view file with no identifier anywhere is not automatable without either a production edit
    (gated) or label/geometry addressing, which is fragile and cannot target an unlabelled container.
    """
    views, identified, bare, swiftui, uikit = 0, 0, [], 0, 0
    for path in files:
        text = path.read_text(errors="ignore")
        if not VIEW_DECLARATION.search(text):
            continue
        views += 1
        if "import SwiftUI" in text:
            swiftui += 1
        else:
            uikit += 1
        reaches = IDENTIFIER_CALL.search(text) or any(f".{helper}(" in text for helper in (helpers or ()))
        if reaches:
            identified += 1
        else:
            bare.append(str(path))
    return {"viewFiles": views, "withIdentifiers": identified, "withoutIdentifiers": len(bare),
            "swiftUI": swiftui, "uiKit": uikit, "bareFiles": bare[:20]}


def endpoints(files: list[Path]) -> list[str]:
    found: set[str] = set()
    for path in files:
        found.update(ENDPOINT_LITERAL.findall(path.read_text(errors="ignore")))
    return sorted(found)


def posture(docs: dict[str, list[str]], reach: dict[str, object], found_endpoints: list[str]) -> str:
    """`documented` requires a written reference about *this* scope. An app-level document or a stub
    is real context and worth reading, but it does not carry this scope's expected values, so it
    earns `partial` — which caps adjudication at `undecided` rather than letting a discrepancy be
    called `app-wrong` on evidence that was never written."""
    if docs["looksLikeReference"]:
        return "documented"
    if docs["all"]:
        return "partial"
    return "undocumented"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("folder", type=Path)
    parser.add_argument("--source-root", type=Path, default=Path("."))
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    if not args.folder.is_dir():
        raise SystemExit(f"not a directory: {args.folder}")

    files = swift_files(args.folder)
    docs = documents(args.folder, args.source_root)
    helpers = identifier_helpers(files)
    reach = addressability(files, helpers)
    found_endpoints = endpoints(files)
    state = posture(docs, reach, found_endpoints)

    report = {"scope": str(args.folder), "posture": state, "swiftFiles": len(files),
              "documents": docs, "addressability": reach, "endpointLiterals": found_endpoints}
    if args.json:
        print(json.dumps(report, indent=2))
        return 0

    print(f"scope:    {args.folder}")
    print(f"posture:  {state.upper()}")
    print(f"swift:    {len(files)} file(s)")
    print(f"docs:     {len(docs['all'])} markdown, {len(docs['looksLikeReference'])} describe this scope"
          + (f", {len(docs['projectLevel'])} describe the app" if docs["projectLevel"] else "")
          + (f", {len(docs['stubs'])} stub" if docs["stubs"] else "")
          + (f", {len(docs['processOnly'])} track work only" if docs["processOnly"] else ""))
    # Named individually: these are the reason for a `partial`, and a reader who cannot see which
    # document was discounted has no way to tell a stub from a scanner that missed one.
    for path in docs["stubs"]:
        print(f"            stub: {path}")
    for path in docs["projectLevel"][:4]:
        print(f"            app-level: {path}")
    for path in docs["looksLikeReference"][:8]:
        print(f"            {path}")
    if len(docs["looksLikeReference"]) > 8:
        print(f"            … (+{len(docs['looksLikeReference']) - 8} more)")
    view_files = reach["viewFiles"]
    print(f"views:    {view_files} ({reach['swiftUI']} SwiftUI, {reach['uiKit']} UIKit)")
    if view_files:
        share = reach["withIdentifiers"] / view_files * 100
        print(f"reach:    {reach['withIdentifiers']}/{view_files} carry an accessibility identifier ({share:.0f}%)")
        for path in reach["bareFiles"][:8]:
            print(f"            no identifier: {path}")
    print(f"endpoints in code: {len(found_endpoints)}")
    for endpoint in found_endpoints[:10]:
        print(f"            {endpoint}")

    print()
    if state == "documented":
        print("  Ask nothing extra. Read the reference documents first and treat them as a co-equal")
        print("  source of truth with the test case document.")
    elif state == "partial":
        # Distinct advice from `undocumented`: there is real reading to do here, and the cap on
        # adjudication has to be stated in the report rather than discovered per case.
        print("  Documentation exists, but none of it describes this scope. Read the app-level")
        print("  documents anyway — an endpoint table or a config key list holds here too — then ask")
        print("  the developer for what only a scope document would carry: expected values,")
        print("  thresholds, and the behaviour source of truth.")
        if docs["stubs"]:
            print("  The stub above is this scope's own document, unwritten. Worth saying to whoever")
            print("  owns it: filling it is what lifts every later run on this scope to `documented`.")
        print("  Until then every discrepancy here caps at `authority: undecided`, and the report's")
        print("  front matter must carry that. See SKILL.md, 'Documentation posture'.")
    else:
        print("  No reference document found, so the run has to source its own expectations. Ask the")
        print("  developer for: the entry point, the behaviour source of truth, any feature switch")
        print("  gating the screen, and whether identifiers may be retrofitted. See SKILL.md,")
        print("  'Documentation posture'. Endpoint literals above are a starting list, not a")
        print("  contract — confirm them against a live trace before trusting them.")
    if view_files and reach["withoutIdentifiers"] > reach["withIdentifiers"]:
        print()
        print("  Most view files carry no identifier. Expect label and geometry addressing, and expect")
        print("  the retrofit question to decide how much of this scope is runnable at all.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
