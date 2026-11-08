# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Versions follow [CONTRIBUTING.md](CONTRIBUTING.md#releases).

## [Unreleased]

### Added
- Mac app: Settings › Project › Updates and a TestForge menu item that pull the latest master, rebuild and reopen the app (D-217).
- `build-app.command`: double-click to build the Mac app and open it.
- `update-app.command`: double-click to pull the latest master, rebuild and open the app.
- `setup.sh`: checks the tools, installs the server's dependencies, builds the Mac app, enables the git hook.
- `docs/README.md`: map of the documents.
- Mac app test target with `RepoFolderResolver` tests (`swift test` in `mac-app/`).

### Fixed
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
