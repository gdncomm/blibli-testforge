# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Versions follow [CONTRIBUTING.md](CONTRIBUTING.md#releases).

## [Unreleased]

### Added
- Mac app: each test case shows whether it replays without Claude: ⚡ free replay, ⚡ not confirmed, ⚠ recording needs repair, ✨ needs Claude. Free replay and Needs Claude filters; the header counts both (D-220).
- Mac app: one Replay button. Click to replay; press and hold for Replay with explanations, Record demo video and Write explanations with Claude (D-220).
- Mac app: Docs section (⌘D) that lists the README, the usage guide and the feature list and shows them in place, with Half and Full layouts, an outline, links that open in place, and a separate Docs window for the left or right half of the screen or full screen. Drop Markdown files or folders, or use File › Open Markdown… (⌘O), to read your own (D-218).
- Mac app: Help › TestForge Usage Guide and TestForge Features open those docs in the app.
- Mac app: the Markdown viewer reads nested and task lists, heading links, and images next to the document.
- `docs/Features.md`: every feature of the Mac app, by sidebar section, with who it is for and whether it needs Claude.
- `docs/Usage-guide.md`: a how-to for each feature, with notes on what is out of date in `server/docs/usage.md` and `walkthrough-v4.md`.
- Mac app: Settings › Project › Updates and a TestForge menu item that pull the latest master, rebuild and reopen the app (D-217).
- `build-app.command`: double-click to build the Mac app and open it.
- `update-app.command`: double-click to pull the latest master, rebuild and open the app.
- `setup.sh`: checks the tools, installs the server's dependencies, builds the Mac app, enables the git hook.
- `docs/README.md`: map of the documents.
- Mac app test target with `RepoFolderResolver` tests (`swift test` in `mac-app/`).

### Fixed
- A Claude pass now shows UNCONFIRMED until a replay of its saved recording passes, so a case whose recording was never saved no longer looks passed and quietly goes back to Claude. A single Run with Claude saves and replays the recording too (D-220).
- The Claude usage limit during saving a recording or triaging a failure now pauses the batch instead of leaving the case unrecorded. Re-run failed replays cases that have a recording now (D-220).
- Replay is off, and the server refuses it, for a recording whose routine or element is missing.
- `setup.sh` and `update-app.command` clear the macOS quarantine flag a Git app such as Sourcetree puts on pulled scripts, so double-clicking them works.
- An app built inside the checkout skipped Setup and started the server without `QA_PROJECT_DIR`, so the server exited. Setup now shows until an iOS clone is chosen.

### Changed
- Setup asks for two folders: this checkout and the iOS app clone (`QA_PROJECT_DIR`).
- Settings › Project: the row is now "TestForge checkout" (it never changed the iOS clone).

## Pre-release history

- #5 Mac app runs `server/start.sh` and passes `QA_PROJECT_DIR`.
- #4 Server (`server/`).
- #3 Mac app (`mac-app/`).
- #2 `test-flow-recorder` plugin and marketplace.
- #1 Repository setup.
- Renamed QA Workbench to TestForge (D-215, D-216).
