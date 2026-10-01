# Contributing

Thanks for looking. Two kinds of contribution land well here: a **failure you hit** (with the exact command and exit code), and a **fix with a test that goes red without it**. Feature ideas without a failure behind them usually turn into an issue discussion first.

## Before you open anything

- **Search** the issues, open and closed. Your case may already have a fix and regression test.
- **Reproduce** in a fresh temp directory with the exact command. Exit codes are part of the contract: the installer exits 0 on success and 2 on a refused flag or an aborted prompt; `cli-run` exits 0 only when the lane produced a result, and otherwise one code per failure class (10 empty or unmet contract; 11 no output; 12 timeout; 13 unavailable; 14 auth; 15 quota; 16 rejected; 17 refused; 18 cut short; 130/143 on signal). The vendor's own exit code is logged as `cli_rc`.

## Running the checks

```bash
npm test                 # node --test: the suite prints the current number, fixture and stub tests, no live vendor call
npm run dry-run          # plan a level 2 install and write nothing
node bin/cli.js --help
```

CI runs the same on Ubuntu, macOS and Windows across Node 18, 20 and 22, then packs the tarball and installs it into a clean consumer project. Check the CI matrix for platform behavior beyond your local machine.

## Adding an AI

1. One entry in `src/catalog.js`. Every prompt, table, snippet, config and doc renders from it; you should not need to touch a template.
2. If the AI has a CLI, add its judge to `bin/cli-run.mjs` and a case per failure shape to `test/judges.test.js`. A judge that only accepts success is not a judge; the test file has a self-check that a no-op judge fails the suite.
3. `npm run gen:catalog` regenerates `docs/catalog.md`. Commit the result.

## Adding a companion tool

An entry in `TOOLS` in `src/catalog.js`, a doc under `templates/tools/<id>/`, and registration snippets under `templates/tools/<id>/mcp/`. Say what the user needs first (`requires`) and how it behaves when absent. Every companion is opt-in, including with `--yes`. Selecting a tool writes docs and snippets. Catalog `mcpSnippets` maps each host to its snippet; a verified host `projectMcp` target enables a backed-up project merge when activation is enabled. Global config stays user-managed, and the installer never installs a third-party tool.

## Pull requests

- One concern per PR. `npm test` green on your OS; CI green across the platform matrix.
- If you touched `bin/cli.js`, `src/install.js` or `bin/cli-run.mjs`, say what you challenged and how it refused: a symlinked `--dir`, a path outside the root, a `--dir` with a quote in it, a lane that exits 0 with nothing, a signal mid-run.
- Templates carry no logic and nothing that looks like a credential. Keys are named by environment variable, never by value.
- No em dashes in prose you add. It is a house rule and `test/prose.test.js` checks it.
- Add a line under `[Unreleased]` in `CHANGELOG.md`.

## Contributor License Agreement

Outside contributors tick the Contributor License Agreement box in the PR description. You keep the copyright in what you wrote and grant Auny LLC the licenses in [CLA.md](CLA.md). The `cla` check passes once the box is ticked.

## Published evidence

When changing a measured claim, update its script under `proof/scripts/`, rerun it and regenerate `proof/README.md` from `proof/results.json`. Every figure needs a method, sample size, measurement date and expiry. Use `<model-id>` in examples; dated catalog fields hold vendor identifiers.

## Releases

See [RELEASING.md](RELEASING.md). Maintainer-only for now.
