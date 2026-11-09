#!/usr/bin/env python3
"""Wires an arbitrary Xcode project to TestForgeDriverKit, so the harness is an install rather than a paste.

Reads `project.pbxproj` through `plutil` — it is an OpenStep plist, so no third-party parser is
needed — and writes only by inserting lines. Nothing here reserialises the project file: a tool that
rewrites it reorders every object and silently drops what it cannot round-trip, which is why the
final gate is that the diff shows zero deleted lines.

What it changes, all additive:
  * a Swift package reference (local path or remote URL), if the project has none for TestForgeDriverKit
  * the `TestForgeDriverKit` product attached to the UI test target, and nothing else
  * a 4-line subclass declaring the test method, in that target
  * `TestForgeDriver.xcscheme` and `TestForgeDriver.xctestplan`, generated with this project's own identifiers
  * `.claude/settings.json` env, so the MCP servers know which app they are driving,
    `TEST_FORGE_TAXONOMY` when the project carries a module taxonomy, and `TEST_FORGE_DATA_PLANE` (`simctl` or its
    alias `networklens` — NetworkLens under the booted simulator is the only mock channel)

Never edits app source.

Usage:
    test_forge_init.py --project <path/to/App.xcodeproj> --bundle-id <id>
        [--ui-test-target NAME] [--app-target NAME]
        [--package-path <dir> | --package-url <url> --package-ref <branch-or-revision>]
        [--media-root NAME] [--taxonomy <file.json>]
        [--data-plane simctl|networklens] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import uuid
from pathlib import Path

UI_TEST_TYPE = "com.apple.product-type.bundle.ui-testing"
APP_TYPE = "com.apple.product-type.application"
PRODUCT_NAME = "TestForgeDriverKit"
SHIM_NAME = "TestForgeDriverSession.swift"
# Ordered: a taxonomy describes the app's own structure, so a tracked path is the better home and
# is looked for first. The second is classify_module.py's own default, worth pointing at anyway --
# see find_taxonomy.
TAXONOMY_CANDIDATES = ("qa/taxonomy.json", ".claude/test-flow-recorder/taxonomy.json")


def find_taxonomy(root: Path, explicit: Path | None) -> Path | None:
    """classify_module.py resolves a taxonomy through --taxonomy, then $TEST_FORGE_TAXONOMY, then a
    *relative* .claude/test-flow-recorder/taxonomy.json. That last one only resolves when the cwd
    happens to be the project root, and a project that gitignores .claude/ cannot keep its
    taxonomy there at all -- so an absolute TEST_FORGE_TAXONOMY is what makes one reachable from
    anywhere, and the only thing that finds one kept at a tracked path.

    No taxonomy is a normal state: classification falls back to folder shape, which is right for
    most apps. Only a taxonomy named explicitly and then missing is an error."""
    if explicit:
        path = explicit if explicit.is_absolute() else root / explicit
        if not path.exists():
            raise SystemExit(f"taxonomy not found: {path}")
        return path.resolve()
    for candidate in TAXONOMY_CANDIDATES:
        path = root / candidate
        if path.exists():
            return path.resolve()
    return None


def under(path: Path, root: Path) -> str:
    """Display form: relative inside the project, absolute outside it."""
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


def run(command: list[str]) -> str:
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"{' '.join(command[:3])}… failed:\n{result.stderr.strip()}")
    return result.stdout


def parse_swift_package_list(path: Path) -> list[tuple[str, str]]:
    """(url, tag) pairs from a SwiftPackageList.txt, skipping blanks/comments — same shape
    scripts/spm-cache/spm_cache.py's own `requirements()` reads."""
    import csv
    entries = []
    with path.open(newline="") as stream:
        for row in csv.reader(stream):
            if not row or not row[0].strip() or row[0].lstrip().startswith("#"):
                continue
            if len(row) == 2:
                entries.append((row[0].strip(), row[1].strip()))
    return entries


def check_local_package_governance(root: Path, package_path: Path, pin_tag: str | None) -> Path:
    """Some host projects manage every local SPM override through a SwiftPackageList.txt +
    scripts/spm-cache/spm_cache.py pair: every XCLocalSwiftPackageReference must resolve under
    `<root>/SwiftPackages/<name>`, and that tool is strictly tag-based (hardcodes refs/tags/<tag>
    in its own checks) — a branch reference works for one fresh clone and then breaks on every
    later `status`/`download`. None of this is specific to TestForgeDriverKit; any local package a host
    project attaches this way hits the same shape of problem, so it's cheaper to catch here, before
    a single line is written, than to let it surface as a generic failure deep in a build log.

    Returns the package path test-forge-init should actually wire up — either the one it was given
    (no governance in play, or already inside the managed directory) or the corrected managed path.
    """
    package_list = root / "SwiftPackageList.txt"
    managed_dir = root / "SwiftPackages"
    if not package_list.exists() or not any(root.glob("**/spm_cache.py")):
        return package_path  # this project doesn't govern local packages this way
    resolved = package_path.resolve()
    if resolved == managed_dir.resolve() or managed_dir.resolve() in resolved.parents:
        return package_path  # already the managed path itself

    remote = run(["git", "-C", str(resolved), "remote", "get-url", "origin"]).strip()
    entries = parse_swift_package_list(package_list)
    match = next((e for e in entries if e[0].rstrip("/") == remote.rstrip("/")), None)
    if match is None:
        names = ", ".join(e[0] for e in entries) or "none"
        raise SystemExit(
            f"{package_path} (remote {remote!r}) is not declared in {package_list}, and that file "
            f"governs every local SPM override for this project — an XCLocalSwiftPackageReference "
            f"outside {managed_dir} will fail this project's own build, late and generically "
            f"('Local package is not managed by SwiftPackageList.txt'), not here.\n"
            f"Known repos there: {names}\n"
            f"Add a line for it (`{remote}, <tag>`, a real git tag — branches are not supported by "
            f"that tool), or point --package-path at one already declared."
        )
    name = match[0].rstrip("/").split("/")[-1].removesuffix(".git")
    current_tag = match[1]
    head_ref = run(["git", "-C", str(resolved), "rev-parse", "--abbrev-ref", "HEAD"]).strip()
    # A project's own `make download` target (typically wrapping this same script with
    # retention/env setup) is the documented, developer-facing entry point when it exists — prefer
    # pointing at that over the raw script underneath it.
    makefile = root / "Makefile"
    has_make_target = makefile.exists() and re.search(r"(?m)^download:", makefile.read_text())
    download_cmd = "make download" if has_make_target else "bash SwiftPackages.sh download"

    if pin_tag:
        # Auto-reconcile: create+push the tag, rewrite the SwiftPackageList.txt line, and hand
        # back the managed path. Still two remote-touching commands short of finished — see below.
        run(["git", "-C", str(resolved), "tag", pin_tag])
        run(["git", "-C", str(resolved), "push", "origin", pin_tag])
        text = package_list.read_text()
        package_list.write_text(text.replace(f"{match[0]}, {current_tag}", f"{match[0]}, {pin_tag}"))
        print(f"  · {package_list.name}: {name} {current_tag} -> {pin_tag} (tag created+pushed on "
              f"{head_ref})")
        print(f"  · after this run, close Xcode and `{download_cmd}` from {root} "
              f"to fetch it into {managed_dir / name}")
        return managed_dir / name

    raise SystemExit(
        f"{package_path} is a checkout of {remote!r}, which {package_list.name} already manages "
        f"at tag {current_tag!r} (-> {managed_dir / name}) — {resolved} is a second, unmanaged "
        f"checkout of the same repo, which this project's own build will reject.\n"
        f"Either:\n"
        f"  · re-run with --package-pin-tag <new-tag-name> to have test-forge-init create+push that tag on "
        f"this checkout's HEAD ({head_ref}), repoint {package_list.name}'s {name} line to it, and "
        f"tell you the one remaining command ({download_cmd}); or\n"
        f"  · point --package-path at {managed_dir / name} once it already carries what you need."
    )


def load_objects(pbxproj: Path) -> dict:
    raw = run(["plutil", "-convert", "json", "-o", "-", str(pbxproj)])
    return json.loads(raw)["objects"]


def native_targets(objects: dict, product_type: str) -> list[tuple[str, dict]]:
    return [(uuid_key, value) for uuid_key, value in objects.items()
            if value.get("isa") == "PBXNativeTarget" and value.get("productType") == product_type]


def pick_target(candidates: list[tuple[str, dict]], wanted: str | None, kind: str) -> tuple[str, dict]:
    """Ambiguity is a hard failure, never a guess.

    A project routinely carries an unused Xcode-generated UI test target beside the real one, and a
    scheme pointed at the wrong one builds cleanly while driving nothing.
    """
    if wanted:
        for uuid_key, target in candidates:
            if target.get("name") == wanted:
                return uuid_key, target
        names = ", ".join(target.get("name", "?") for _, target in candidates) or "none"
        raise SystemExit(f"no {kind} target named {wanted!r}. Candidates: {names}")
    if not candidates:
        raise SystemExit(f"this project has no {kind} target — create one, then re-run")
    if len(candidates) > 1:
        names = ", ".join(sorted(target.get("name", "?") for _, target in candidates))
        flag = "--ui-test-target" if kind == "UI test" else "--app-target"
        raise SystemExit(f"{len(candidates)} {kind} targets ({names}) — pass {flag} to say which")
    return candidates[0]


def buildable_name(objects: dict, target: dict) -> str:
    reference = target.get("productReference")
    path = objects.get(reference, {}).get("path") if reference else None
    return path or f"{target.get('name', 'Unknown')}.app"


def fresh_uuid(existing: str) -> str:
    while True:
        candidate = uuid.uuid4().hex.upper()[:24]
        if candidate not in existing:
            return candidate


def insert_after(text: str, anchor: str, addition: str) -> str:
    if anchor not in text:
        raise SystemExit(f"could not find the insertion anchor: {anchor.strip()[:60]}")
    return text.replace(anchor, anchor + addition, 1)


def insert_before(text: str, anchor: str, addition: str) -> str:
    if anchor not in text:
        raise SystemExit(f"could not find the insertion anchor: {anchor.strip()[:60]}")
    return text.replace(anchor, addition + anchor, 1)


def register_package_reference(text: str, reference_uuid: str, comment: str) -> str:
    """Lists a package reference on the PBXProject object.

    Creating the reference object alone is not enough and fails quietly in the worst way: the project
    still opens, `-showTestPlans` still succeeds, and only `build-for-testing` reports
    `Missing package product`. Xcode resolves packages from this list, not from the objects table.
    """
    project_at = text.index("isa = PBXProject;")
    entry = f"\t\t\t\t{reference_uuid} /* {comment} */,\n"

    list_at = text.find("packageReferences = (\n", project_at)
    if list_at != -1:
        after = list_at + len("packageReferences = (\n")
        return text[:after] + entry + text[after:]

    anchor_at = text.index("\t\t\tproductRefGroup = ", project_at)
    block = f"\t\t\tpackageReferences = (\n{entry}\t\t\t);\n"
    return text[:anchor_at] + block + text[anchor_at:]


def package_reference_section(text: str, arguments, product_uuid: str) -> tuple[str, str]:
    """Adds the package reference itself when the project has none, and returns the clause that
    attaches a product to it. A *local* package product carries no `package =` key; a remote one
    must, or Xcode cannot resolve which package the product came from."""
    if arguments.package_path:
        relative = arguments.package_path
        if f'XCLocalSwiftPackageReference "{relative}"' in text:
            return text, ""
        reference_uuid = fresh_uuid(text)
        entry = (f"\t\t{reference_uuid} /* XCLocalSwiftPackageReference \"{relative}\" */ = {{\n"
                 f"\t\t\tisa = XCLocalSwiftPackageReference;\n"
                 f"\t\t\trelativePath = {relative};\n"
                 f"\t\t}};\n")
        if "/* Begin XCLocalSwiftPackageReference section */\n" in text:
            text = insert_after(text, "/* Begin XCLocalSwiftPackageReference section */\n", entry)
        else:
            header = ("/* Begin XCLocalSwiftPackageReference section */\n"
                      + entry + "/* End XCLocalSwiftPackageReference section */\n\n")
            text = insert_before(text, "/* Begin XCSwiftPackageProductDependency section */\n", header)
        text = register_package_reference(text, reference_uuid, f'XCLocalSwiftPackageReference "{relative}"')
        return text, ""

    reference_uuid = fresh_uuid(text)
    pin = ("branch" if not re.fullmatch(r"[0-9a-f]{40}", arguments.package_ref or "") else "revision")
    entry = (f"\t\t{reference_uuid} /* XCRemoteSwiftPackageReference \"TestForgeDriverKit\" */ = {{\n"
             f"\t\t\tisa = XCRemoteSwiftPackageReference;\n"
             f"\t\t\trepositoryURL = \"{arguments.package_url}\";\n"
             f"\t\t\trequirement = {{\n"
             f"\t\t\t\t{pin} = \"{arguments.package_ref}\";\n"
             f"\t\t\t\tkind = {pin};\n"
             f"\t\t\t}};\n"
             f"\t\t}};\n")
    if "/* Begin XCRemoteSwiftPackageReference section */\n" in text:
        text = insert_after(text, "/* Begin XCRemoteSwiftPackageReference section */\n", entry)
    else:
        header = ("/* Begin XCRemoteSwiftPackageReference section */\n"
                  + entry + "/* End XCRemoteSwiftPackageReference section */\n\n")
        text = insert_before(text, "/* Begin XCSwiftPackageProductDependency section */\n", header)
    text = register_package_reference(text, reference_uuid, 'XCRemoteSwiftPackageReference "TestForgeDriverKit"')
    return text, f"\t\t\tpackage = {reference_uuid} /* XCRemoteSwiftPackageReference \"TestForgeDriverKit\" */;\n"


def add_frameworks_phase(text: str, ui_uuid: str, build_file_uuid: str) -> str:
    """Creates the Frameworks build phase a target can legitimately lack.

    A target that has never linked anything has no `PBXFrameworksBuildPhase` at all — routine for a
    UI test target, and for anything a project generator emitted. Creating it is the same additive
    line insertion as everything else here, so refusing and sending the developer into Xcode would
    trade a solved problem for the whole-file reorder this script exists to avoid.
    """
    phase_uuid = fresh_uuid(text + build_file_uuid)
    phase = (f"\t\t{phase_uuid} /* Frameworks */ = {{\n"
             f"\t\t\tisa = PBXFrameworksBuildPhase;\n"
             f"\t\t\tbuildActionMask = 2147483647;\n"
             f"\t\t\tfiles = (\n"
             f"\t\t\t\t{build_file_uuid} /* {PRODUCT_NAME} in Frameworks */,\n"
             f"\t\t\t);\n"
             f"\t\t\trunOnlyForDeploymentPostprocessing = 0;\n"
             f"\t\t}};\n")

    if "/* Begin PBXFrameworksBuildPhase section */\n" in text:
        text = insert_after(text, "/* Begin PBXFrameworksBuildPhase section */\n", phase)
    else:
        section = ("/* Begin PBXFrameworksBuildPhase section */\n"
                   + phase + "/* End PBXFrameworksBuildPhase section */\n\n")
        text = insert_before(text, "/* Begin PBXGroup section */\n", section)

    start = definition_at(text, ui_uuid)
    phases_at = text.index("buildPhases = (\n", start) + len("buildPhases = (\n")
    return text[:phases_at] + f"\t\t\t\t{phase_uuid} /* Frameworks */,\n" + text[phases_at:]


def definition_at(text: str, object_uuid: str) -> int:
    """Offset of an object's own definition, not of a reference to it.

    A uuid appears once as `\\t\\tUUID ... = {` and any number of times as `\\t\\t\\t\\tUUID ...,` inside
    another object's list. A plain substring search finds whichever comes first in the file, and the
    two-tab prefix is a substring of the four-tab one — so a naive lookup silently edits a sibling
    object. That misfile is invisible to `plutil -lint`: the result is still a valid plist.
    """
    match = re.search(rf"^\t\t{object_uuid} \S.*= \{{", text, re.M)
    if match is None:
        raise SystemExit(f"could not find the definition of {object_uuid} in project.pbxproj")
    return match.start()


def add_shim_to_target(text: str, objects: dict, ui_uuid: str, ui_target: dict, group_path: str) -> str:
    """Compiles the shim by registering it, rather than only writing it to disk.

    A file on disk that no target compiles is the failure this whole arrangement exists to avoid:
    the harness starts, attaches, reports success, and runs `Executed 0 tests`, because XCTest only
    enumerates classes that made it into the .xctest image. A project whose sources are globbed by a
    generator hides this until the first run.
    """
    if f"/* {SHIM_NAME} in Sources */" in text:
        return text

    file_uuid = fresh_uuid(text)
    build_uuid = fresh_uuid(text + file_uuid)

    text = insert_after(text, "/* Begin PBXFileReference section */\n",
                        f"\t\t{file_uuid} /* {SHIM_NAME} */ = {{isa = PBXFileReference; "
                        f"lastKnownFileType = sourcecode.swift; path = {group_path}; "
                        f"sourceTree = \"<group>\"; }};\n")
    text = insert_after(text, "/* Begin PBXBuildFile section */\n",
                        f"\t\t{build_uuid} /* {SHIM_NAME} in Sources */ = {{isa = PBXBuildFile; "
                        f"fileRef = {file_uuid} /* {SHIM_NAME} */; }};\n")

    sources_uuid = next((phase for phase in ui_target.get("buildPhases", [])
                         if objects[phase].get("isa") == "PBXSourcesBuildPhase"), None)
    if sources_uuid is None:
        raise SystemExit(f"{ui_target['name']} has no Sources build phase — it cannot compile anything")
    start = definition_at(text, sources_uuid)
    files_at = text.index("files = (\n", start) + len("files = (\n")
    text = text[:files_at] + f"\t\t\t\t{build_uuid} /* {SHIM_NAME} in Sources */,\n" + text[files_at:]

    group_uuid = next((uuid for uuid, obj in objects.items()
                       if obj.get("isa") == "PBXGroup"
                       and (obj.get("path") or obj.get("name")) == ui_target["name"]), None)
    if group_uuid is not None:
        start = definition_at(text, group_uuid)
        children_at = text.index("children = (\n", start) + len("children = (\n")
        text = text[:children_at] + f"\t\t\t\t{file_uuid} /* {SHIM_NAME} */,\n" + text[children_at:]

    return text


def wire_pbxproj(pbxproj: Path, objects: dict, ui_uuid: str, ui_target: dict, arguments,
                 shim_group_path: str) -> None:
    text = pbxproj.read_text()
    if f"productName = {PRODUCT_NAME};" in text:
        print(f"  · {PRODUCT_NAME} product dependency already present — leaving it alone")
        if f"/* {SHIM_NAME} in Sources */" not in text:
            pbxproj.write_text(add_shim_to_target(text, objects, ui_uuid, ui_target, shim_group_path))
            print(f"  · added {SHIM_NAME} to {ui_target['name']}'s Sources phase")
        return

    build_file_uuid = fresh_uuid(text)
    product_uuid = fresh_uuid(text + build_file_uuid)
    text, package_clause = package_reference_section(text, arguments, product_uuid)

    entry = (f"\t\t{product_uuid} /* {PRODUCT_NAME} */ = {{\n"
             f"\t\t\tisa = XCSwiftPackageProductDependency;\n"
             f"{package_clause}"
             f"\t\t\tproductName = {PRODUCT_NAME};\n"
             f"\t\t}};\n")
    if "/* Begin XCSwiftPackageProductDependency section */\n" in text:
        text = insert_after(text, "/* Begin XCSwiftPackageProductDependency section */\n", entry)
    else:
        header = ("/* Begin XCSwiftPackageProductDependency section */\n"
                  + entry + "/* End XCSwiftPackageProductDependency section */\n\n")
        text = insert_before(text, "/* End PBXTargetDependency section */\n", header)

    text = insert_after(text, "/* Begin PBXBuildFile section */\n",
                        f"\t\t{build_file_uuid} /* {PRODUCT_NAME} in Frameworks */ = "
                        f"{{isa = PBXBuildFile; productRef = {product_uuid} /* {PRODUCT_NAME} */; }};\n")

    frameworks_uuid = next((phase for phase in ui_target.get("buildPhases", [])
                            if objects[phase].get("isa") == "PBXFrameworksBuildPhase"), None)
    if frameworks_uuid is None:
        text = add_frameworks_phase(text, ui_uuid, build_file_uuid)
    else:
        start = definition_at(text, frameworks_uuid)
        files_at = text.index("files = (\n", start) + len("files = (\n")
        text = text[:files_at] + f"\t\t\t\t{build_file_uuid} /* {PRODUCT_NAME} in Frameworks */,\n" + text[files_at:]

    anchor = f"\t\t\tname = {ui_target['name']};\n"
    if "packageProductDependencies" in json.dumps(ui_target):
        start = definition_at(text, ui_uuid)
        deps_at = text.index("packageProductDependencies = (\n", start) + len("packageProductDependencies = (\n")
        text = text[:deps_at] + f"\t\t\t\t{product_uuid} /* {PRODUCT_NAME} */,\n" + text[deps_at:]
    else:
        text = insert_after(text, anchor,
                            f"\t\t\tpackageProductDependencies = (\n"
                            f"\t\t\t\t{product_uuid} /* {PRODUCT_NAME} */,\n"
                            f"\t\t\t);\n")

    text = add_shim_to_target(text, objects, ui_uuid, ui_target, shim_group_path)

    pbxproj.write_text(text)
    print(f"  · attached {PRODUCT_NAME} to {ui_target['name']} (product {product_uuid})")
    print(f"  · added {SHIM_NAME} to {ui_target['name']}'s Sources phase")


def render(template: Path, values: dict[str, str]) -> str:
    text = template.read_text()
    for key, value in values.items():
        text = text.replace("{" + key + "}", value)
    return text


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--bundle-id", required=True)
    parser.add_argument("--ui-test-target")
    parser.add_argument("--app-target")
    parser.add_argument("--package-path", help="Relative path to a local TestForgeDriverKit package")
    parser.add_argument("--package-url", help="Remote package URL, when not using --package-path")
    parser.add_argument("--package-ref", help="Branch name or 40-char revision for --package-url")
    parser.add_argument("--package-pin-tag",
                        help="Only with --package-path, when the host project governs local SPM "
                             "overrides via SwiftPackageList.txt + spm_cache.py and --package-path "
                             "is an unmanaged checkout of an already-declared repo: creates+pushes "
                             "this tag at --package-path's current HEAD, repoints that repo's "
                             "SwiftPackageList.txt line to it, and wires TestForgeDriverKit to the managed "
                             "checkout instead. Without it, that situation is a hard failure with "
                             "the equivalent manual steps printed.")
    parser.add_argument("--media-root", default="TestForge-Test")
    parser.add_argument("--taxonomy", type=Path,
                        help="Module taxonomy for classify_module.py; "
                             f"default: the first of {', '.join(TAXONOMY_CANDIDATES)} that exists")
    parser.add_argument("--data-plane", choices=["simctl", "networklens"], default="simctl",
                        help="which contracts/dataplane.md driver scripts/dataplane.py should "
                             "resolve (default: %(default)s — NetworkLens under the booted sim; "
                             "'networklens' is the same driver, the contract's own name for it)")
    parser.add_argument("--templates", type=Path,
                        default=Path(__file__).resolve().parents[3] / "templates" / "ios")
    parser.add_argument("--dry-run", action="store_true")
    arguments = parser.parse_args()

    if not arguments.package_path and not (arguments.package_url and arguments.package_ref):
        raise SystemExit("pass --package-path, or --package-url together with --package-ref")

    project = arguments.project.resolve()
    pbxproj = project / "project.pbxproj"
    if not pbxproj.exists():
        raise SystemExit(f"no project.pbxproj under {project}")
    root = project.parent

    if arguments.package_path:
        arguments.package_path = str(check_local_package_governance(
            root, Path(arguments.package_path), arguments.package_pin_tag))

    objects = load_objects(pbxproj)
    ui_uuid, ui_target = pick_target(native_targets(objects, UI_TEST_TYPE), arguments.ui_test_target, "UI test")
    app_uuid, app_target = pick_target(native_targets(objects, APP_TYPE), arguments.app_target, "application")

    values = {
        "CONTAINER": project.name,
        "APP_UUID": app_uuid,
        "APP_NAME": app_target["name"],
        "APP_BUILDABLE": buildable_name(objects, app_target),
        "UITEST_UUID": ui_uuid,
        "UITEST_NAME": ui_target["name"],
        "UITEST_BUILDABLE": buildable_name(objects, ui_target),
        "CONFIG_UUID": str(uuid.uuid4()).upper(),
        "BUNDLE_ID": arguments.bundle_id,
        "MEDIA_ROOT": arguments.media_root,
    }
    print(f"  · app       {values['APP_NAME']} ({values['APP_BUILDABLE']})")
    print(f"  · UI test   {values['UITEST_NAME']} ({values['UITEST_BUILDABLE']})")

    taxonomy = find_taxonomy(root, arguments.taxonomy)
    print(f"  · taxonomy  {under(taxonomy, root)}" if taxonomy
          else "  · taxonomy  none — output classifies by folder shape")

    print(f"  · data plane  {arguments.data_plane}")

    # The local-package download pre-action belongs only to a project that actually has that script.
    preaction = arguments.templates / "SwiftPackages.preaction.xml"
    # rstrip: the template file ends in a newline, and the placeholder is already followed by one.
    values["PRE_ACTIONS"] = (render(preaction, values).rstrip("\n")
                             if (root / "SwiftPackages.sh").exists() else "")

    if arguments.dry_run:
        print("  · dry run — nothing written")
        return 0

    scheme_dir = project / "xcshareddata" / "xcschemes"
    scheme_dir.mkdir(parents=True, exist_ok=True)
    (scheme_dir / "TestForgeDriver.xcscheme").write_text(render(arguments.templates / "TestForgeDriver.xcscheme.template", values))
    testplan = root / "TestForgeDriver.xctestplan"
    testplan.write_text(render(arguments.templates / "TestForgeDriver.xctestplan.template", values))
    print("  · wrote TestForgeDriver.xcscheme and TestForgeDriver.xctestplan")

    shim_dir = root / ui_target["name"] / "TestForgeDriver"
    shim_dir.mkdir(parents=True, exist_ok=True)
    shim = shim_dir / SHIM_NAME
    if shim.exists():
        print(f"  · {shim.relative_to(root)} already exists — leaving it alone")
    else:
        shim.write_text(render(arguments.templates / "TestForgeDriverSession.swift.template", values))
        print(f"  · wrote {shim.relative_to(root)}")

    wire_pbxproj(pbxproj, objects, ui_uuid, ui_target, arguments, f"TestForgeDriver/{SHIM_NAME}")

    settings_path = root / ".claude" / "settings.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    environment = settings.setdefault("env", {})
    environment["TEST_FORGE_BUNDLE_ID"] = arguments.bundle_id
    environment["NETWORKLENS_BUNDLE_ID"] = arguments.bundle_id
    environment["TEST_FORGE_MEDIA_ROOT"] = str(Path.home() / "Documents" / arguments.media_root)
    environment["TEST_FORGE_PROJECT_DIR"] = str(root)
    environment["TEST_FORGE_UITEST_TARGET"] = ui_target["name"]
    environment["TEST_FORGE_DATA_PLANE"] = arguments.data_plane
    if taxonomy:
        environment["TEST_FORGE_TAXONOMY"] = str(taxonomy)
    elif environment.get("TEST_FORGE_TAXONOMY") and not Path(environment["TEST_FORGE_TAXONOMY"]).exists():
        # A pointer at a missing file degrades to the folder-shape fallback silently, which reads
        # as "the taxonomy is being ignored". Say it rather than deleting someone's config.
        print(f"  ! TEST_FORGE_TAXONOMY points at {environment['TEST_FORGE_TAXONOMY']}, which does not exist"
              " — classification will fall back to folder shape")
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    print(f"  · wrote {settings_path.relative_to(root)} env for {arguments.bundle_id}")

    print("\nVerify, in this order:")
    print(f"  plutil -lint {pbxproj.relative_to(root)}")
    # A test plan is JSON, and `plutil -lint` refuses JSON by content sniffing — it would report a
    # correct plan as malformed, which is worse than not checking it.
    print(f"  python3 -m json.tool {testplan.relative_to(root)} > /dev/null")
    print(f"  git -C {root} diff --numstat -- {pbxproj.relative_to(root)}   # deletions MUST be 0")
    print(f"  xcodebuild -project {project.name} -scheme TestForgeDriver -showTestPlans")
    print("\nThen, once only:")
    print("  xcodebuild build-for-testing -scheme TestForgeDriver -configuration Debug "
          "-destination \"platform=iOS Simulator,id=$SIM\"")
    return 0


if __name__ == "__main__":
    sys.exit(main())
