# CLAUDE.md

Pointers for any coding agent working on this repository. This file is for contributors' agents; the files the installer writes for end users live under `templates/`.

- Read `CONTRIBUTING.md` first, then `src/README.md` (the catalog drives everything) and `docs/audit-brief.md` (the threat model and what has already been attacked).
- Run `npm test` before proposing a change and quote the count and the exit code. 116 cases at the time of writing; the suite prints the current number.
- Everything renders from `src/catalog.js`. Add an AI or a tool there, not in a template. Templates carry no logic.
- Never put a value that looks like a credential anywhere in this repo, including tests and examples. Environment variable names only.
- `bin/cli.js` writes only inside `--dir` and `--project`, never over a document without `--force`, and never runs a vendor script. A change that weakens any of those will be refused in review; the tests that hold them are in `test/install.test.js` and `test/cli.test.js`.
- `bin/cli-run.mjs` must exit non-zero when a lane produced nothing. Every judge has a red case in `test/judges.test.js`; add one before you change a judge.
- Prose in this repo uses no em dashes (`test/prose.test.js` enforces it).
- Why these rules exist: each one is the fix for a failure that reached an audit or CI. `CHANGELOG.md` names the issue behind each.
