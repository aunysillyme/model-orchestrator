# Guarantees and verification

model-orchestrator writes its managed files and the project activation changes shown in the summary. It runs no third-party installs, edits no global user config and sends no telemetry. `npx` itself downloads this package through npm before the installer starts.

Use the distinction below when choosing which parts to run unattended.

| Property | What enforces it |
|---|---|
| Installer writes stay inside `--dir` and `--project`; existing edits are preserved by default | Code: path preflight, exclusive creation, rollback and manifest hashes |
| Companion tools start unselected, including with `--yes` | Code: explicit tool selection; missing tools get printed setup commands |
| `--update-docs` refreshes unedited documents; `--upgrade-runtime` replaces runtime files only | Code: recorded hashes, file classes and named conflicts |
| Interactive activation applies the main agent's supported rules and settings with backups; `--yes` requires `--apply-snippets` | Code: one confirmation, the `--no-apply` flag and edit toggle, marked rules blocks and validated settings merges |
| Selected companions register automatically only in the main agent's catalog-supported project config | Code: Claude Code's project `.mcp.json` target; other hosts retain manual setup steps |
| Uninstall removes unchanged managed files and unchanged recorded activation entries | Code: complete manifest validation before removal, containment checks, hash comparison and activation ownership records |
| Every non-dry install checks CLI presence; live prompts stay opt-in | Code: automatic `--doctor`; `--doctor --run` explicitly enables vendor canaries |
| `cli-run` returns nonzero for missing results, timeouts and rejected output contracts | Code: vendor-specific output checks, process cleanup and `--expect-*` checks against a pre-run snapshot |
| Acceptance checks report PASS or FAIL and return exit 1 for any failure | Code: `aunx checks run ACCEPTANCE_CHECKS.json`; run it before the action you want to gate |
| Proof entries carry measurement dates, methods and expiry dates | Code: data validation and an expiry check in `npm test` |
| Codex audits request read-only filesystem access | Vendor flag: `--audit` selects `--sandbox read-only`; command and network permissions still follow the vendor configuration |
| Other workers' permissions, sign-in state and model availability | Vendor configuration and your live verification with `aunx cli-run --doctor --run` |
| Gateway listens on loopback and refers to secrets by environment-variable name | Generated configuration; authentication and deployment remain your responsibility |
| Model choice, effort guidance, privacy rules, one writer and independent review | Agent instructions in the routing rules, task brief and protocols |
| Weekly review has bounded execution and preserves the previous report on failure | Generated script and service: watchdog, temporary output and rename |

The acceptance-check runner executes commands you supply, with your shell's permissions. Review a check file before running it. Wire its exit code into your own release command or CI when you want it to block that action.

The plugin's routing hooks only read files and emit context; they run no subprocess, perform no network access and write no files. The separate installed metrics hook writes a local routing log without prompt text. [Security review history](security-review-history.md) links the regression evidence for these boundaries.
