## What failure does this prevent?

<!-- One or two lines. A link to the issue is fine. -->

## What changed

<!-- Files and the one-line reason for each. -->

## Proof

- [ ] `npm test` green locally (say which OS and Node)
- [ ] CI green on Ubuntu and macOS
- [ ] If `bin/` or `src/install.js` changed: what I attacked and how it refused (symlinked dir, path outside the root, quote in `--dir`, lane exiting 0 with nothing, signal mid-run)
- [ ] If a judge changed: its red case in `test/judges.test.js` still fails without the fix
- [ ] A line under `[Unreleased]` in `CHANGELOG.md`
- [ ] Nothing that looks like a credential; no em dashes in prose

## Not done, on purpose

<!-- Anything you deferred, and why. Empty is a fine answer. -->
