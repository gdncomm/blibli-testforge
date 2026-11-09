#!/usr/bin/env python3
"""Classifies a code-reference file path into a `Module/Submodule` pair, so generated output
lands in `<UITestRoot>/<Module>/<Submodule>/` without inventing a parallel taxonomy.

The taxonomy itself is data, not code: a project supplies its own module map and this script
applies it. Without one, the fallback is the plain shape almost every app already has -- the
top-level folder is the module and the next folder down is the submodule.

Matching order, when a taxonomy is supplied: a *promoted* module's real code location(s) are
checked first, so a promoted module takes priority over the architecture folder it physically
lives inside. Only when no promoted location matches does the path fall back to the plain
"top-level folder = remaining module" rule. Every module has a "General" submodule for anything
that doesn't match a finer bucket -- the fallback is always "General", never blank.

A promoted module may carry `submoduleFolders` when its submodules each live in their own
subfolder rather than sharing one flat location. Those are matched deepest-first, so a folder
that is a parent of another never shadows it.

Taxonomy file shape:

    {
      "rootMarker": "<repo dir to strip from an absolute path>",
      "promoted": {
        "<Module>": {
          "locations": ["<path>", ...],
          "submodules": ["<Name>", ..., "General"],
          "submoduleFolders": [["<Submodule>", "<folder>"], ...]   // optional
        }
      },
      "remaining": { "<Module>": ["<Submodule>", ..., "General"] }
    }

Usage:
    classify_module.py "<path>" [--taxonomy <file.json>]

Resolved in order: --taxonomy, $TEST_FORGE_TAXONOMY, ./.claude/test-flow-recorder/taxonomy.json.

Output: "<Module>/<Submodule>", one line, on stdout.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys

DEFAULT_TAXONOMY = pathlib.Path(".claude/test-flow-recorder/taxonomy.json")
EMPTY_TAXONOMY = {"rootMarker": "", "promoted": {}, "remaining": {}}


def load_taxonomy(explicit: str | None) -> dict:
    """An absent taxonomy is a normal state, not an error: most apps have no module document, and
    the folder-shape fallback classifies them perfectly well. A named-but-missing one is an error,
    because the caller asked for something specific."""
    if explicit:
        path = pathlib.Path(explicit)
        if not path.exists():
            raise SystemExit(f"taxonomy not found: {path}")
    else:
        env = os.environ.get("TEST_FORGE_TAXONOMY")
        path = pathlib.Path(env) if env else DEFAULT_TAXONOMY
        if not path.exists():
            return dict(EMPTY_TAXONOMY)
    return json.loads(path.read_text())




def normalize_path(raw_path: str, root_marker: str) -> str:
    """Strips a leading repo-root marker (if present) and any leading slash, and normalizes
    backslashes to forward slashes, so both an absolute host path and a repo-relative path
    classify the same way."""
    path = raw_path.replace("\\", "/")
    if root_marker:
        marker_index = path.find(root_marker)
        if marker_index != -1:
            path = path[marker_index + len(root_marker):]
    return path.lstrip("/")


def normalize_segment(segment: str) -> str:
    """Lowercases and strips non-alphanumeric characters, so "product-card", "ProductCard" and
    "product_card" all compare equal."""
    return re.sub(r"[^a-z0-9]", "", segment.lower())


def match_submodule(path_segments, submodules) -> str:
    """Returns the submodule (other than "General") matching any of `path_segments`, else "General".

    Exact matches win outright. Only when none match does a prefix pass run, so a folder that
    extends a submodule's name still classifies correctly -- a versioned "CheckoutRevamp-2026" as
    Checkout, "HomeScreen" as Home. That pass takes the *longest* matching submodule, so a short
    name never shadows a longer one it happens to prefix ("Blu" must not claim "BluQris")."""
    normalized_submodules = {normalize_segment(name): name for name in submodules if name != "General"}

    for segment in path_segments:
        normalized_segment = normalize_segment(segment)
        if normalized_segment in normalized_submodules:
            return normalized_submodules[normalized_segment]

    for segment in path_segments:
        normalized_segment = normalize_segment(segment)
        prefixes = [key for key in normalized_submodules if normalized_segment.startswith(key)]
        if prefixes:
            return normalized_submodules[max(prefixes, key=len)]

    return "General"


def match_promoted(norm_path: str, promoted: dict):
    """Returns (module, submodule) for the best (longest/most specific location prefix) Promoted
    module match, or None if no Promoted module's location matches `norm_path` at all."""
    best_module = None
    best_location = ""
    for module, info in promoted.items():
        for location in info["locations"]:
            is_exact_or_prefix = norm_path == location or norm_path.startswith(location + "/")
            if is_exact_or_prefix and len(location) > len(best_location):
                best_module = module
                best_location = location

    if best_module is None:
        return None

    info = promoted[best_module]
    if info.get("submoduleFolders"):
        return best_module, match_submodule_folders(norm_path, info["submoduleFolders"])

    rest = norm_path[len(best_location):].lstrip("/")
    submodule = match_submodule(rest.split("/") if rest else [], info["submodules"])
    return best_module, submodule


def match_submodule_folders(norm_path: str, submodule_folders) -> str:
    """For a module whose submodules each own a distinct subfolder rather than sharing a flat
    location. One submodule's folder is often a parent of another's, so the deepest (longest)
    matching folder wins -- compared by length rather than relying on list order."""
    best_submodule = "General"
    best_folder_length = -1
    for submodule, folder in submodule_folders:
        is_exact_or_prefix = norm_path == folder or norm_path.startswith(folder + "/")
        if is_exact_or_prefix and len(folder) > best_folder_length:
            best_submodule = submodule
            best_folder_length = len(folder)
    return best_submodule


def match_remaining(norm_path: str, remaining: dict):
    """Returns (module, submodule) via the plain "top-level folder = module" rule, or None when
    the top-level folder isn't a known Remaining module."""
    segments = norm_path.split("/")
    top_level_folder = segments[0] if segments and segments[0] else ""
    if top_level_folder not in remaining:
        return None
    submodule = match_submodule(segments[1:], remaining[top_level_folder])
    return top_level_folder, submodule


def match_by_folder_shape(norm_path: str):
    """The no-taxonomy fallback: top-level folder is the module, the next one down the submodule.

    Right for the great majority of apps, which have no module document to read -- and honest when
    it is wrong, because it names folders that actually exist rather than inventing a bucket.
    """
    segments = [segment for segment in norm_path.split("/") if segment]
    if not segments:
        return None
    module = segments[0]
    # The last segment is the file itself, so a two-segment path has no submodule folder.
    submodule = segments[1] if len(segments) > 2 else "General"
    return module, submodule


def classify(raw_path: str, taxonomy: dict | None = None) -> str:
    taxonomy = taxonomy if taxonomy is not None else dict(EMPTY_TAXONOMY)
    norm_path = normalize_path(raw_path, taxonomy.get("rootMarker", ""))

    for match in (match_promoted(norm_path, taxonomy.get("promoted", {})),
                  match_remaining(norm_path, taxonomy.get("remaining", {}))):
        if match is not None:
            module, submodule = match
            return f"{module}/{submodule}"

    if not taxonomy.get("promoted") and not taxonomy.get("remaining"):
        shaped = match_by_folder_shape(norm_path)
        if shaped is not None:
            return f"{shaped[0]}/{shaped[1]}"

    # A taxonomy was supplied and the path matches nothing in it -- callers should confirm the
    # code-reference path rather than silently generating into a nonsensical location.
    return "UNKNOWN/General"


def main() -> None:
    arguments = sys.argv[1:]
    taxonomy_path = None
    if "--taxonomy" in arguments:
        index = arguments.index("--taxonomy")
        taxonomy_path = arguments[index + 1] if index + 1 < len(arguments) else None
        del arguments[index:index + 2]
    if len(arguments) != 1:
        print("Usage: classify_module.py <file-path> [--taxonomy <file.json>]", file=sys.stderr)
        sys.exit(1)

    print(classify(arguments[0], load_taxonomy(taxonomy_path)))


if __name__ == "__main__":
    main()
