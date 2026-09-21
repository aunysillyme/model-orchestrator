# What holds, and what is only asked for

Read this before running any of it unattended.

Most of what this package ships is text an agent is asked to follow. Be clear about which is which before relying on it unattended.

| Property | How it holds |
|---|---|
| Installer writes only inside `--dir` and `--project`, never a secret, never over a document without `--force` (or `--update-docs`, which touches only documents provably untouched since a previous run); machine-owned config always, runtime files only when provably untouched or with `--upgrade-runtime` | **enforced by code** (preflight, exclusive create, rollback, manifest hashes; tested) |
| `cli-run` exit codes, process-group kill on timeout and on SIGINT/SIGTERM, UTF-8-safe streaming, fixed-code durable log, `--expect-*` contracts with a pre-run snapshot | **enforced by code** (tested with stub lanes) |
| Codex audit lane runs read-only | **delegated to the vendor flag** (`--audit` → `--sandbox read-only`); commands and network still follow your codex config |
| Other lanes' permissions, sign-in state, model versions | **delegated to each vendor's own config**; `--doctor` checks presence, not versions |
| Gateway binds to loopback, keys by name only | **enforced in the generated files**; whether the gateway authenticates is your environment |
| Lane selection, tiers, privacy classes, one-writer, escalation, the protocols | **agent instructions**. Nothing here stops an agent that ignores its rules; the task bundle and the protocols make ignoring them visible, not impossible |
| Weekly audit bounded, previous report preserved | **enforced in the generated script and unit** (watchdog, temp-and-rename, `TimeoutStartSec`) |

If you need a property in the third row to be enforced, that is a router, a policy engine or a sandbox, and this package does not claim to be one.

