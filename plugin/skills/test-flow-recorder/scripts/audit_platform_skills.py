#!/usr/bin/env python3
"""Audits whether the host project has the skill(s) this plugin's driver needs for one platform,
before `/test-forge-init` finishes setup or a run starts.

`propose_skill_extension.py` already discovers a project's governing view-code skill(s) — a
codegen-gate hook's `ALLOWED_SKILLS`, or a keyword heuristic over each skill's description — but only
to propose an extension to one that already exists. It has no notion of "this required skill isn't
there at all." This script adds exactly that, reusing that discovery rather than re-deriving it.

**The requirement is declared per platform, in that platform's own doc, never hardcoded here.**
`platforms/<platform>.md` carries a `## Host-project skills required` section starting with
`**Required: yes**` or `**Required: no**`. iOS declares yes (a view-code codegen skill; every
accessibility-identifier retrofit and `TestForgeDriverKit` edit chains into it). Android and web declare no
today — their driver isn't built yet, so there's nothing to block on — but the same mechanism picks
either up unchanged the moment a driver and a requirement are declared for it. This keeps the script
platform-agnostic: it never hardcodes "swift-codegen" or any other skill name.

Four outcomes:
  found              a relevant skill exists. Delegates to `propose_skill_extension.py`'s existing
                      extension-proposal path, unchanged. Never blocking.
  missing_blocking    nothing relevant found, and the platform requires it. `/test-forge-init` and Stage 1
                      Preflight both stop here.
  missing_informational  nothing relevant found, platform does not require it (today: android, web).
                      Reported for visibility, never blocking.

**`ios-analytics-tracker` (the tracker-validation TRMS extractor) is deliberately excluded from this
audit.** It stays exactly as it is today — soft, optional; `check_tracker_validation.py` already
skips that one gate cleanly, with a stated reason, when it's absent. Not a driver dependency the way
the codegen skill is, so not part of "required."

**Propose-only, same as `propose_skill_extension.py`.** A genuinely missing skill gets a labelled
*scaffold* written under `--out-dir` — never a finished skill, never written into the host project's
`.claude/skills/` or `CLAUDE.md`, under any flag. Writing the scaffold does not resolve the blocker
in the same run: the skill still doesn't exist on disk. The only thing that clears
`missing_blocking` is a later re-run finding it there.

**Fingerprint, for "one-time per platform."** A successful, unchanged audit is recorded under
`settings["testForgeSkillAudit"][<platform>]` in the host project's `.claude/settings.json` (a separate
namespace from `settings["env"]`, which `test_forge_init.py` forwards into the launched app's own
environment — this bookkeeping must never end up there). A later run with the same discovery result
skips re-prompting; a changed one (a skill renamed or deleted since) re-triggers it — "one-time" means
"don't nag about state that hasn't changed," not "never look again."

Usage:
    audit_platform_skills.py --project-root <path> --platform ios [--out-dir <path>] [--dry-run]
    audit_platform_skills.py --project-root <path> --platform ios --check-only   # Stage 1 Preflight

Exit code 1 exactly when the result is `missing_blocking`; 0 otherwise, including `--dry-run`.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from propose_skill_extension import (  # noqa: E402
    HookInfo, SkillInfo, classify_relevant, default_out_dir, discover_codegen_hook,
    discover_project_skills, render_index, render_proposal,
)

REQUIREMENT_HEADING = "## Host-project skills required"
REQUIRED_LINE = re.compile(r"\*\*Required:\s*(yes|no)\*\*", re.IGNORECASE)
PLATFORMS = ("ios", "android", "web")


@dataclass
class Requirement:
    platform: str
    required: bool
    capability: str  # the paragraph under **Required: ...** — what's needed and why


@dataclass
class AuditResult:
    platform: str
    status: str  # "found" | "missing_blocking" | "missing_informational"
    requirement: Requirement
    hook: HookInfo | None
    skills: list[SkillInfo]
    relevant: list[SkillInfo]
    fingerprint: str


def platform_requirement(platform: str, platforms_dir: Path) -> Requirement:
    """Parses `## Host-project skills required` out of `platforms/<platform>.md`. A platform doc
    with no such section, or a malformed one, is treated as `required: false` rather than guessed
    at — silence in the doc is not silently promoted into a blocker."""
    doc = platforms_dir / f"{platform}.md"
    if not doc.exists():
        return Requirement(platform, required=False, capability=f"{doc} does not exist")
    text = doc.read_text(encoding="utf-8", errors="ignore")
    start = text.find(REQUIREMENT_HEADING)
    if start < 0:
        return Requirement(platform, required=False,
                           capability="no '## Host-project skills required' section in this platform's doc")
    section = text[start + len(REQUIREMENT_HEADING):]
    next_heading = re.search(r"\n##\s", section)
    if next_heading:
        section = section[:next_heading.start()]
    match = REQUIRED_LINE.search(section)
    if not match:
        return Requirement(platform, required=False,
                           capability="section found but no '**Required: yes|no**' line — treated as no")
    required = match.group(1).lower() == "yes"
    capability = section[match.end():].strip()
    return Requirement(platform, required=required, capability=capability or "(no capability text given)")


def fingerprint(hook: HookInfo | None, relevant: list[SkillInfo]) -> str:
    parts = [hook.path.as_posix() if hook else "-", *sorted(skill.name for skill in relevant)]
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:16]


def audit(project_root: Path, platform: str, platforms_dir: Path) -> AuditResult:
    claude_dir = project_root / ".claude"
    hook = discover_codegen_hook(claude_dir) if claude_dir.is_dir() else None
    skills = discover_project_skills(claude_dir) if claude_dir.is_dir() else []
    relevant = classify_relevant(skills, hook)
    requirement = platform_requirement(platform, platforms_dir)

    if relevant:
        status = "found"
    elif requirement.required:
        status = "missing_blocking"
    else:
        status = "missing_informational"

    return AuditResult(platform=platform, status=status, requirement=requirement, hook=hook,
                       skills=skills, relevant=relevant, fingerprint=fingerprint(hook, relevant))


def load_recorded_fingerprint(project_root: Path, platform: str) -> str | None:
    settings_path = project_root / ".claude" / "settings.json"
    if not settings_path.exists():
        return None
    settings = json.loads(settings_path.read_text())
    return settings.get("testForgeSkillAudit", {}).get(platform, {}).get("fingerprint")


def record_fingerprint(project_root: Path, platform: str, fp: str) -> None:
    settings_path = project_root / ".claude" / "settings.json"
    settings_path.parent.mkdir(parents=True, exist_ok=True)
    settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    audit_state = settings.setdefault("testForgeSkillAudit", {})
    audit_state[platform] = {"fingerprint": fp}
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")


def draft_new_skill_scaffold(result: AuditResult, project_root: Path, out_dir: Path) -> Path:
    """A labelled scaffold, never a finished skill. States plainly what a human still has to supply
    rather than inventing project-specific values this script cannot know."""
    example = ""
    if result.skills:
        sample = result.skills[0]
        example = (f"\nAn existing skill in this project for style reference (not necessarily "
                   f"related): `{sample.skill_md}`\n> name: {sample.name}\n"
                   f"> description: {sample.description}\n")
    else:
        example = "\nNo existing skill in this project to mirror style from yet.\n"

    body = (
        f"# SCAFFOLD ONLY — {result.platform} view-code codegen skill\n\n"
        "**Not a finished skill. A starting point for a human to complete and verify against this "
        "project's real conventions; do not commit as-is.**\n\n"
        f"## Why this is needed\n\n{result.requirement.capability}\n\n"
        "## Suggested frontmatter\n\n"
        "```\n---\n"
        f"name: {result.platform}-view-codegen\n"
        f"description: <one line — when Claude should invoke this for {result.platform} view code>\n"
        "---\n```\n"
        f"{example}\n"
        "## Checklist — facts only a human can supply\n\n"
        "- [ ] Lint/style config path this project actually uses\n"
        "- [ ] Accessibility-identifier property name convention (what field, what naming pattern)\n"
        "- [ ] Any forbidden/legacy APIs this platform's codegen should flag\n"
        "- [ ] Component composition rules (one view per file? shared component lookup path?)\n"
        "- [ ] How a new view file gets registered with the build (if anything beyond the file itself)\n"
    )
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{result.platform}-view-codegen-scaffold.md"
    path.write_text(body, encoding="utf-8")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--project-root", required=True, type=Path)
    parser.add_argument("--platform", required=True, choices=PLATFORMS)
    parser.add_argument("--platforms-dir", type=Path,
                        default=Path(__file__).parent.parent / "platforms",
                        help="default: this plugin's own skills/test-flow-recorder/platforms/")
    parser.add_argument("--out-dir", type=Path, default=None,
                        help="default: ~/Documents/<project>-QA/adaptation-proposals/")
    parser.add_argument("--dry-run", action="store_true", help="print what would be written, write nothing")
    parser.add_argument("--check-only", action="store_true",
                        help="cheap presence re-check against the recorded fingerprint — no "
                             "discovery report, no scaffold, no settings.json write. For Stage 1 "
                             "Preflight, not /test-forge-init.")
    args = parser.parse_args()

    project_root = args.project_root.resolve()

    if args.check_only:
        recorded = load_recorded_fingerprint(project_root, args.platform)
        if recorded is None:
            print(f"! no recorded skill audit for {args.platform} — run /test-forge-init")
            return 1
        result = audit(project_root, args.platform, args.platforms_dir)
        if result.fingerprint != recorded:
            print(f"! skill audit state changed since /test-forge-init for {args.platform} "
                  f"(recorded {recorded}, now {result.fingerprint}) — re-run /test-forge-init step 8")
            return 1
        if result.status == "missing_blocking":
            print(f"! {args.platform} still has no governing skill — re-run /test-forge-init step 8")
            return 1
        return 0

    result = audit(project_root, args.platform, args.platforms_dir)
    out_dir = args.out_dir or default_out_dir(project_root)

    print(f"platform: {result.platform}  requirement: "
         f"{'required' if result.requirement.required else 'not required'}")
    print(f"  {result.requirement.capability.splitlines()[0] if result.requirement.capability else ''}")

    if result.status == "found":
        proposals = [render_proposal(skill) for skill in result.relevant]
        names = ", ".join(skill.name for skill in result.relevant)
        print(f"  found: {names}")
        if not args.dry_run:
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "README.md").write_text(render_index(proposals, result.hook), encoding="utf-8")
            for proposal in proposals:
                (out_dir / f"{proposal.skill.name}.md").write_text(proposal.snippet, encoding="utf-8")
            record_fingerprint(project_root, result.platform, result.fingerprint)
            print(f"  {len(proposals)} extension proposal(s) written under {out_dir}")
        print("  Nothing was written to any skill file or to CLAUDE.md.")
        return 0

    if result.status == "missing_informational":
        print(f"  nothing found — informational only, {result.platform} has no built driver yet")
        if not args.dry_run:
            record_fingerprint(project_root, result.platform, result.fingerprint)
        return 0

    # missing_blocking
    print(f"  ! nothing found, and {result.platform} requires it — this blocks /test-forge-init and any run")
    if not args.dry_run:
        scaffold = draft_new_skill_scaffold(result, project_root, out_dir)
        print(f"  scaffold written to {scaffold}")
        print("  Not applied anywhere. Apply it by hand, then re-run this audit — writing the "
             "scaffold does not resolve the blocker; the skill has to actually exist.")
        # Deliberately not recorded: a blocking result must re-evaluate from scratch next time,
        # never be skipped by a fingerprint match against its own unresolved state.
    return 1


if __name__ == "__main__":
    sys.exit(main())
