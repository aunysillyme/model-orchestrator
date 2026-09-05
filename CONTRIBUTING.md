# Contributing

Thanks for looking. Two kinds of contribution land well here: a **failure you hit** (with the exact command and exit code), and a **fix with a test that goes red without it**. Feature ideas without a failure behind them usually turn into an issue discussion first.

## Before you open anything

- **Search** the issues, open and closed. Fifteen audit issues were closed in the first two days; your case may be there with its fix and its test.
- **Reproduce** in a fresh temp directory with the exact command. Exit codes are part of the contract: the installer exits 0 on success and 2 on a refused flag or an aborted prompt; `cli-run` exits 0 only when the lane produced a deliverable (10 empty, 11 timeout, 12 overrun, 13 error, 130/143 on signal, the vendor's own code otherwise).

## Running the checks

```bash
npm test                 # node --test: 116 cases, no network, no CLI spawned
npm run dry-run          # plan a level 2 install and write nothing
node bin/cli.js --help
```

CI runs the same on Ubuntu and macOS across Node 18, 20 and 22, then packs the tarball and installs it into a clean consumer project. A green run on your machine is not a green run on a foreign one; the first Ubuntu run of this repo found a race 60 local passes had missed.

## Adding an AI

1. One entry in `src/catalog.js`. Every prompt, table, snippet, config and doc renders from it; you should not need to touch a template.
2. If the AI has a CLI, add its judge to `bin/cli-run.mjs` and a case per failure shape to `test/judges.test.js`. A judge that only accepts success is not a judge; the test file has a self-check that a no-op judge fails the suite.
3. `npm run gen:catalog` regenerates `docs/catalog.md`. Commit the result.

## Adding a companion tool

An entry in `TOOLS` in `src/catalog.js`, a doc under `templates/tools/<id>/`, and registration snippets under `templates/tools/<id>/mcp/`. Say what the user needs first (`requires`) and whether it is recommended or optional. Selecting a tool writes docs and snippets; the installer never installs a companion.

## Pull requests

- One concern per PR. `npm test` green on your OS; CI green on both.
- If you touched `bin/cli.js`, `src/install.js` or `bin/cli-run.mjs`, say what you attacked and how it refused: a symlinked `--dir`, a path outside the root, a `--dir` with a quote in it, a lane that exits 0 with nothing, a signal mid-run.
- Templates carry no logic and nothing that looks like a credential. Keys are named by environment variable, never by value.
- No em dashes in prose you add. It is a house rule and `test/prose.test.js` checks it.
- Add a line under `[Unreleased]` in `CHANGELOG.md`.

## Releases

See [RELEASING.md](RELEASING.md). Maintainer-only for now.
