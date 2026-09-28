# CLAUDE.md

Pointers for any coding agent working on this repository. This file is for contributors' agents; the files the installer writes for end users live under `templates/`.

- Read `CONTRIBUTING.md` first, then `src/README.md` (the catalog drives everything), `SECURITY.md` (the security scope) and `docs/security-review-history.md` (completed reviews and regression checks).
- Run `npm test` before proposing a change and quote the count and the exit code; the suite prints the current number.
- `test/systemd/run-on-ubuntu.sh` is NOT in `npm test`: it needs a Linux host with systemd. Run it by hand when you touch `templates/advanced/vm/jobs/`, because the unit's `TimeoutStartSec` and `KillMode` cannot be checked any other way. `test/systemd/README.md` has the steps.
- `test/fixtures/` is real vendor output, not hand-written. When a vendor upgrade changes a shape, capture again at the new version and update `manifest.json` and the README compatibility table together.
- Everything renders from `src/catalog.js`. Add an AI or a tool there, not in a template. Templates carry no logic.
- `plugin/` is generated from `templates/` by `npm run gen:plugin`; never hand-edit it (only `plugin/README.md` and `plugin/hooks/hooks.json` are hand-owned). `test/plugin.test.js` fails on drift. A plugin hook may only read: no network, no file writes, no subprocess. Before a release, `claude plugin validate --strict plugin` must pass.
- Never put a value that looks like a credential anywhere in this repo, including tests and examples. Environment variable names only.
- `bin/cli.js` writes only inside `--dir` and `--project`, refuses home-level agent configuration and runs no third-party installer or vendor script. Existing documents stay unless `--force` replaces them or `--update-docs` verifies their recorded hash. Machine-owned configuration refreshes, unchanged managed runtime files upgrade, and `--upgrade-runtime` explicitly replaces runtime files. Project activation merges supported entries with backups. Preserve these ownership rules; `test/install.test.js` and `test/cli.test.js` check them.
- `bin/cli-run.mjs` must exit non-zero when a lane produced nothing. Every judge has a red case in `test/judges.test.js`; add one before you change a judge.
- Prose in this repo uses no em dashes (`test/prose.test.js` enforces it).
- Why these rules exist: each one is the fix for a failure that reached an audit or CI. `CHANGELOG.md` names the issue behind each.
