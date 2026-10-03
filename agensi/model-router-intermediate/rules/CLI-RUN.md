# Lane runner (`node <skill-dir>/bin/cli-run.mjs`)

When assigning work to a CLI lane, use `node <skill-dir>/bin/cli-run.mjs` from the user's project root. The runner builds the vendor invocation, reads its terminal event and returns an exit code for the response and any explicit output contract.

Enabled lanes (edit `../bin/lanes.json`): none enabled until setup; inspect bin/lanes.json available and enable only verified installed CLIs.

## Call a lane with a task brief

- When Claude Code is assigned and a Claude worker MCP service is connected, prefer it. Inspect its schema and instructions, then call its tools from the host. Runner subprocesses cannot access the host's connected tools. Record the verified transport in your filled stack table. This pack supplies no manifest or worker service.
- When starting an MCP session, send the scoped brief and project directory, keep the session ID and cursor, and poll as the service directs until the final result. Verify acceptance checks, handle errors and cancel on the task deadline or user cancellation. A start response or idle session alone is not proof of success.
- For either transport, preserve the caller's permissions and project scope. Do not auto-approve tools, broaden paths, add credentials or change authentication. Answer permission requests within existing authorization and deny requests outside it; keep review requests review-only. Check the MCP server's environment against the task's access limits, even when it differs from the command sandbox.
- When selecting MCP options, leave the model unset unless the task or lane defaults select it; translate effort and other defaults only when the service supports them.
- When a compatible service is absent, use the native CLI in an authorized environment with its existing sign-in. After either transport fails, report the cause before switching; do not retry automatically through the other transport. Use CLI doctor for CLI presence and optional canaries only; check MCP availability and authentication through the host.

Anthropic's built-in [`claude mcp serve`](https://code.claude.com/docs/en/mcp#use-claude-code-as-an-mcp-server) exposes tools; it does not by itself establish a Claude agent-review service.

```bash
node <skill-dir>/bin/cli-run.mjs <lane> --brief TASK_BRIEF.md --timeout 900
```

Run `node <skill-dir>/bin/cli-run.mjs` from the user's project root, where `<skill-dir>` is the absolute path of the filled project copy; its lanes.json lives beside that script. Save the filled brief as TASK_BRIEF.md in the project root, or pass its absolute path.

When requesting a particular route, inspect the lane's current roster and select the model and effort for the job:

```bash
node <skill-dir>/bin/cli-run.mjs <lane> "<prompt>" --model '<model-id>' --effort high
```

When using Codex for an authorized read-only review, use `node <skill-dir>/bin/cli-run.mjs codex --audit --brief TASK_BRIEF.md`. Other lanes require their own verified review permissions.

For Qwen, omit --effort; when required use its --safe-mode flag. `--quiet` suppresses human-readable status lines. `--timeout SECS` bounds each call.

## Check availability before work depends on it

```bash
node <skill-dir>/bin/cli-run.mjs --doctor
node <skill-dir>/bin/cli-run.mjs --doctor --run
```

Use `--doctor` to inspect enabled lanes, binaries and requested defaults. Use `--doctor --run` for a small live prompt on each enabled lane, consuming vendor quota. When no lanes are enabled, the doctor exits 13; enable a verified CLI in the project copy of bin/lanes.json, or follow rules/ORCHESTRATOR.md as a single agent. Verify authentication and loaded project instructions separately from binary presence.

## Verify the result contract

When exit 0 returns, the native terminal event indicates completion, the response is non-empty and lane-specific error checks passed. Verify the task's actual acceptance checks separately: a structurally valid refusal can still satisfy that response shape.

When the task requires a file or structured output, add an explicit contract:

```bash
node <skill-dir>/bin/cli-run.mjs <lane> "Write out/report.md" --expect-file out/report.md
node <skill-dir>/bin/cli-run.mjs <lane> "Return the table as JSON" --expect-json
```

`--expect-file` records existence, size, mtime and content hash before the run. It then requires a non-empty regular file that is new or changed by hash or later mtime. Use a unique per-attempt path when another process might write the same file. `--expect-json` requires parseable JSON. An unmet contract exits 10 with reason `contract_unmet`.

## Read each lane's completion signal

The runner supports these lanes whether or not you selected them.

| Lane | Invocation built | Accepted response |
|---|---|---|
| claude | `-p --output-format json --permission-mode dontAsk` | result object, `subtype == "success"`, `is_error == false`, non-empty `result`, no execution errors or truncated stop reason |
| grok | `--output-format json -p` | `stopReason == "end_turn"` and non-empty `text` |
| codex | `exec --json --color never --skip-git-repo-check -o FILE` | terminal `turn.completed` event and non-empty output file |
| agy | `--print-timeout Nm --output-format stream-json -p` | terminal `result` event, `status == "SUCCESS"`, non-empty `response` |
| hermes | `-z` with a usage file | vendor exit 0 and a non-empty response |
| qwen | `-o json`, optional model and safe-mode flags, `-p` | successful terminal result, no error flag or API-error result, non-empty text and every model's `api.totalErrors == 0` |

When Qwen's error telemetry is absent, the runner refuses the response. These checks distinguish response structure from successful task execution.

Identify Claude Code as `claude-code` in your stack table; use `node <skill-dir>/bin/cli-run.mjs claude` for its executable fallback. The native adapter needs the Claude CLI and its existing authentication, independently of optional MCP companions. It uses [Anthropic's print-mode JSON result](https://code.claude.com/docs/en/headless) and [result completion states](https://code.claude.com/docs/en/agent-sdk/agent-loop).

Claude runs with [the `dontAsk` permission mode](https://code.claude.com/docs/en/permissions): calls needing approval are denied, while existing allow rules and actions needing no approval still apply. The runner grants no additional tools or permissions. This is not a read-only filesystem sandbox; `--audit` remains Codex-only. Claude's `permission_denials` counts blocked tools; a non-empty completed answer with denials is accepted with a warning, while no answer with denials exits 17. Authentication or account-access errors exit 14. Error subtypes, malformed JSON and truncated responses exit 18 unless a more specific native error identifies the cause.

## Respond to the exit class

| Code | Class | Action |
|---|---|---|
| 0 | `ok` | Verify task acceptance; read the problem line if `refused` is positive |
| 10 | `empty` | Inspect the missing response or unmet output contract |
| 11 | `no_output` | Check the lane directly before another attempt |
| 12 | `timeout` | Diagnose progress, then adjust the bound or split the work |
| 13 | `unavailable` | Resolve binary presence, lane enablement or malformed configuration |
| 14 | `auth` | Use the vendor's login or configured credential path |
| 15 | `quota` | Select another authorized lane or wait for quota renewal |
| 16 | `rejected` | Correct the model, flag or request named by the vendor |
| 17 | `refused` | Inspect the denied tool call and route it within authorized permissions |
| 18 | `cut_short` | Inspect a missing terminal event, signal, output overrun or unexplained nonzero vendor exit |
| 130 / 143 | `interrupted` | The wrapper received SIGINT / SIGTERM; inspect cleanup before resuming |
| 2 | usage error | Correct the runner arguments |

When a run fails, read the problem and fix lines and relay the actionable cause. Resolve it within existing authorization; request approval only for a change outside that scope. A nonzero vendor exit remains a failure even if text was produced; `cli_rc` preserves that vendor exit in the local log.

The runner classifies authoritative vendor error fields, with precedence `auth`, `quota`, `rejected`, `refused`, `cut_short`, `empty`. It excludes ordinary model prose from those error signals. A readable result with refused tool calls can remain exit 0; read the reported refusal alongside the result. `refused: null` means the lane supplied no readable refusal signal.

## Record the requested route

When a command flag is present, it overrides `../bin/lanes.json` defaults. When both are absent, the lane uses its own configuration. Inspect that configuration when the model or effort matters.

```json
{
  "enabled": [],
  "defaults": {},
  "available": [
    "claude",
    "codex",
    "agy",
    "grok",
    "hermes",
    "qwen"
  ],
  "note": "Fill at setup: add only verified installed CLI names from available to enabled. Every lane starts disabled. An unlisted lane exits 13.",
  "defaultsNote": "Unpinned: inherit each CLI configuration. Verify its current model and effort before a call. Flags override defaults. Qwen has no effort flag. Hermes provider selection requires a matching model. Doctor exits 13 until a lane is enabled."
}
```

Before adding defaults, verify the lane's current vendor model and supported flags. Model and effort values are bounded to the supported safe character set.

The runner supports these lanes whether or not you selected them.

| Lane | Model flag | Effort flag | Provider flag |
|---|---|---|---|
| claude | `--model` | `--effort` | Unsupported |
| grok | `-m` | `--reasoning-effort` | Unsupported |
| codex | `-m` | `-c model_reasoning_effort="LEVEL"` | Unsupported |
| agy | `--model` | `--effort` | Unsupported |
| hermes | `-m` | `--reasoning` | `--provider` |
| qwen | `-m` | Unsupported; an effort request is a usage error | Unsupported |

Hermes signs in to many providers, and a model sent to a provider that does not serve it fails with HTTP 400. Pin both with `--provider` and `--model`, or with `"provider"` beside `"model"` under `"hermes"` in `../bin/lanes.json` defaults. A provider with no model is a usage error. That failure is reported as `rejected` (exit 16) with a model/provider mismatch line; `hermes model` repairs the pairing in Hermes itself.

When using `--effort auto`, treat its medium/high selection as a bounded heuristic; an audit has a high floor. Use explicit high for builds and xhigh where supported for security-critical or irreversible work. The vendor validates its own effort names and reports unsupported values through the failure class.

## Preserve permissions and secrets

The runner grants no additional permissions. Claude uses `dontAsk` to deny calls needing approval; Codex `--audit` requests a read-only filesystem sandbox. Keep each vendor's permissions in its own configuration and route work within the task's granted scope. A denied write becomes a handoff to an authorized writer.

Prompts travel in argv, which other processes may inspect. Never put secrets in a prompt. For large task inputs, give the worker a brief with authorized source paths instead of exceeding the operating system's argument-size limit.

Terminal status and error details are redacted before clipping. Local logs exclude prompt text and provider free text. `--quiet` also suppresses the human-readable details.

## Inspect the local log

Read `~/.ai-orchestrator/cli-run.log.jsonl` for one record per run: lane, verdict, class, return codes, signal, refusal count, timing, byte counts, prompt hash and length, requested model and effort, source of those requests, auto-effort evidence and a fixed reason code.

Use `model_source: "lane_default"` to identify an inherited route. These fields record requested settings; verifying the vendor's actual model requires vendor evidence. Keep task success grounded in the acceptance checks.

## Configuration and process boundaries

- When `lanes.json` is absent, all supported lanes are enabled with inherited defaults. When it is malformed or unreadable, the runner refuses every lane with exit 13 until corrected.
- When a lane dies by signal, discard its partial response and handle `cut_short` exit 18.
- On POSIX, timeout, output overrun and catchable interruption kill the lane's process group. A child that creates its own session can escape that boundary; use a service-level process boundary where needed.
- On Windows, lanes use a direct executable or a resolved Node shim, never `cmd.exe`. Windows termination behavior differs from POSIX signal cleanup.
- When the wrapper receives uncatchable SIGKILL, use a supervisor such as systemd with `KillMode=control-group` to clean up its process tree.
- Vendor output uses streaming UTF-8 decoding and a 16 MiB cap counted in bytes.

## Choose the lane

When selecting a lane, apply `../rules/ROUTING.md` and `../rules/DELEGATION_MATRIX.md`. The runner executes the lane named by the caller. Its response checks work independently of optional companion software.
