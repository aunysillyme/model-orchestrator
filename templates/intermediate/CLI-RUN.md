# CLI-RUN.md: exit 0 means the deliverable exists

`bin/cli-run.js` is one entrypoint for the agent CLI lanes. It builds the right invocation per lane, reads that lane's native terminal event, and exits non-zero unless a real deliverable came back.

Enabled lanes (edit `bin/lanes.json`): {{CLI_RUN_LANES}}

```bash
node bin/cli-run.js <grok|codex|agy|hermes|qwen> "<prompt>" [--brief FILE] [--timeout SECS] [--quiet]
node bin/cli-run.js codex --audit "<prompt>"                  # read-only sandbox, the audit shape
node bin/cli-run.js qwen [--model ID] [--safe-mode] "<prompt>"
```

Put it on your PATH if you like: `ln -s "$PWD/bin/cli-run.js" ~/.local/bin/cli-run`.

## Why it exists

Every agent CLI can exit 0 having produced nothing. The symptom (confident preamble, exit 0, no deliverable) is indistinguishable from a model failure, so it gets blamed on the model. Four wrong diagnoses in one week came from exactly that.

Byte count is not a deliverable check either: a run can emit hundreds of kilobytes and contain no conclusion.

## The success signal per lane

| Lane | Invocation built | Success = |
|---|---|---|
| grok | `--output-format json -p` | `stopReason == "end_turn"` and non-empty `text` |
| codex | `exec --json --color never --skip-git-repo-check -o FILE` | terminal `{"type":"turn.completed"}` and non-empty FILE |
| agy | `--print-timeout Nm --output-format stream-json -p` | terminal `{"event":"result"}`, `status == "SUCCESS"`, non-empty `response` |
| hermes | `-z … --usage-file FILE` | its exit code is already honest: 0 response · 1 none · 2 bad args |
| qwen | `-o json [-m ID] [--safe-mode] -p` | terminal `{"type":"result"}`, `subtype == "success"`, `is_error` false, non-empty `result` not starting with `[API Error:`, and every `stats.models.*.api.totalErrors == 0` |

qwen is the lane whose own success flags lie: an upstream 400 comes back as exit 0, `subtype: success`, `is_error: false`, with the error text inside `result`. The two extra checks are the honest ones. Absent telemetry is refused, not read as zero.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | deliverable present |
| 10 | ran, produced no deliverable (the class this exists to catch) |
| 11 | no output at all |
| 12 | timed out |
| 13 | lane unavailable (binary missing, or disabled in `lanes.json`) |
| 2 | usage error in cli-run itself |
| other | passed through from the CLI |

## Permissions are a separate layer

`cli-run` never injects permission flags. Each CLI carries its own config, so every caller gets the same behaviour. Use each vendor's deny-list as the base layer; allow-lists only hold if every binary is enumerable in advance.

## Log

`~/.ai-orchestrator/cli-run.log.jsonl`, one line per run: lane, verdict, rc, signal, seconds, raw bytes, deliverable bytes, the structural reason (`stopReason=cancelled`, `no terminal result event`, `success flag lied, result is an API error`), a 12-hex sha256 prefix of the prompt and its length. Never the prompt text and never a provider's message text: both can carry material that should not sit in a durable file. The full detail goes to stderr, where you are. "This lane is flaky" becomes a query instead of an argument.

## The prompt travels in argv

That is each vendor's documented headless shape (`-p`, `exec`). Two consequences: argv is visible to other processes on the machine, so a prompt is never the place for a key; and argv is bounded by the OS (`ARG_MAX`), so a very large brief should be referenced by path inside the prompt rather than pasted whole.

## lanes.json fails closed

Absent: every lane enabled. Present but malformed or unreadable: every lane refused (exit 13) until it is fixed. A half-written config never re-enables a lane the installer disabled.

## A killed lane is not a deliverable

A lane that dies by signal has no honest exit status. Whatever it printed first is discarded; the run reports `killed` with exit 10.

## Lane choice is not automated

`cli-run` runs the lane it is given. Which lane fits the job is `ROUTING.md` and `DELEGATION_MATRIX.md`, or a question to the human.
