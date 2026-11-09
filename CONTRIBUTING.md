# Contributing

## Branching strategy: trunk plus short-lived branches

`master` is the only long-lived branch. It is always installable: the plugin marketplace and `setup.sh` point at it, so a broken `master` breaks every developer's TestForge.

| Branch | Pattern | Rule |
|---|---|---|
| Trunk | `master` | Never push directly. Change it only by PR. |
| Work | `<firstname>/<type>/<topic>` | Branch from `master`, keep it under a few days, delete after merge. |
| Hotfix on an old release | `release/<major>.<minor>` | Only when a shipped tag needs a fix and `master` has moved on. Branch from the tag, fix, tag `v<major>.<minor>.<patch+1>`, then port the fix to `master`. |

`<type>` is one of `feature`, `fix`, `chore`, `docs`, `refactor`, `test`. Examples: `darshan/feature/setup-script`, `asha/fix/replay-timeout`.

### Flow

1. `git switch master && git pull --ff-only`
2. `git switch -c <firstname>/<type>/<topic>`
3. Commit small, push, open a PR into `master`.
4. One approving review (the code owner for the area, see `.github/CODEOWNERS`), CI green when CI exists.
5. **Squash merge**, delete the branch. The squash title is the commit message on `master`.

Rebase your branch on `master` before merging if it is behind. Do not merge `master` into a work branch repeatedly; rebase instead.

## Commits and PR titles

`[TestForge] <summary in the imperative>`, optionally with the area: `[TestForge] Mac app: add Free space row`. Keep the summary under about 70 characters; explain why in the body when it is not obvious.

A non-obvious design choice gets a new `D-NNN` entry in `server/docs/decision.md` in the same PR (append, never rewrite old entries).

## Releases

Semantic versions, tagged on `master`: `v<major>.<minor>.<patch>`.

- **Patch**: fixes only.
- **Minor**: new features, backward compatible with existing recordings and state.
- **Major**: breaking change to recordings, `~/.test-forge` state or the plugin contract. Ship a migration note.

Releasing is: bump the plugin and app versions, update the changelog, merge, tag, and push the tag.

## Enforcement

The gdncomm organization rulesets block force-push and deletion on `master`. They do **not** require a PR or a review, so the rest is on us:

- Never push to `master` directly. Open a PR; one approving review from a code owner before merge; resolve all conversations; squash merge only (the repo allows nothing else).
- Enable the tracked hook once per clone: `git config core.hooksPath .githooks`. It refuses a push to `master` (override only for a bootstrap with `ALLOW_MASTER_PUSH=1`).

If a repo admin adds a branch rule, require: PR before merge, 1 approval, code-owner review, resolved conversations, linear history.

## Secrets

Do not commit credentials, `.env*`, `.netrc`, `*.p12`, Keychain exports or recorded mocks holding real tokens. If one is committed, rotate it first, then remove it from history.
