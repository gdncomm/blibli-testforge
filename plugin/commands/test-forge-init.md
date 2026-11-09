---
description: Wire this Xcode project to the TestForgeDriverKit harness — package product, scheme, test plan, shim and per-project config
argument-hint: "[--bundle-id <id>] [--ui-test-target <name>]"
allowed-tools: Bash, Read, Glob, AskUserQuestion
---

Wire the current Xcode project to the test-forge-driver harness. One-time, per project.

Everything this touches is additive. The final gate is that `git diff --numstat` on the pbxproj
shows **zero deleted lines** — a tool that reserialises the project file reorders every object and
drops what it cannot round-trip, so a deletion means something went wrong, not that something was
tidied.

## Pre-flight checklist — confirm with the user before Step 1

Everything below was learned the hard way wiring a real project (BlibliMobile-iOS) and cost real
debugging time each time it wasn't checked up front. Gather what you can read yourself, then put
the rest to the user in a single `AskUserQuestion` batch before running anything:

- **Xcode must be closed.** `scripts/spm-cache/spm_cache.py` (and any similarly-shaped local-package
  tooling) refuses to touch package files while Xcode is running, and Xcode has a habit of
  reopening itself between attempts (a developer's own workflow, a `.xcodeproj` double-click,
  etc.) — re-check with `pgrep -x Xcode` immediately before Step 4 and again before Step 6, not
  just once at the start.
- **Network/VPN/SSH access to the project's git remotes**, confirmed live, not assumed. A stalled
  fetch (private `git@github.com:...` repos over SSH with no VPN) doesn't fail fast — it hangs with
  near-zero CPU for as long as the connection is given, and looks identical to a build that's just
  slow. Check with e.g. `ssh -oBatchMode=yes -oConnectTimeout=15 -T git@github.com` before Step 6;
  a non-hanging response (even an auth-only "does not provide shell access" reply) means it's safe
  to proceed, a timeout means stop and tell the developer to connect VPN/SSH first.
- **A booted simulator**, for Step 6's build-for-testing. Boot one if none is booted, but ask before
  booting a specific device if more than one is available.
- **Local-package governance**, only when `--package-path` is used: does the target project manage
  local SPM overrides via a `SwiftPackageList.txt` + `spm_cache.py`-shaped tool (check for
  `SwiftPackageList.txt` at the project root and any `spm_cache.py` under it)? If so, and the given
  `--package-path` is an *unmanaged* checkout of a repo that tool already governs at a different
  path/tag, `test_forge_init.py` now catches this itself (see `check_local_package_governance` /
  `--package-pin-tag`) and fails early with exact fix commands rather than a late, generic build
  error — but flag it to the user before Step 4 if you can already see the collision coming (e.g.
  the package path's `git remote get-url origin` matches a repo already listed there), since
  `--package-pin-tag` creates and pushes a real git tag, which the user should approve rather than
  discover after the fact.
- **Unrelated test targets already in the host project's own schemes.** `TestForgeDriver.xcscheme` (Step 4)
  is generated to include *only* the UI test target by construction, so this is reassurance rather
  than a blocker — but if the developer has been driving anything through the app's own existing
  scheme instead (a quick manual check before `/test-forge-init` has run), mention that an unrelated
  unit-test target there can fail the whole build even when marked `skipped="YES"` in the scheme
  (that flag only filters execution, not what gets built) — only removing its `TestableReference`
  entirely stops it from being built. Not something `/test-forge-init` needs to fix; just don't let it read
  as a TestForgeDriverKit problem if the developer hits it going a different route.

Ask the batch, wait for answers, then proceed to Step 1.

## Steps

1. **Find the project.** `ls *.xcodeproj *.xcworkspace`. If there is more than one, ask which.

2. **Resolve the bundle id** if the user did not pass one — read it from the app target's
   `PRODUCT_BUNDLE_IDENTIFIER`, and confirm it before writing anything. A bundle id that is right
   for some other app makes every tool look healthy while pointing at the wrong process.

3. **Decide where TestForgeDriverKit comes from.** Ask if unclear:
   - a local checkout → `--package-path <relative dir>`
   - a remote repository → `--package-url <url> --package-ref <branch or 40-char revision>`.
     Prefer a revision over a branch when the source is an unmerged branch: a revision survives a
     force-push, a branch pin does not.

4. **Run it.**

   ```bash
   python3 "${CLAUDE_PLUGIN_ROOT}/skills/test-flow-recorder/scripts/test_forge_init.py" \
       --project <App>.xcodeproj --bundle-id <id> \
       [--ui-test-target <name>] [--package-path <dir> | --package-url <url> --package-ref <ref>]
   ```

   It hard-fails rather than guessing when a project has more than one UI test target — a scheme
   pointed at an unused Xcode-generated stub builds cleanly and drives nothing. Pass
   `--ui-test-target` to say which.

   Run it with `--dry-run` first and show the resolved targets to the user.

5. **Verify, in this order.** Report each result; do not summarise a failure as a success.

   ```bash
   plutil -lint <App>.xcodeproj/project.pbxproj
   git diff --numstat -- <App>.xcodeproj/project.pbxproj    # deletions MUST be 0
   xcodebuild -project <App>.xcodeproj -scheme TestForgeDriver -showTestPlans
   ```

   `-showTestPlans` is the real gate: it fails when a pinned target identifier does not resolve.

6. **Hand back the one-time build**, which stays the developer's job — it is slow, may need network
   or VPN access for dependency resolution, and fails in ways a person has to read:

   ```bash
   SIM=$(xcrun simctl list devices booted -j | python3 -c 'import json,sys; print(next(d["udid"] for v in json.load(sys.stdin)["devices"].values() for d in v))')
   xcodebuild build-for-testing -workspace <App>.xcworkspace -scheme TestForgeDriver \
       -configuration Debug -destination "platform=iOS Simulator,id=$SIM"
   ```

   `-configuration Debug` is load-bearing, though not for the reason it looks like. NetworkLens does
   **not** key off `DEBUG`; it is real in every configuration unless that configuration defines
   `NETWORKLENS_DISABLED`. Debug is the configuration where the lens is live and where the host app
   usually keeps its own bootstrap, so it is the one the harness has to build.

7. **Guard the shipping configurations, and say so out loud.** This is the only step that touches
   what the app ships, and it is the one a first adopter will otherwise miss:

   > NetworkLens is linked to the **app** target — it has to be, since it intercepts the app's own
   > `URLSession` — and it is the **real interceptor in every build configuration**, an App Store
   > archive included, unless that configuration says otherwise. Nothing about a Release build makes
   > it inert on its own. It also does not key off `DEBUG`.

   The correct guard for any new project is **per-configuration product linkage, not a compile
   flag**: link `NetworkLensNoOp` in every configuration that ships — Release, AppStore, whatever
   the project calls them — and `NetworkLensUI` (or the umbrella) elsewhere, with no umbrella
   product that depends on both and `#if`s between them. That distinction is not cosmetic —
   measured on arm64 Release, an umbrella that `#if`-excludes the unused module still ships it in
   full, at **362 KB**: SPM emits one merged object file per module rather than an archive, so the
   linker has no members to leave behind and dead-stripping never gets the chance to run.

   *A `NETWORKLENS_DISABLED` compile flag existed before this and still works, but only for a
   project pinning `BlibliLogger` at or before revision `4dcfdd04`* — `test-forge-sample-app` is the one
   project on that pin, and its own guard is correct as-is. It is **not** forward guidance: a new
   project should link the product, not reach for the flag.

   Report which configurations were guarded, and which linkage each got. If the project has a
   configuration you could not classify, say which and leave it alone rather than guessing —
   guessing wrong here either ships an interceptor or kills the data plane, and neither announces
   itself.

8. **Audit required skills for this platform — not skippable.** Read-only and cheap, same posture as
   steps 4-7's own hard-fail gates. Runs
   `scripts/audit_platform_skills.py --project-root <project root> --platform ios`.
   - Nothing missing, or the project already has the governing view-code codegen skill → say so
     plainly, continue to step 9.
   - The skill exists but the audit has an extension to propose → ask via `AskUserQuestion` whether
     to write the proposal (same `~/Documents/<project>-QA/adaptation-proposals/` destination the
     next step already uses); declining is fine, it is not blocking, continue either way.
   - **Nothing found at all** → this platform requires it (`platforms/ios.md`'s "Host-project skills
     required"), so it is a hard blocker: the script writes a labelled scaffold (never a finished
     skill, never written into `.claude/skills/`) and exits non-zero. **Stop `/test-forge-init` here** — the
     same "do not proceed past a failed gate" rule as every other step below. Tell the developer
     where the scaffold landed and that applying it (then re-running this step) is what clears the
     blocker; writing the scaffold does not clear it on its own.

9. **Adaptation pass — optional, propose-only.** Read-only and cheap, so default to yes; ask via
   `AskUserQuestion` if the developer wants it skipped. Runs
   `scripts/propose_skill_extension.py --project-root <project root>` and prints the count of
   proposals written. **State plainly, every time: nothing was written to any skill file or to
   `CLAUDE.md`** — the proposals land under `~/Documents/<project>-QA/adaptation-proposals/` (or
   wherever `--out-dir` pointed) for the developer to review and apply by hand. See that script's
   own docstring for why this is propose-only rather than an edit: the same hard rule that keeps
   this whole skill out of `.claude/` and `CLAUDE.md` applies here too.

## Do not

- Do not open Xcode to make the project edit. Its "Add Package Product" UI rewrites and reorders
  the whole pbxproj on save.
- Do not attach `TestForgeDriverKit` to the app target. It imports XCTest; in an app binary that fails at
  launch, not at build.
- Do not proceed past a failed gate. Restore the pbxproj and report what failed.
