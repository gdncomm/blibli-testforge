#!/usr/bin/env python3
"""Inventories every accessibility identifier a scope declares, resolved to the string the app sets.

`scan_scope.py` already answers *how much* of a scope is addressable — a per-file yes/no producing a
percentage. This answers *what* each identifier actually is, which is the part a command plan needs
and the part nothing in this skill could previously supply. Its regex (`scan_scope.py:31`) is a bare
predicate with no capture group; the walk is shared, the collection is not.

**Why this exists.** `SKILL.md` told a run to resolve identifiers from "`AccessibilityIdentifier`'s
real `rawValue`s", assuming one central enum whose case name is the identifier. In the target app
there is no such enum — there are ~123, 17 of them file-private — and `rawValue` differs from the
case name wherever a case declares `= "…"`. Worse, the accessor is a computed property that
frequently transforms the value (`.capitalized`) or ignores it entirely (`"\\(self)"` yields the case
name). A plan built on the old assumption addresses nothing, and the failure looks like a UI bug
rather than a resolution bug. `a11y_map.py` carries the resolution rules; this script applies them
across a scope and reports what it could and could not resolve.

**Nothing is invented.** A site whose value cannot be determined statically — an interpolated
identifier, a localized one, a pass-through whose value lives in the caller, an accessor that
switches per case — is reported with its `valueSource` and, where one exists, its `{placeholder}`
pattern. It never receives a guessed concrete value. Unresolved and clean must not read the same, the
same rule `contracts/evidence.md` applies to `evidenceIntegrity`.

**Declarations are resolved from a wider root than the sites are reported from.** A module's
identifiers are routinely declared somewhere else — a sibling feature, or a local SPM package under
`SwiftPackages/`. Resolving only within the scanned folder reported those as `enum-not-found` and
depressed the resolution rate of precisely the modules that share the most code (Search 32%,
OrderCatalog 25%). So there are two passes: declarations are read from `--source-root`, defaulting
to the enclosing git repo, while the sites reported are still exactly the scope's own. A declaration
found outside the scope is recorded with its real path, so a reader can see the value came from a
package.

This slice implements the iOS extractor only. Android and web resolve their platform and then stop,
rather than emitting Swift-shaped findings under another platform's name.

Usage:
    scan_identifiers.py <scope folder>
    scan_identifiers.py <scope folder> --helper-root ~/Library/.../checkouts/BlibliCommonUI \\
        --format json -o identifiers.json
    scan_identifiers.py <repo>/BlibliMobile-iOS --modules modules.txt   # one row per module
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).parent))
from a11y_map import (ACCESSOR_NAMES, detect_platform, display_path, enum_table,  # noqa: E402
                      identifier_digest, identifier_helpers, parse_enums, repo_root, resolve_symbol)
from scan_scope import VIEW_DECLARATION, addressability, swift_files  # noqa: E402
from scan_scope import identifier_helpers as scope_helpers  # noqa: E402

# Starting bands for the readiness verdict. **These are a heuristic, not a measured standard** — no
# study backs them, and the first module leads to use them should move them. They are here so the
# scoping rule ("point this plugin at screens with well-structured accessibility") is checkable at
# all rather than applied by feel; a wrong-but-stated threshold can be argued with, an unstated one
# cannot.
READY_COVERAGE, READY_RESOLUTION = 80, 80
PARTIAL_COVERAGE, PARTIAL_RESOLUTION = 60, 60

# The three call shapes that apply an identifier, and the argument each carries.
_SWIFTUI_CALL = re.compile(r"\.accessibilityIdentifier\s*\(\s*([^)]*)\)")
_UIKIT_WRAPPER_CALL = re.compile(r"\bsetAccessibilityIdentifier\s*\(\s*(?:with:\s*)?([^)]*)\)")
_UIKIT_PROPERTY_CALL = re.compile(r"\baccessibilityIdentifier\s*=\s*([^\n]+?)\s*$")

_STRING_ARGUMENT = re.compile(r'^"((?:[^"\\]|\\.)*)"$')
_BUILDER_CALL = re.compile(r"^([A-Za-z_][\w.]*)\s*\((.*)\)$")
_WITH_LABEL = re.compile(r"^with:\s*")
# How far a call's argument list may run past its opening line before the scan gives up. Four
# covers every wrapped call observed in the target app; an unbounded join would swallow a whole
# file on one unbalanced paren inside a string this scan does not parse.
_CONTINUATION_LINES = 4
_DANGLING_ASSIGNMENT = re.compile(r"\baccessibilityIdentifier\s*=\s*$")


def _has_applier(line: str, patterns: list[tuple[re.Pattern[str], str]]) -> bool:
    """Whether an applier *opens* on this line, even if its argument list does not close here.

    Deliberately looser than the patterns themselves: those require a complete `(…)`, which is the
    very thing a wrapped call lacks on its first line.
    """
    return any(re.search(rf"\b{re.escape(applier.lstrip('.').split('(')[0])}\s*\(", line)
               for _, applier in patterns if not applier.endswith("="))
_INTERPOLATION = re.compile(r"\\\(([^()]*(?:\([^()]*\))?[^()]*)\)")
_LOCALIZED = re.compile(r"\b(?:BMLocalized|NSLocalizedString|R\.string)\b")
# The wrapper's second argument. Its default is `true`, which marks the whole subtree as one
# accessibility element — so the children a file declares below it are unaddressable at run time.
_IGNORE_SUBVIEWS = re.compile(r"ignoreSubviews:\s*(true|false)")


def applier_patterns(helpers: dict[str, str]) -> list[tuple[re.Pattern[str], str]]:
    """The call shapes that apply an identifier — the SDK's own, plus every project-local wrapper.

    The wrappers are not a nicety. Bazaar routes all 60 of its identifiers through `.a11y(_:)`, and
    the target app routes ~2,240 through `setAccessibilityIdentifier(with:)`; a scanner matching
    only the SDK call reports the first as having one identifier and misattributes the second.
    `scan_scope.py:179` discovers these names for exactly this reason — this uses the discovery to
    match call sites, not merely to count them.
    """
    patterns = [(_UIKIT_WRAPPER_CALL, "setAccessibilityIdentifier(with:)"),
                (_SWIFTUI_CALL, ".accessibilityIdentifier(_:)"),
                (_UIKIT_PROPERTY_CALL, "accessibilityIdentifier =")]
    for name in sorted(helpers):
        if name in ("setAccessibilityIdentifier", "accessibilityIdentifier"):
            continue
        patterns.insert(0, (re.compile(rf"\.{re.escape(name)}\s*\(\s*([^)]*)\)"), f".{name}(_:)"))
    return patterns


def balanced_argument(line: str, open_at: int) -> str:
    """The full text between `(` at `open_at` and its matching `)`.

    A regex stopping at the first `)` truncates every nested call —
    `.a11y(A11y.Catalog.productCard(product.id))` arrives as `A11y.Catalog.productCard(product.id`,
    which then resolves as nothing. Parenthesis depth is the only way to get the whole expression.
    """
    depth, started, in_string = 0, False, False
    for index in range(open_at, len(line)):
        character = line[index]
        if character == '"' and (index == 0 or line[index - 1] != "\\"):
            in_string = not in_string
        if in_string:
            continue
        if character == "(":
            depth, started = depth + 1, True
        elif character == ")":
            depth -= 1
            if started and depth == 0:
                return line[open_at + 1:index]
    return line[open_at + 1:] if started else ""


def argument_of(line: str, patterns: list[tuple[re.Pattern[str], str]]) -> tuple[str, str] | None:
    """The applier used on this line and the expression it was handed, or None.

    Ordered most-specific first: the UIKit wrapper's name ends in `accessibilityIdentifier`, so a
    looser property match would claim its lines too.
    """
    for pattern, applier in patterns:
        match = pattern.search(line)
        if not match:
            continue
        if applier.endswith("="):
            argument = match.group(1).strip().rstrip(",")
        else:
            opening = line.find("(", match.start())
            argument = balanced_argument(line, opening).strip().rstrip(",")
            argument = _WITH_LABEL.sub("", argument, count=1)
        # A wrapper call carries `ignoreSubviews:` in the same parentheses; the identifier is the
        # first argument only. Split on the top-level comma, not any comma — a nested call's own
        # arguments are not this call's.
        if applier.startswith("set"):
            argument = _top_level_head(argument)
        return applier, argument
    return None


def _top_level_head(argument: str) -> str:
    """The first argument of a call, ignoring commas nested inside parentheses."""
    depth = 0
    for index, character in enumerate(argument):
        if character in "([":
            depth += 1
        elif character in ")]":
            depth -= 1
        elif character == "," and depth == 0:
            return argument[:index].strip()
    return argument.strip()


def classify_value(argument: str, table: dict, same_file: str) -> dict[str, Any]:
    """What the identifier is, or the most honest thing that can be said about it.

    Five outcomes, and only the first two produce a concrete value. The rest are recorded as
    patterns or expressions: a run resolves those from a live tree at plan time, which is a real
    answer, where a fabricated string is not.
    """
    if not argument:
        return {"valueSource": "viewmodel-derived", "expression": "", "unresolvedReason": "empty argument"}

    literal = _STRING_ARGUMENT.match(argument)
    if literal:
        text = literal.group(1)
        placeholders = _INTERPOLATION.findall(text)
        if placeholders:
            pattern = _INTERPOLATION.sub(lambda match: "{" + _placeholder_name(match.group(1)) + "}", text)
            return {"valueSource": "interpolated", "valuePattern": pattern,
                    "placeholders": [{"name": _placeholder_name(expression), "expression": expression.strip(),
                                      "resolvedAt": "runtime"} for expression in placeholders]}
        return {"valueSource": "literal", "value": text, "valueResolution": "string-literal"}

    if _LOCALIZED.search(argument):
        return {"valueSource": "localized", "valuePattern": argument.strip(),
                "stability": "locale-dependent",
                "unresolvedReason": "identifier is a localized string; its value changes with device language"}

    # A bare lowercase word that is not a dotted path is a parameter or local — the value belongs to
    # whoever called this view.
    if re.fullmatch(r"[a-z_]\w*", argument):
        return {"valueSource": "passthrough", "resolvedBy": "caller", "expression": argument,
                "unresolvedReason": f"value is the caller's argument `{argument}`"}

    if "." in argument and "(" not in argument:
        return resolve_symbol(argument, table, same_file)

    # A builder call — `A11y.Catalog.productCard(product.id)`. The concrete value depends on runtime
    # data, but the *shape* does not: the `static func` declares it. Reporting the pattern is a real
    # answer where "not resolvable" throws away something the declaration already told us.
    builder = _BUILDER_CALL.match(argument)
    if builder:
        resolved = resolve_symbol(builder.group(1), table, same_file)
        if "valuePattern" in resolved or "value" in resolved:
            resolved.setdefault("callArguments", builder.group(2).strip())
            return resolved

    return {"valueSource": "viewmodel-derived", "expression": argument,
            "unresolvedReason": "expression is not a statically resolvable enum reference"}


def _placeholder_name(expression: str) -> str:
    """A short slot name for an interpolated fragment — the last identifier-ish token in it."""
    tokens = re.findall(r"[A-Za-z_]\w*", expression)
    return tokens[-1] if tokens else "value"


def collapses_subtree(line: str, applier: str) -> tuple[bool, str] | tuple[None, None]:
    """Whether this call marks its subtree as one accessibility element, and how that was decided.

    Only the UIKit wrapper has the flag, and its default is `true` — so the common call, which
    passes nothing, is the one that erases its children. A file can declare identifiers on those
    children and they will not exist at run time; that is the `subtree-collapsed` disagreement a
    later runtime pass reports, and it starts here.
    """
    if not applier.startswith("set"):
        return None, None
    explicit = _IGNORE_SUBVIEWS.search(line)
    if explicit:
        return explicit.group(1) == "true", "explicit"
    return True, "default-argument"


def scan_file(path: Path, root: Path | None, table: dict, helpers: dict[str, str],
              patterns: list[tuple[re.Pattern[str], str]]) -> dict[str, Any]:
    text = path.read_text(errors="ignore")
    shown = display_path(path, root)
    surface = "swiftui" if "import SwiftUI" in text else "uikit"
    sites: list[dict[str, Any]] = []

    lines = text.splitlines()
    for number, raw_line in enumerate(lines, start=1):
        # A call whose argument sits on the following line is still one call. 137 of them in the
        # target app — a quarter of the SwiftUI sites — and a line-at-a-time scan silently reports
        # every one as absent, which reads identically to an element with no identifier at all.
        window = raw_line
        if _has_applier(raw_line, patterns) and window.count("(") > window.count(")"):
            for follow in lines[number:number + _CONTINUATION_LINES]:
                window += " " + follow.strip()
                if window.count("(") <= window.count(")"):
                    break
        elif _DANGLING_ASSIGNMENT.search(raw_line) and number < len(lines):
            # `view.accessibilityIdentifier =` with the value on the next line. Same call, wrapped
            # by a formatter rather than by hand.
            window = f"{raw_line.rstrip()} {lines[number].strip()}"
        found = argument_of(window, patterns)
        if not found:
            continue
        applier, argument = found
        site: dict[str, Any] = {"file": shown, "line": number, "surface": surface, "applier": applier}
        collapses, source = collapses_subtree(raw_line, applier)
        if collapses is not None:
            site["collapsesSubtree"] = collapses
            site["collapsesSubtreeSource"] = source
        if applier.startswith("set") or applier.startswith(".") and applier != ".accessibilityIdentifier(_:)":
            name = applier.lstrip(".").split("(")[0]
            site["applierDeclaredIn"] = helpers.get(name, "external:unresolved")
        site.update(classify_value(argument, table, shown))
        sites.append(site)

    return {"file": shown, "surface": surface, "isView": bool(VIEW_DECLARATION.search(text)),
            "identifierDigest": identifier_digest(parse_enums(text, shown), sites), "sites": sites}


def _enum_counts(table: dict) -> dict[str, Any]:
    """Namespaces that actually declare identifiers, split the way the acceptance criteria are.

    `*Accessibility*`-named types are counted separately because that is the population the target
    app's convention describes — and the count of *distinct root names* among them is the number
    that disproves "one central enum".
    """
    accessibility = {key: decl for key, decl in table.items() if "ccessibility" in decl.path}
    holding = [decl for decl in table.values() if decl.cases or decl.constants]
    return {"namespacesParsed": len(table),
            "declaringIdentifiers": len(holding),
            "accessibilityNamed": len(accessibility),
            "accessibilityDistinctRootNames": len({decl.path.split(".")[0] for decl in accessibility.values()}),
            "accessibilityStringRaw": sum(1 for decl in accessibility.values() if decl.raw_type == "String"),
            "accessibilityFilePrivate": sum(1 for decl in accessibility.values() if decl.is_private)}


def summarise(files: list[dict[str, Any]], table: dict) -> dict[str, Any]:
    sites = [site for entry in files for site in entry["sites"]]
    return {
        "sites": len(sites),
        "byApplier": dict(Counter(site["applier"] for site in sites).most_common()),
        "bySurface": dict(Counter(site["surface"] for site in sites).most_common()),
        "byValueSource": dict(Counter(site["valueSource"] for site in sites).most_common()),
        "byValueResolution": dict(Counter(site.get("valueResolution", "—") for site in sites).most_common()),
        "byAccessor": dict(Counter(site["accessor"] for site in sites if site.get("accessor")).most_common()),
        "resolvedValues": sum(1 for site in sites if "value" in site),
        "collapsingSubtree": sum(1 for site in sites if site.get("collapsesSubtree")),
        # Only the identifier-carrying namespaces. Every struct and class is parsed (a namespace of
        # `static let`s is a legitimate declaration site), so counting the whole table would report
        # thousands of unrelated types as identifier enums.
        "enums": _enum_counts(table),
    }


def readiness(files: list[Path], summary: dict[str, Any]) -> dict[str, Any]:
    """Whether this scope is worth pointing the plugin at, and the backlog if it is not.

    Three numbers, because they fail differently and the fix differs:

    - **coverage** — view files carrying any identifier. A miss here needs an app change, so it is
      the expensive one. Computed by `scan_scope.addressability()` over `scan_scope`'s *own* helper
      set, so this figure and `scan_scope.py`'s cannot drift apart. It is deliberately not given
      this module's stricter applier set: that set answers "is this call's argument an identifier",
      a per-*site* question, while coverage is a per-*file* boolean. Swapping it in moves coverage
      — Cart 71% → 63% — which would make a resolution change look like an app regression.
      (`scan_scope`'s rule is loose enough to nominate `setImage` and `awakeFromNib` as wrappers,
      so this number reads slightly high. That is a pre-existing defect in `scan_scope.py`; it is
      logged rather than silently corrected here, because fixing it inside a resolution change
      would move a coverage baseline for a reason no reader could see.)
    - **resolution** — sites resolved to a concrete string. A miss here is usually *tool* debt, not
      app debt: an enum the declaration root cannot see, or an accessor too dynamic to follow. It
      moves without anyone touching the app, so it must not be read as a retrofit backlog.
    - **collapsed** — sites applied with `ignoreSubviews` true. Identifiers that exist and are
      unreachable at run time. Cheap to fix per element (one argument) and invisible to everyone
      today, which is why it is reported next to the other two rather than buried.

    The verdict bands are a starting heuristic (see `READY_COVERAGE`), and the caller is told so.
    """
    reach = addressability(files, scope_helpers(files))
    views = int(reach["viewFiles"])
    with_ids = int(reach["withIdentifiers"])
    sites = summary["sites"]
    coverage = round(100 * with_ids / views) if views else 0
    resolution = round(100 * summary["resolvedValues"] / sites) if sites else 0

    if not views:
        verdict, why = "no-views", "no view files found — check the scope path"
    elif coverage >= READY_COVERAGE and resolution >= READY_RESOLUTION:
        verdict, why = "ready", "most views are addressable and most identifiers resolve"
    elif coverage >= PARTIAL_COVERAGE and resolution >= PARTIAL_RESOLUTION:
        verdict, why = "partial", "usable for cases that stay on covered screens"
    elif coverage < PARTIAL_COVERAGE:
        verdict, why = "not-ready", f"{reach['withoutIdentifiers']} view file(s) carry no identifier at all"
    else:
        verdict, why = "not-ready", "identifiers exist but too few resolve to a usable string"

    return {"viewFiles": views, "withIdentifiers": with_ids,
            "withoutIdentifiers": int(reach["withoutIdentifiers"]),
            "coveragePercent": coverage, "resolutionPercent": resolution,
            "collapsedSites": summary["collapsingSubtree"],
            "swiftUI": reach["swiftUI"], "uiKit": reach["uiKit"],
            "verdict": verdict, "verdictReason": why,
            "thresholds": {"ready": [READY_COVERAGE, READY_RESOLUTION],
                           "partial": [PARTIAL_COVERAGE, PARTIAL_RESOLUTION],
                           "note": "starting heuristic, not a measured standard — tune per team"},
            # Capped at 20 by `scan_scope.addressability()`; `withoutIdentifiers` is the true count.
            "unaddressableSample": reach["bareFiles"]}


def render_markdown(report: dict[str, Any]) -> str:
    counts = report["summary"]
    ready = report.get("readiness", {})
    lines = ["# Accessibility identifiers", "",
             f"Scope `{report['scope']}` · platform **{report['platform']}** ({report['platformSource']})",
             f"{counts['sites']} identifier site(s) across {report['swiftFiles']} Swift file(s); "
             f"{counts['resolvedValues']} resolved to a concrete value.",
             f"Declarations resolved from `{report.get('declarationRoot', '—')}` "
             f"({report.get('declarationFiles', 0)} file(s)).", ""]

    if ready:
        lines += [f"## Readiness — **{ready['verdict']}**", "",
                  f"{ready['verdictReason'].capitalize()}.", "",
                  "| Measure | Value |", "|---|---|",
                  f"| View files carrying an identifier | {ready['withIdentifiers']}/{ready['viewFiles']}"
                  f" ({ready['coveragePercent']}%) |",
                  f"| Identifier sites resolved to a value | {counts['resolvedValues']}/{counts['sites']}"
                  f" ({ready['resolutionPercent']}%) |",
                  f"| Sites collapsing their subtree | {ready['collapsedSites']} |",
                  f"| View files with no identifier | {ready['withoutIdentifiers']} |", "",
                  f"_Bands are a starting heuristic, not a measured standard: ready at "
                  f"{READY_COVERAGE}%/{READY_RESOLUTION}%, partial at "
                  f"{PARTIAL_COVERAGE}%/{PARTIAL_RESOLUTION}%. Coverage is an app-side gap; "
                  f"resolution is usually a tool-side one._", ""]

    lines += ["| Applier | Sites |", "|---|---|"]
    for applier, total in counts["byApplier"].items():
        lines.append(f"| `{applier}` | {total} |")
    lines += ["", "| How the value was resolved | Sites |", "|---|---|"]
    for resolution, total in counts["byValueResolution"].items():
        lines.append(f"| `{resolution}` | {total} |")
    lines += ["", "| Value source | Sites |", "|---|---|"]
    for source, total in counts["byValueSource"].items():
        lines.append(f"| `{source}` | {total} |")

    if counts["collapsingSubtree"]:
        lines += ["", f"**{counts['collapsingSubtree']} site(s) collapse their subtree** — applied through "
                      "`setAccessibilityIdentifier(with:ignoreSubviews:)` with `ignoreSubviews` true. "
                      "Identifiers declared on their children do not exist at run time."]

    unresolved = [site for entry in report["files"] for site in entry["sites"]
                  if "value" not in site and "valuePattern" not in site]
    if unresolved:
        lines += ["", f"## Not statically resolvable ({len(unresolved)})", "",
                  "Resolve these from a live tree at plan time. No value is guessed for them.", "",
                  "| File | Line | Why |", "|---|---|---|"]
        for site in unresolved[:25]:
            lines.append(f"| `{site['file']}` | {site['line']} | {site.get('unresolvedReason', '—')} |")
        if len(unresolved) > 25:
            lines.append(f"| … | | +{len(unresolved) - 25} more |")
    return "\n".join(lines) + "\n"


def scan_scope_paths(scopes: list[Path], root: Path, table: dict, helpers: dict[str, str],
                     patterns: list[tuple[re.Pattern[str], str]]) -> tuple[list[dict], list[Path]]:
    """Site pass over one logical scope, which may span several folders.

    `Return` and `SellerChat` are single modules whose code lives in two or three places
    (`Aftersales/Return` + `FrameworkBridge/Return` + the `BlibliReturn` framework;
    `SwiftPackages/BlibliSellerChatIOS`). Scanning one path reports 0 sites, which reads as "no
    identifiers" when it means "wrong folder" — so a scope is a list, and the caller says which
    paths make it up.
    """
    files: list[Path] = []
    for scope in scopes:
        files.extend(swift_files(scope))
    files = sorted(set(files))
    scanned = [scan_file(path, root, table, helpers, patterns) for path in files]
    return [entry for entry in scanned if entry["sites"]], files


def batch_table(rows: list[dict[str, Any]]) -> str:
    """One row per module — the artifact a module lead actually reads."""
    lines = ["# Accessibility readiness by module", "",
             "Coverage is view files carrying any identifier (an app-side gap). Resolution is sites "
             "resolved to a usable string (usually a *tool*-side gap — an enum the declaration root "
             "cannot see — so it moves without anyone touching the app). Collapsed is identifiers "
             "that exist but whose children are unreachable at run time.", "",
             f"Verdict bands are a starting heuristic, not a measured standard: **ready** at "
             f"{READY_COVERAGE}%/{READY_RESOLUTION}%, **partial** at "
             f"{PARTIAL_COVERAGE}%/{PARTIAL_RESOLUTION}%. Tune them per team.", "",
             "| Module | Views | Coverage | Sites | Resolved | Collapsed | Verdict |",
             "|---|---:|---:|---:|---:|---:|---|"]
    for row in rows:
        if row.get("error"):
            lines.append(f"| `{row['module']}` | — | — | — | — | — | {row['error']} |")
            continue
        ready = row["readiness"]
        lines.append(f"| `{row['module']}` | {ready['viewFiles']} | {ready['coveragePercent']}% | "
                     f"{row['summary']['sites']} | {ready['resolutionPercent']}% | "
                     f"{ready['collapsedSites']} | {ready['verdict']} |")
    backlog = [row for row in rows if not row.get("error") and row["readiness"]["withoutIdentifiers"]]
    if backlog:
        lines += ["", "## Retrofit backlog — view files with no identifier", "",
                  "| Module | View files with none |", "|---|---:|"]
        for row in sorted(backlog, key=lambda entry: -entry["readiness"]["withoutIdentifiers"]):
            lines.append(f"| `{row['module']}` | {row['readiness']['withoutIdentifiers']} |")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("scope", type=Path)
    parser.add_argument("--source-root", type=Path, default=None,
                        help="root the DECLARATION pass reads, and the base for reported paths "
                             "(default: the enclosing git repo, else the scope). Sites are still "
                             "reported only from the scope")
    parser.add_argument("--modules", action="append", default=[],
                        help="module path relative to the scope, repeatable; or a file with one "
                             "per line. Prints one readiness row per module, sharing a single "
                             "declaration pass. A '+'-joined entry is one module spanning several "
                             "paths, e.g. 'Aftersales/Return+FrameworkBridge/Return'")
    parser.add_argument("--platform", choices=["auto", "ios", "android", "web"], default="auto",
                        help="default: auto — resolved from project markers, recorded as platformSource")
    parser.add_argument("--helper-root", action="append", type=Path, default=[],
                        help="extra directory to scan for identifier-wrapper declarations, for a "
                             "wrapper declared outside the repo (repeatable; or $TEST_FORGE_A11Y_HELPER_ROOTS)")
    parser.add_argument("--format", choices=["markdown", "json"], default="markdown")
    parser.add_argument("-o", "--out", help="write the report here instead of stdout")
    parser.add_argument("--chain-out",
                        help="append resolved (file, line, identifier) sites to this markdown "
                             "table, deduped against whatever it already holds — for building an "
                             "accessibility-chain.md incrementally across repeated runs rather than "
                             "overwriting it. Single-scope mode only, not --modules")
    args = parser.parse_args()

    if not args.scope.is_dir():
        raise SystemExit(f"not a directory: {args.scope}")

    platform, platform_source = detect_platform(args.scope, args.platform)
    if platform != "ios":
        raise SystemExit(f"platform {platform!r} ({platform_source}) is not implemented in this slice — "
                         "the extractor parses Swift. Android and web need their own, emitting the "
                         "same keys.")

    helper_roots = [Path(entry) for entry in os.environ.get("TEST_FORGE_A11Y_HELPER_ROOTS", "").split(":") if entry]
    helper_roots += list(args.helper_root)
    helper_roots = [root for root in helper_roots if root.is_dir()]

    # Declaration pass: wide. Site pass: exactly the scope. Building the table once is what makes
    # batch mode affordable — it is ~30s over this repo, and recomputing it per module would cost
    # minutes to produce the same answer.
    root = args.source_root or repo_root(args.scope.resolve()) or args.scope
    declaration_files = swift_files(root)
    table = enum_table(declaration_files, root)
    helpers = identifier_helpers(declaration_files, helper_roots, root)
    patterns = applier_patterns(helpers)

    modules = _module_list(args.modules)
    if modules:
        rows: list[dict[str, Any]] = []
        for module in modules:
            paths = [args.scope / part for part in module.split("+")]
            missing = [path for path in paths if not path.is_dir()]
            if missing:
                rows.append({"module": module,
                             "error": f"path not found: {', '.join(str(path) for path in missing)}"})
                continue
            scanned, files = scan_scope_paths(paths, root, table, helpers, patterns)
            summary = summarise(scanned, table)
            rows.append({"module": module, "paths": [str(path) for path in paths],
                         "swiftFiles": len(files), "summary": summary,
                         "readiness": readiness(files, summary)})
        report = {"declarationRoot": str(root), "platform": platform,
                  "platformSource": platform_source, "declarationFiles": len(declaration_files),
                  "modules": rows}
        text = json.dumps(report, indent=2) if args.format == "json" else batch_table(rows)
        return _emit(text, args.out)

    scanned, files = scan_scope_paths([args.scope], root, table, helpers, patterns)
    summary = summarise(scanned, table)
    report = {"scope": str(args.scope), "platform": platform, "platformSource": platform_source,
              "declarationRoot": str(root), "declarationFiles": len(declaration_files),
              "swiftFiles": len(files), "helpers": helpers,
              "helperRoots": [str(entry) for entry in helper_roots],
              "readiness": readiness(files, summary),
              "summary": summary, "files": scanned}

    text = json.dumps(report, indent=2) if args.format == "json" else render_markdown(report)
    if args.chain_out:
        _append_chain_rows(args.chain_out, scanned)
    return _emit(text, args.out)


_CHAIN_HEADER = "# Accessibility Identifier Chain"
_CHAIN_ROW = re.compile(r"^\|\s*(?P<file>[^|]*?)\s*\|\s*(?P<line>\d+)\s*\|\s*(?P<identifier>[^|]*?)\s*\|\s*(?P<symbol>[^|]*?)\s*\|\s*$")


def _existing_chain_keys(path: Path) -> set[tuple[str, str, str]]:
    """`(file, line, identifier)` triples already on disk, so a re-run never duplicates a row."""
    if not path.exists():
        return set()
    keys = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        match = _CHAIN_ROW.match(line)
        if match:
            keys.add((match["file"], match["line"], match["identifier"]))
    return keys


def _append_chain_rows(chain_out: str, scanned: list[dict[str, Any]]) -> None:
    """Every resolved site (one with a concrete `value`) becomes one row, appended only if its
    `(file, line, identifier)` triple is new. Unresolved sites are skipped here — this file is the
    persisted map of what a run can actually address, not the full inventory `--out` already
    covers, and a placeholder or an unresolved expression is not an identifier a plan can use."""
    path = Path(chain_out)
    existing = _existing_chain_keys(path)
    new_rows = []
    for entry in scanned:
        for site in entry["sites"]:
            value = site.get("value")
            if not value:
                continue
            key = (site["file"], str(site["line"]), value)
            if key in existing:
                continue
            existing.add(key)
            new_rows.append(f"| {site['file']} | {site['line']} | {value} | {site.get('symbol', '—')} |")

    if not new_rows:
        print(f"chain: no new resolved sites to add to {chain_out}")
        return

    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(_CHAIN_HEADER + "\n\n"
                        "Every identifier this scanner has ever resolved to a concrete string, "
                        "across every run that has pointed `--chain-out` here. Rows are appended, "
                        "never rewritten — deleting a stale row is a manual edit.\n\n"
                        "| File | Line | Identifier | Enum.Case |\n|---|---|---|---|\n",
                        encoding="utf-8")
    with path.open("a", encoding="utf-8") as handle:
        handle.write("\n".join(new_rows) + "\n")
    print(f"chain: appended {len(new_rows)} new row(s) to {chain_out}")


def _module_list(entries: list[str]) -> list[str]:
    """`--modules` values, expanding any that name a file of module paths."""
    modules: list[str] = []
    for entry in entries:
        candidate = Path(entry)
        if candidate.is_file():
            modules += [line.strip() for line in candidate.read_text().splitlines()
                        if line.strip() and not line.startswith("#")]
        else:
            modules.append(entry)
    return modules


def _emit(text: str, out: str | None) -> int:
    if out:
        Path(out).write_text(text, encoding="utf-8")
        print(f"Wrote {out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
