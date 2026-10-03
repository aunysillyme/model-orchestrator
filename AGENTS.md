# Agent instructions

## Use the model router in a project

When configuring a project, run `npx model-orchestrator --list` to inspect supported IDs. Preview a scoped setup with:

```bash
npx model-orchestrator --yes --level 2 --ais claude-code,codex --project <repo> --dir <repo>/ai-orchestrator --dry-run
```

When the selection and target paths are correct, remove `--dry-run`. Interactive installs apply the main agent's catalog-supported project rules and settings with backups under the single confirmation; use `--no-apply` or the edit screen to keep activation manual. Headless `--yes` applies activation only with `--apply-snippets`. Every non-dry install runs the local presence health check automatically; live `--run` canaries stay opt-in. Read the generated `README.md` and the final "What's left for you" list for any remaining sign-in or paste steps. When updating an existing install, use `--update-docs` to regenerate unchanged managed documents; edited files stay and are named.

When choosing tools, select companions explicitly with `--tools`. Defaults select none, including with `--yes`. With activation enabled, supported project MCP configuration is merged with backups; global configuration remains a manual step. The installer runs no third-party installs or login flows. Uninstall removes unchanged recorded activation blocks and the hook or MCP entries it added, preserving surrounding content.

When `aunx` is installed, use:

- **Worker call:** `aunx cli-run codex --brief TASK_BRIEF.md --effort high`.
- **Shared facts:** `aunx context CONTEXT.md`.
- **Task scope:** `aunx brief new TASK_BRIEF.md`.
- **Verification:** `aunx checks ACCEPTANCE_CHECKS.json`, then fill and run trusted commands with `aunx checks run ACCEPTANCE_CHECKS.json`.
- **Routing suggestion:** `aunx route "rename this file"`, then apply the installed `ROUTING.md` to the actual context.
- **Own measurements:** `aunx route-metrics --summary`; use [proof/README.md](proof/README.md) for package measurements and scripts.

When using the Claude Code plugin, follow [plugin/README.md](plugin/README.md). The installer supplies project-specific routing rules. Use [llms.txt](llms.txt) for the documentation index.

## Change this repository

- **Read first:** `CONTRIBUTING.md`, `src/README.md`, `SECURITY.md` (security scope) and `docs/security-review-history.md`.
- **Catalog:** when adding an AI or companion, edit `src/catalog.js`; keep templates free of logic.
- **Templates:** when changing installed instructions, edit `templates/`. Use public terms: task brief, context file, acceptance checks, definition of done and result.
- **Generated files:** run `npm run gen:catalog` after catalog changes and `npm run gen:plugin` after plugin-template changes. `plugin/` is generated from `templates/`; only `plugin/README.md` and `plugin/hooks/hooks.json` are hand-owned. `test/plugin.test.js` fails on drift. Before a release, `claude plugin validate --strict plugin` must pass.
  Run `npm run gen:agensi` after template changes; `agensi/` is generated, only `templates/agensi/` is hand-owned.
- **Plugin safety:** hooks may only read and emit context. No network, file writes, subprocesses or credential access.
- **Installer safety:** `bin/cli.js` writes only inside `--dir` and `--project`, refuses home-level agent configuration and runs no third-party installer or vendor script.
- **Installer ownership:** existing documents stay unless `--force` replaces them or `--update-docs` verifies their recorded hash. Machine-owned configuration refreshes, unchanged managed runtime files upgrade, and `--upgrade-runtime` explicitly replaces runtime files. Project activation merges supported entries with backups. Preserve these rules; `test/install.test.js` and `test/cli.test.js` check them.
- **Runner safety:** preserve exit codes and the log schema. `bin/cli-run.mjs` exits non-zero when a lane produced nothing. Every judge has a red case in `test/judges.test.js`; add one before changing a judge.
- **Systemd:** when touching `templates/advanced/vm/jobs/`, run `test/systemd/run-on-ubuntu.sh` by hand on a Linux host with systemd to check `TimeoutStartSec` and `KillMode`. This check sits outside `npm test`; follow `test/systemd/README.md`.
- **Fixtures:** `test/fixtures/` is real vendor output. When a vendor upgrade changes a shape, capture again at the new version and update `manifest.json` and the README compatibility table together.
- **Secrets:** use environment-variable names only. Never add a credential value to code, examples or tests.
- **Proof:** measure through `proof/scripts/`, store results in `proof/results.json` and regenerate the proof page. An expired entry warns and is re-measured; it never blocks tests or releases.
- **Verify:** before proposing a change, run `npm test` and report tests, pass, fail, skipped and exit code. The suite prints current counts. Use `npm pack --dry-run` to inspect publication contents.
- **Style:** use short condition-to-action instructions and no em dashes. `test/prose.test.js` checks public vocabulary and examples.

Each rule is the fix for a failure that reached an audit or CI. `CHANGELOG.md` names the issue behind each.
