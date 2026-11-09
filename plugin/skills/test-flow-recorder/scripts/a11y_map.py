#!/usr/bin/env python3
"""Resolves an accessibility identifier to the string the app actually sets, not the name it is written as.

`SKILL.md` used to tell a run to address elements by "`AccessibilityIdentifier`'s real `rawValue`s",
which assumes one central enum whose case name is the identifier. Neither half holds in a real app.
`BlibliMobile-iOS` has ~123 distinct `*Accessibility*` enum names, 17 of them file-private and two of
those in the *same* file, reached through four different accessor spellings — and a case with an
explicit `= "…"` has a raw value that is not its case name. A plan built from case names addresses
nothing, silently: the tap resolves to no element, and the failure looks like a UI bug.

So resolution is a three-step lookup, and this module is the one place it lives:

    CartAccessibility.CartHeaderRow.headerUnselectedCheckbox.identifier
    └── enum path ──────────────────┘ └──── case ────────┘ └accessor┘
                                          = "Unselected_Checkbox"

**The accessor is not a suffix to strip.** It is a computed property with a body, and the body is
frequently not `return rawValue`. Surveyed across the target app: 58 accessors return the raw value,
5 return `.capitalized`, 6 return `.capitalizedFirst`, 6 return `"\\(self)"` — which is the *case
name*, never the raw value — some prefix that interpolation with a literal, and **41 of 86 switch on
`self`** and answer per case. Reading `.identifier` as "the raw value" is wrong for a quarter of the
accessors in the codebase, and wrong in exactly the direction that produces a plausible-looking
identifier that matches no element.

Hence `valueResolution`, which every resolved site carries:

| value | meaning |
|---|---|
| `explicit-raw` | accessor returns the raw value, and the case declares `= "…"` |
| `case-name` | accessor returns the raw value, and the case declares none, so Swift defaults it |
| `accessor-transformed` | accessor applies a *pure, known* transform — the value is computed and the transform recorded |
| `accessor-unresolved` | the accessor switches, delegates, or returns a constant. **No value is invented** |

That last row is the point. An unresolved accessor is reported as unresolved, never guessed — the
same discipline `contracts/evidence.md` applies to `evidenceIntegrity` and `check_network_trail.py`
applies to an unparseable `api` column: unchecked and clean must never render identically.

Usage: imported, not run directly. `python3 a11y_map.py <folder>` prints the resolved platform and a
one-line enum-table summary, for a quick manual check.
"""

from __future__ import annotations

import hashlib
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

# The four accessor spellings in live use, plus `.rawValue`, the language builtin. `.description`
# appears too, via CustomStringConvertible. All are resolved through the same accessor table — a
# name alone says nothing about what the body returns.
ACCESSOR_NAMES = ("rawValue", "identifier", "accessibilityId", "value", "description")

# `value` is not usually declared per enum: `RawRepresentable where RawValue == String` carries a
# default (`SwiftPackages/Blibli-Utility/Sources/Utility/Enum+Extension.swift:16`) returning the raw
# value, and every String-raw enum in the app inherits it. Without this, 156 call sites resolve to
# "no such accessor" and report as unresolved when they are in fact perfectly determinate.
PROTOCOL_DEFAULT_ACCESSORS = {
    "rawValue": ("identity", None),
    "value": ("identity", None),
    "capitalizedFirstLetter": ("transform", "capitalizedFirst"),
}

# How an identifier reaches an element. `applier` is recorded per site because it decides
# `collapsesSubtree` — see below — and because a UIKit setter and a SwiftUI modifier are different
# evidence about where the element lives.
SWIFTUI_MODIFIER = re.compile(r"\.accessibilityIdentifier\s*\(")
UIKIT_WRAPPER = re.compile(r"\bsetAccessibilityIdentifier\s*\(")
UIKIT_PROPERTY = re.compile(r"\baccessibilityIdentifier\s*=\s*")
# Any line that participates in identifier resolution, for the digest. Declarations count as well as
# call sites: renaming a case changes what every call site resolves to without touching their lines.
IDENTIFIER_BEARING = re.compile(
    r"accessibilityIdentifier|setAccessibilityIdentifier|AccessibilityIdentifier|"
    r"\bcase\s+[A-Za-z_]\w*\s*=\s*\"|Accessibility\w*\s*[:{]")

_ENUM_DECLARATION = re.compile(
    r"^\s*(?:(public|internal|fileprivate|private)\s+)?(?:final\s+)?"
    r"(enum|struct|class)\s+([A-Za-z_]\w*)\s*(?::\s*([^{]+?))?\s*\{")
_CASE_DECLARATION = re.compile(r"^\s*case\s+(.+)$")
_CASE_ITEM = re.compile(r"^([A-Za-z_]\w*)\s*(?:=\s*\"([^\"]*)\")?$")
# The other declaration idiom, and the one a purpose-built QA namespace tends to use: a `static let`
# holding the identifier string outright, and a `static func` building one per item. An enum-case
# parser alone sees a file like Bazaar's `A11y.swift` — 60 identifiers — as declaring nothing.
_STATIC_LET = re.compile(r"^\s*static\s+let\s+([A-Za-z_]\w*)\s*(?::\s*String\s*)?=\s*\"((?:[^\"\\]|\\.)*)\"")
_STATIC_FUNC = re.compile(r"^\s*static\s+func\s+([A-Za-z_]\w*)\s*\([^)]*\)\s*->\s*String\s*\{\s*"
                          r"(?:return\s+)?\"((?:[^\"\\]|\\.)*)\"")
_ACCESSOR_DECLARATION = re.compile(
    r"^\s*(?:(?:public|internal|fileprivate|private)\s+)?var\s+([A-Za-z_]\w*)\s*:\s*String\s*\{")
_FUNCTION_DECLARATION = re.compile(r"func\s+([A-Za-z_]\w*)\s*\(")
# A candidate identifier wrapper: one leading `String` parameter, whose name is captured so the
# body can be checked for actually passing *it* to the identifier call. Trailing parameters are
# allowed — `setAccessibilityIdentifier(with:ignoreSubviews:)` has a second one with a default.
_HELPER_DECLARATION = re.compile(
    r"func\s+([A-Za-z_]\w*)\s*\(\s*(?:([A-Za-z_]\w*)\s+)?([A-Za-z_]\w*)\s*:\s*String\b")

# String interpolation of an enum case yields the CASE NAME, not the raw value — `"\(self)"` on
# `case foo = "bar"` is "foo". Six accessors in the target app are written this way, and reading
# them as the raw value is a silent wrong answer.
_ACCESSOR_BODIES = (
    (re.compile(r"^return\s+(?:self\.)?rawValue$"), "identity", None),
    (re.compile(r"^return\s+(?:self\.)?rawValue\.capitalized$"), "transform", "capitalized"),
    (re.compile(r"^return\s+(?:self\.)?rawValue\.capitalizedFirst$"), "transform", "capitalizedFirst"),
    (re.compile(r"^return\s+(?:self\.)?capitalizedFirstLetter$"), "transform", "capitalizedFirst"),
    (re.compile(r"^return\s+\"\\\(self\)\"$"), "case-name", None),
    (re.compile(r"^return\s+String\(describing:\s*self\)$"), "case-name", None),
    (re.compile(r"^return\s+\"([^\"\\]*)\\\(self\)\"$"), "prefixed-case-name", None),
)

_STRING_LITERAL = re.compile(r"\"(?:[^\"\\]|\\.)*\"")
_LINE_COMMENT = re.compile(r"//.*$")
_INTERPOLATION_SLOT = re.compile(r"\\\(([^()]*(?:\([^()]*\))?[^()]*)\)")


@dataclass
class EnumCase:
    name: str
    raw_value: str | None  # None when the case declares no `= "…"`; Swift then defaults to the name
    line: int


@dataclass
class Accessor:
    """A computed `var <name>: String` on an enum, classified by what its body actually returns."""
    name: str
    kind: str  # identity | transform | case-name | prefixed-case-name | unresolved
    transform: str | None = None
    prefix: str = ""
    reason: str = ""


@dataclass
class Constant:
    """A `static let` or `static func` holding an identifier string directly, with no enum case."""
    name: str
    value: str          # the literal, which may carry `\\(…)` interpolation
    line: int
    is_function: bool


@dataclass
class EnumDecl:
    path: str            # dotted namespace path, e.g. "CartAccessibility.CartHeaderRow"
    file: str
    line: int
    raw_type: str | None
    is_private: bool
    cases: dict[str, EnumCase] = field(default_factory=dict)
    constants: dict[str, Constant] = field(default_factory=dict)
    accessors: dict[str, Accessor] = field(default_factory=dict)

    @property
    def symbol(self) -> str:
        """Qualified by file when file-private.

        17 enums in the target app are `private enum` inside a single view file, and two of those
        share one file. An unqualified name collides silently and resolves a call site against the
        wrong declaration, which is the same class of wrong answer this module exists to prevent.
        """
        return f"{self.file}::{self.path}" if self.is_private else self.path


def strip_noise(line: str) -> str:
    """Line with string literals and trailing comments blanked, for brace counting only.

    A `{` inside a string literal or a comment is not a scope, and miscounting one shifts every
    subsequent declaration into the wrong parent for the rest of the file.
    """
    return _LINE_COMMENT.sub("", _STRING_LITERAL.sub('""', line))


def classify_accessor(name: str, body: str) -> Accessor:
    """What a computed accessor returns, or an honest refusal.

    `switch self` is the common unresolvable shape — 41 of 86 accessor declarations in the target
    app answer per case, sometimes with a literal unrelated to the case at all. There is no generic
    value for those, so none is produced.
    """
    # The captured text still carries its own `var … {` header and closing brace; the body is what
    # sits between them.
    condensed = " ".join(body.split())
    if "{" in condensed:
        condensed = condensed.split("{", 1)[1]
    condensed = condensed.rsplit("}", 1)[0] if "}" in condensed else condensed
    condensed = condensed.strip()
    if "switch" in condensed:
        return Accessor(name, "unresolved", reason="switches on self; answers per case")
    statements = [part.strip() for part in condensed.split(";") if part.strip()]
    single = statements[0] if len(statements) == 1 else condensed
    for pattern, kind, transform in _ACCESSOR_BODIES:
        match = pattern.match(single)
        if match:
            prefix = match.group(1) if kind == "prefixed-case-name" else ""
            return Accessor(name, kind, transform, prefix)
    return Accessor(name, "unresolved", reason=f"body not statically resolvable: {single[:60]}")


def apply_transform(text: str, transform: str | None) -> str:
    """Swift's own semantics, not Python's near-equivalents.

    Both transforms in use lowercase the remainder, so `leftImageView` becomes `Leftimageview` —
    not `LeftImageView`. Getting this wrong produces an identifier that looks right in review and
    matches nothing at run time. `capitalizedFirst` is
    `prefix(1).uppercased() + self.lowercased().dropFirst()`
    (`SwiftPackages/BlibliSellerChatIOS/…/Utility/Extensions.swift:526`); Swift's built-in
    `.capitalized` uppercases each word's first letter and lowercases the rest, which for a
    single camelCase token is the same answer.
    """
    if not text or transform is None:
        return text
    if transform in ("capitalized", "capitalizedFirst"):
        return text[:1].upper() + text[1:].lower()
    return text


def parse_enums(text: str, display_path: str) -> dict[str, EnumDecl]:
    """Every enum in one file, keyed by dotted path, with its cases and computed accessors.

    Brace-depth tracking rather than a regex sweep, because the namespaces nest: `CartAccessibility`
    is a bare `enum` holding six String-raw enums, and `AccessibilityIdentifierHelper` is a class
    holding a lowercase `accessibilityId` enum holding more. A flat scan attributes an inner case to
    the outer type and resolves every one of them wrongly.
    """
    found: dict[str, EnumDecl] = {}
    stack: list[tuple[str, int, EnumDecl | None]] = []  # (name, depth_at_open, decl if enum)
    depth = 0
    pending_accessor: tuple[Accessor | None, str, int, EnumDecl] | None = None
    accessor_lines: list[str] = []
    accessor_depth = 0

    for number, raw_line in enumerate(text.splitlines(), start=1):
        line = strip_noise(raw_line)
        current = stack[-1][2] if stack and stack[-1][2] else None

        if pending_accessor is not None:
            accessor_lines.append(line)
            depth += line.count("{") - line.count("}")
            if depth <= accessor_depth:
                _, name, _, owner = pending_accessor
                body = "\n".join(accessor_lines)
                body = body[:body.rfind("}")] if "}" in body else body
                owner.accessors[name] = classify_accessor(name, body)
                pending_accessor, accessor_lines = None, []
            continue

        declaration = _ENUM_DECLARATION.match(line)
        if declaration:
            visibility, kind, name, inherits = declaration.groups()
            path = ".".join([entry[0] for entry in stack] + [name])
            # A `struct` or `class` is a namespace too, and a namespace of `static let`s is a
            # perfectly ordinary way to hold identifiers — restricting this to `enum` misses them.
            raw_type = (inherits or "").split(",")[0].strip() or None
            decl = EnumDecl(path=path, file=display_path, line=number, raw_type=raw_type,
                            is_private=visibility in ("private", "fileprivate"))
            found[path] = decl
            stack.append((name, depth, decl))
            depth += line.count("{") - line.count("}")
            continue

        if current is not None:
            accessor = _ACCESSOR_DECLARATION.match(line)
            if accessor:
                accessor_depth = depth
                pending_accessor = (None, accessor.group(1), number, current)
                accessor_lines = [line]
                depth += line.count("{") - line.count("}")
                continue
            # Read declarations off the RAW line: `strip_noise` blanks string literals so braces can
            # be counted safely, and a case's `= "Unselected_Checkbox"` is exactly such a literal.
            # Parsing the stripped line resolves every explicit raw value to the empty string.
            source_line = _LINE_COMMENT.sub("", raw_line)
            case_line = _CASE_DECLARATION.match(source_line)
            if case_line and "(" not in case_line.group(1):
                for item in case_line.group(1).split(","):
                    match = _CASE_ITEM.match(item.strip())
                    if match:
                        current.cases[match.group(1)] = EnumCase(match.group(1), match.group(2), number)
            constant = _STATIC_LET.match(source_line)
            if constant:
                current.constants[constant.group(1)] = Constant(
                    constant.group(1), constant.group(2), number, is_function=False)
            builder = _STATIC_FUNC.match(source_line)
            if builder:
                current.constants[builder.group(1)] = Constant(
                    builder.group(1), builder.group(2), number, is_function=True)

        opened, closed = line.count("{"), line.count("}")
        depth += opened - closed
        while stack and depth <= stack[-1][1]:
            stack.pop()

    return found


def display_path(path: Path, root: Path | None) -> str:
    return str(path.relative_to(root)) if root and path.is_relative_to(root) else str(path)


def repo_root(start: Path) -> Path | None:
    """The enclosing git working tree, or None.

    This is the default *declaration* root. A module's identifiers are routinely declared outside
    the module — in a sibling feature or a local SPM package under `SwiftPackages/` — so resolving
    declarations only within the scanned folder reports them as `enum-not-found` and depresses the
    resolution rate of exactly the modules that share the most code. The repo is the natural
    boundary: wide enough to see every in-repo declaration, narrow enough to exclude the rest of
    the machine.
    """
    for candidate in [start, *start.parents]:
        if (candidate / ".git").exists():
            return candidate
    return None


def enum_table(files: list[Path], root: Path | None = None) -> dict[str, EnumDecl]:
    """Every enum across the scope, keyed by `symbol` (file-qualified when private)."""
    table: dict[str, EnumDecl] = {}
    for path in files:
        try:
            text = path.read_text(errors="ignore")
        except OSError:
            continue
        if "enum" not in text:
            continue
        for decl in parse_enums(text, display_path(path, root)).values():
            table[decl.symbol] = decl
    return table


def lookup_enum(enum_path: str, table: dict[str, EnumDecl],
                same_file: str = "") -> tuple[EnumDecl | None, list[EnumDecl]]:
    """Resolve a call site's dotted path to a declaration, or report why it could not be.

    Returns `(declaration, rivals)`. `rivals` is non-empty only when the path was **ambiguous** —
    several equally-good public declarations matched and none is more correct than another. The
    caller reports that rather than picking one.

    A call site often writes a shorter path than the declaration's full nesting — inside
    `CartAccessibility` a sibling is reached as `CartHeaderRow.x`, not
    `CartAccessibility.CartHeaderRow.x` — so an exact match is tried first, then a suffix match.
    File-private declarations win within their own file, which is what keeps the 17 colliding
    `private enum AccessibilityIdentifier` declarations apart.

    **Why ambiguity is surfaced rather than resolved by precedence.** The suffix match is what makes
    a shortened path resolvable at all, and it is also what lets two unrelated types collide: 234
    leaf names in this repo are declared by more than one public type. Returning the first is a
    silent wrong answer, and widening the declaration search to the whole repo (which is the point
    of `--source-root`) can only add collisions. A wider search must not turn "unknown" into a
    guess, so a tie is reported as `ambiguous-declaration` with the rivals named.
    """
    private_here = f"{same_file}::{enum_path}"
    if private_here in table:
        return table[private_here], []
    if enum_path in table:
        return table[enum_path], []
    candidates = [decl for key, decl in table.items()
                  if decl.path == enum_path or decl.path.endswith(f".{enum_path}")]
    local = [decl for decl in candidates if decl.file == same_file]
    if local:
        return local[0], []
    public = [decl for decl in candidates if not decl.is_private]
    if len(public) == 1:
        return public[0], []
    if len(public) > 1:
        # Prefer a declaration that actually carries identifiers: a `CodingKeys` colliding with a
        # real identifier enum is not a genuine tie, and treating it as one loses a resolution the
        # narrow scan used to get right.
        bearing = [decl for decl in public if decl.cases or decl.constants]
        if len(bearing) == 1:
            return bearing[0], []
        return None, (bearing or public)
    return (candidates[0], []) if len(candidates) == 1 else (None, [])


def resolve_symbol(expression: str, table: dict[str, EnumDecl], same_file: str = "") -> dict[str, object]:
    """A dotted call-site expression to the string the app sets, or a named refusal.

    Returns `valueSource: "viewmodel-derived"` rather than a value when the expression is not an
    enum reference this module can follow — a method call, a subscript, a constructor.
    """
    parts = expression.strip().split(".")
    if len(parts) < 2 or any(not part or "(" in part for part in parts):
        return {"valueSource": "viewmodel-derived", "expression": expression.strip()}

    accessor_name = parts[-1] if parts[-1] in ACCESSOR_NAMES else None
    case_index = len(parts) - (2 if accessor_name else 1)
    case_name = parts[case_index]
    enum_path = ".".join(parts[:case_index])
    if not enum_path:
        return {"valueSource": "viewmodel-derived", "expression": expression.strip()}

    decl, rivals = lookup_enum(enum_path, table, same_file)
    if decl is None and rivals:
        named = ", ".join(f"{rival.path} ({rival.file})" for rival in rivals[:3])
        return {"valueSource": "literal", "valueResolution": "ambiguous-declaration",
                "symbol": f"{enum_path}.{case_name}", "accessor": accessor_name,
                "candidates": [{"path": rival.path, "file": rival.file} for rival in rivals],
                "unresolvedReason": f"{len(rivals)} declarations match {enum_path}: {named}"}
    if decl is None:
        return {"valueSource": "literal", "valueResolution": "enum-not-found",
                "symbol": f"{enum_path}.{case_name}", "accessor": accessor_name,
                "unresolvedReason": f"no declaration for {enum_path} under the declaration root"}

    constant = decl.constants.get(case_name)
    if constant is not None:
        # A `static let`/`static func` holds the identifier outright — there is no raw value and no
        # accessor in the path. An interpolated one is a pattern, exactly as an inline interpolated
        # literal is, and is never collapsed to a concrete string.
        common = {"symbol": f"{decl.path}.{constant.name}", "declaredIn": decl.file,
                  "declaredAtLine": constant.line}
        placeholders = _INTERPOLATION_SLOT.findall(constant.value)
        if placeholders or constant.is_function:
            pattern = _INTERPOLATION_SLOT.sub(
                lambda match: "{" + (re.findall(r"[A-Za-z_]\w*", match.group(1)) or ["value"])[-1] + "}",
                constant.value)
            return {**common, "valueSource": "interpolated", "valuePattern": pattern,
                    "placeholders": [{"name": (re.findall(r"[A-Za-z_]\w*", expression) or ["value"])[-1],
                                      "expression": expression.strip(), "resolvedAt": "runtime"}
                                     for expression in placeholders]}
        return {**common, "valueSource": "literal", "value": constant.value,
                "valueResolution": "static-constant"}

    entry = decl.cases.get(case_name)
    if entry is None:
        return {"valueSource": "literal", "valueResolution": "case-not-found",
                "symbol": f"{decl.path}.{case_name}", "accessor": accessor_name,
                "declaredIn": decl.file,
                "unresolvedReason": f"{decl.path} declares no case or constant {case_name}"}

    accessor = _accessor_for(decl, accessor_name)
    common = {"symbol": f"{decl.path}.{case_name}", "accessor": accessor_name,
              "declaredIn": decl.file, "declaredAtLine": entry.line, "valueSource": "literal"}

    if accessor.kind == "unresolved":
        return {**common, "valueResolution": "accessor-unresolved",
                "unresolvedReason": f"accessor `{accessor.name}` {accessor.reason}"}
    if accessor.kind in ("case-name", "prefixed-case-name"):
        # Interpolating an enum yields the case name even when a raw value is declared.
        return {**common, "value": f"{accessor.prefix}{case_name}",
                "valueResolution": "accessor-transformed",
                "accessorReturns": "case-name" + (" with literal prefix" if accessor.prefix else "")}

    base = entry.raw_value if entry.raw_value is not None else case_name
    if accessor.kind == "transform":
        return {**common, "value": apply_transform(base, accessor.transform),
                "valueResolution": "accessor-transformed", "transform": accessor.transform,
                "rawValue": base}
    return {**common, "value": base,
            "valueResolution": "explicit-raw" if entry.raw_value is not None else "case-name"}


def _accessor_for(decl: EnumDecl, name: str | None) -> Accessor:
    """The accessor the call site named, falling back to the protocol-extension default.

    `.rawValue` is the language builtin and always identity. `.value` is usually the shared
    `RawRepresentable` extension, not a per-enum declaration — an enum that shadows it wins.
    """
    if name is None:
        return Accessor("rawValue", "identity")
    if name in decl.accessors:
        return decl.accessors[name]
    if name in PROTOCOL_DEFAULT_ACCESSORS:
        kind, transform = PROTOCOL_DEFAULT_ACCESSORS[name]
        return Accessor(name, kind, transform)
    return Accessor(name, "unresolved", reason="is declared nowhere this scan can see")


def identifier_helpers(files: list[Path], helper_roots: list[Path] | None = None,
                       display_root: Path | None = None) -> dict[str, str]:
    """Project-local wrappers around the identifier setter, and where each was declared.

    Extends `scan_scope.py:179` in two ways the target app forces.

    **Reach.** The single most common applier there — `setAccessibilityIdentifier(with:ignoreSubviews:)`,
    ~2,240 call sites — is declared *outside the repo*, in the `BlibliCommonUI` SPM checkout. A scan
    of the app's own files finds no declaration for it, so a set built only from those files reports
    the most-used applier in the codebase as unknown. `--helper-root` supplies the checkout paths.

    **Precision.** `scan_scope.py`'s rule — any function with `accessibilityIdentifier` within 400
    characters of its declaration — is right for a per-file boolean and far too loose for deciding
    which *call* applies an identifier. Run as-is against the target app it nominates `viewDidLoad`,
    `tableView`, `setupView` and `addBorder`, because those set identifiers on their own subviews;
    treating them as appliers invents ~1,300 identifier sites whose argument is an unrelated
    parameter. A wrapper here must take a single `String` and pass *that parameter* to the
    identifier call — which is what makes its argument the identifier.

    **Provenance.** Where a wrapper is declared is recorded as its path rather than a bare
    "in-scope", because with a repo-wide declaration root the answer is genuinely informative: a
    wrapper resolved from `SwiftPackages/…` is a different fact from one resolved from the module
    being scanned, and a reader auditing an identifier needs to know which.
    """
    helpers: dict[str, str] = {}
    sources: list[tuple[list[Path], str | None]] = [(files, None)]
    sources += [(sorted(root.rglob("*.swift")), f"helper-root:{root.name}") for root in (helper_roots or [])]
    for source, fixed_origin in sources:
        for path in source:
            try:
                text = path.read_text(errors="ignore")
            except OSError:
                continue
            if "ccessibilityIdentifier" not in text:
                continue
            for match in _HELPER_DECLARATION.finditer(text):
                name, parameter = match.group(1), match.group(3)
                body = text[match.end(): match.end() + 400]
                applies = re.search(rf"[aA]ccessibilityIdentifier\s*[(=]\s*{re.escape(parameter)}\b", body)
                if applies and name not in helpers:
                    helpers[name] = fixed_origin or display_path(path, display_root)
    helpers.pop("accessibilityIdentifier", None)
    return helpers


def identifier_digest(decls: dict[str, EnumDecl], sites: list[dict]) -> str:
    """sha256 over the identifier *facts* a file declares and applies, not over its lines.

    A whole-file hash changes on every unrelated edit, so it gets ignored within a week and stops
    being a signal. The obvious refinement — hash the lines that mention `accessibilityIdentifier`
    — is worse than it looks: an enum case is frequently the identifier itself (847 sites in the
    target app resolve from the bare case name), and `case sellerName` mentions nothing. Renaming
    it changes every identifier it feeds while leaving such a digest untouched, which is precisely
    the drift this is supposed to catch.

    So the digest is taken over what was resolved: each declaration's path, case/constant name and
    value, each accessor's classified behaviour, and each call site's applier and resolved value.
    It changes when an identifier changes and at no other time.

    Sorted, because reordering declarations changes no identifier.
    """
    facts: list[str] = []
    for decl in decls.values():
        for case in decl.cases.values():
            facts.append(f"case {decl.path}.{case.name}={case.raw_value if case.raw_value is not None else ''}")
        for constant in decl.constants.values():
            facts.append(f"const {decl.path}.{constant.name}={constant.value}")
        for accessor in decl.accessors.values():
            facts.append(f"accessor {decl.path}.{accessor.name}={accessor.kind}:{accessor.transform or ''}")
    for site in sites:
        facts.append(f"site {site.get('applier')}={site.get('value', site.get('valuePattern', site.get('expression', '')))}")
    return hashlib.sha256("\n".join(sorted(facts)).encode("utf-8")).hexdigest()


def detect_platform(scope: Path, flag: str | None = None) -> tuple[str, str]:
    """The platform, and how it was decided — both, always.

    A wrong platform silently selects the wrong locator vocabulary, and every entry produced is then
    wrong in a way nothing downstream can detect. So two competing project markers is a refusal
    rather than a precedence rule, and the winning signal is recorded in the output so a reader
    never has to re-derive it.
    """
    if flag and flag != "auto":
        return flag, "flag"
    from_env = os.environ.get("TEST_FORGE_PLATFORM", "").strip()
    if from_env:
        return from_env, "env"

    roots = [scope, *scope.parents][:4]
    markers: dict[str, str] = {}
    for root in roots:
        if not root.is_dir():
            continue
        for pattern, platform in (("*.xcodeproj", "ios"), ("*.xcworkspace", "ios"),
                                  ("Package.swift", "ios"), ("settings.gradle", "android"),
                                  ("settings.gradle.kts", "android"), ("package.json", "web")):
            for hit in root.glob(pattern):
                if platform == "web" and "@playwright/test" not in hit.read_text(errors="ignore"):
                    continue
                markers.setdefault(platform, f"auto:{hit.name}")
        if markers:
            break

    if len(markers) > 1:
        named = ", ".join(f"{platform} ({source.split(':', 1)[1]})" for platform, source in sorted(markers.items()))
        # Exit 2, not 1: an ambiguous scope is a caller error to fix with `--platform`, and a CI
        # gate should be able to tell it apart from a scan that ran and found something.
        print(f"two platform markers under {scope}: {named}.\n"
              "Pass --platform to say which one this scope is — guessing selects the wrong locator "
              "vocabulary and every entry is then wrong undetectably.", file=sys.stderr)
        raise SystemExit(2)
    if markers:
        platform, source = next(iter(markers.items()))
        return platform, source

    counts = {"ios": len(list(scope.rglob("*.swift"))), "android": len(list(scope.rglob("*.kt"))),
              "web": len(list(scope.rglob("*.tsx")))}
    best = max(counts, key=lambda key: counts[key])
    if counts[best] == 0:
        raise SystemExit(f"no platform marker and no source files under {scope} — pass --platform.")
    return best, "auto:sources"


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: a11y_map.py <folder>", file=sys.stderr)
        return 2
    scope = Path(sys.argv[1])
    if not scope.is_dir():
        print(f"not a directory: {scope}", file=sys.stderr)
        return 2
    platform, source = detect_platform(scope)
    files = sorted(path for path in scope.rglob("*.swift") if "Test" not in path.name)
    table = enum_table(files, scope)
    holding = [decl for decl in table.values() if decl.cases or decl.constants]
    print(f"platform    {platform}  ({source})")
    print(f"swift       {len(files)} file(s)")
    print(f"namespaces  {len(table)} parsed, {len(holding)} declare cases or constants")
    print(f"accessors   {sum(len(decl.accessors) for decl in table.values())} computed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
