# TestForge: instructions for Claude

Native Mac app + local Node server + Claude Code plugin that tests the Blibli iOS app. Layout and setup: `README.md`. Branches, commits, PRs, releases: `CONTRIBUTING.md`. Document map: `docs/README.md`.

This repo is its own project. Settings for it live here (`.claude/settings.local.json`, gitignored), never in the Blibli iOS repo's `.claude/`.

## Definition of done for a feature

1. **A Mac app entry point.** The point of TestForge is to move work out of the command line. A feature that only works from `test-forge` or the server API is not finished.
2. **Visual feedback for every action.** A control that starts work shows progress at that control (spinner and "…ing", via `Views/ActionProgressLabel`, or an inline progress line) and its failure next to it. Disabling buttons is not feedback. Whatever the action changes refreshes everywhere it shows.
3. **Accessibility IDs on everything.** Every container and every distinct inner element (text, badge, button, image) gets an ID, named `<Feature>_<Element>`, constants in the feature's constants file. Do not ask which elements.
4. **Tutorials cover it.** Update all three before committing: the tip and tour line (`mac-app/Sources/TestForge/Tutorials/TutorialCatalog*.swift` plus an anchor), the welcome role flows (`Onboarding/OnboardingCatalog+Roles.swift`: QA "A testing day…" and developer "Check your feature before the PR"), and a new `R<n>` entry in `server/docs/tutorials.md`. A screen with no anchor, such as Setup, gets no tip; say so in the `R<n>` entry.
5. **Tests** for logic that can be tested. `cd mac-app && swift test`.
6. **A `D-NNN` entry** in `server/docs/decision.md` for a non-obvious design choice (append only).

## Wording

Say "mock" and "mocked" in anything a person reads (UI, tour, docs). Never "fake". Code identifiers such as `FakeDataViewModel` stay as they are.

## How QA runs work

- Claude is needed for a case's first successful run and for failures. After that the macro, elements and mocks live in the repo and the driver replays them with no Claude.
- A macro exists once per id and is reused by reference, never copied.
- Cases share one app session. Never add a quit or relaunch unless something the app reads at launch changed. Start macros from Open Home (`mc_EAH97EMYH5`, no relaunch) and mark launch-time mocks `atLaunch`.
- Flash Sale (SF-xxx) cases need a logged-in user: log in with `mc_MSFK2HNFM1`, then relaunch or pull to refresh Home.

## The user's live app

- Before relaunching TestForge or the server, check the user is not using it. Relaunching closes their copy and drops their place. Ask them to quit it first, and reopen the normal app afterwards.
- Never `pkill -f "node server.js"`: it also kills the live server on :4545. Stop a copy by its port: `kill $(lsof -tnP -iTCP:<port> -sTCP:LISTEN)`.
- Never take a full-display screenshot; it captures unrelated work. Capture the app window only.

## Git

- Trunk is `master`. Never push to it. Work branches are `darshan/<type>/<topic>`; PRs are squash-merged with the title `[TestForge] <imperative summary>`.
- Commit messages end with `Co-Authored-By: Claude <noreply@anthropic.com>`; PR bodies end with `Generated with [Claude Code](https://claude.com/claude-code)`.
- Never force-push, delete a remote branch, or merge a PR unless the user says so in that turn.
- Run git commands with `git -C <path>` or from the repo; this shell resets its working directory after each call.

## Build and run

- `./setup.sh --check` checks tools; `./setup.sh` installs and builds.
- Mac app: `cd mac-app && ./scripts/make-app.sh`, then open `build/TestForge.app`. Tests: `swift test`.
- Server: `server/start.sh` (port 4545). It needs `TEST_FORGE_PROJECT_DIR`, the iOS app's `BlibliMobile-iOS` folder; the app passes it from Setup.
- The Mac app shows Setup until both folders are chosen: this checkout and the iOS app clone.

## Known leftovers

- Cert keychain label "QA Workbench Local" is intentional.
- `server/scripts/sync-networklens.sh` still mirrors to `$DASHBOARD/../networklens-mcp/dist`; two server tests skip when the app repo is not beside the server.
- The Android driver is parked (docs only). Update `server/docs/android-driver-spec.md` when iOS contracts change.
