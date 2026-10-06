# Commands and lane runner

Plain Node executables with zero runtime dependencies.

| File | Command | What it gives you |
|---|---|---|
| `cli.js` | `npx model-orchestrator` | Select a setup and write routing files; print third-party setup commands for you to run |
| `aunx.js` | `aunx` | Run the installer, dispatch the lane runner, scaffold briefs and checks, summarize metrics or suggest a route |
| `cli-run.mjs` | `aunx cli-run` | Call an agent CLI and return nonzero when it produces no accepted result |

## Lane runner (`aunx cli-run`)

```bash
aunx cli-run --doctor
aunx cli-run codex --brief TASK_BRIEF.md --effort high
# Direct equivalents from the installed rules folder:
node bin/cli-run.mjs --doctor
node bin/cli-run.mjs codex --brief TASK_BRIEF.md --effort high
```

`aunx` uses the packaged runner by default. Pass `--dir PATH` to use that project's own installed runner under `PATH/bin/`; `aunx` then prints the runner path it is using on stderr. When `--dir` names a folder with no runner, the packaged copy runs instead. Arguments and exit status pass through. `--doctor --run` performs live checks using your own vendor sign-ins and quota.

| Exit | Meaning |
|---|---|
| 0 | Accepted result |
| 2 | Invalid usage |
| 10 | Empty result or unmet output contract |
| 11 | No output |
| 12 | Timeout |
| 13 | Unavailable tool |
| 14 | Authentication failure |
| 15 | Quota exhausted |
| 16 | Request rejected |
| 17 | Required tool action refused |
| 18 | Run cut short |
| 130 / 143 | Interrupted by a signal on POSIX |

The local log records requested model and effort, their source, fixed result classes and the vendor exit code. Its existing schema is preserved. It stores no prompt text or provider-supplied failure text.

`cli-run.mjs` exports its output judges so `test/judges.test.js` can prove each rejects the failure shapes it exists to catch. Tests use fixture output and stub CLIs.

## Acceptance-check runner (`aunx checks run`)

Scaffold with `aunx checks ACCEPTANCE_CHECKS.json`, then fill each command and its expected property. `aunx checks run ACCEPTANCE_CHECKS.json` executes the commands and reports PASS or FAIL. Any failure exits 1. These are shell commands with your permissions: run only a reviewed check file. Gate a later action by running it only after exit 0.

## Briefs, context and metrics

`aunx brief` prints the template; `aunx brief new TASK_BRIEF.md` writes a new file. `aunx context CONTEXT.md` scaffolds shared facts. `aunx route-metrics --summary` reports local routing activity. `aunx route "design the auth system"` prints an explained keyword-based suggestion and launches no worker.

## Operation and verification

- **What and why:** one command exposes the installer and the tools an agent uses to prepare, route and verify work.
- **Trigger:** a user or agent invokes a command explicitly. The wrapper registers no background service.
- **Invocation chain:** npm bin link -> `bin/aunx.js` -> `src/aunx.js` -> the selected Node entry point or local scaffold/check handler.
- **Dependencies:** Node as declared in `package.json`; a vendor CLI and its sign-in only when calling that vendor. Scaffolds and route suggestions work without companions.
- **Reads:** package templates, an explicitly selected check file, the project's installed runner, and the existing metrics log for summaries.
- **Writes:** scaffold files use exclusive creation. Check commands can write whatever their reviewed code requests. The delegated runner and metrics hook retain their documented local logs.
- **Closed loop:** callers inspect the exit code and the check report. Nothing watches the wrapper as a service; the repository test workflow watches committed changes. Gate a later action on exit 0 when using acceptance checks.
- **Failure modes:** invalid arguments or check format return 2, failed checks return 1, and dispatched Node commands retain their exit codes. An existing scaffold path is preserved. Without `--dir` the packaged runner always runs; `--doctor` reads `./ai-orchestrator/bin/lanes.json` when present as data only. With `--dir`, a missing project runner falls back to the packaged copy.
- **Run and verify:** `node bin/aunx.js --help`, `node bin/aunx.js route "rename this file"`, and `node --test test/aunx.test.js`. For a real vendor, use the doctor command above with your own authorization and quota.
- **Source of truth:** `src/aunx.js`, the templates it loads, and the dispatch and exit-code tests in `test/aunx.test.js`.
