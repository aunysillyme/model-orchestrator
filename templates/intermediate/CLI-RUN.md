# CLI-RUN.md: exit 0 means a structurally accepted, non-empty response

`bin/cli-run.mjs` is one entrypoint for the agent CLI lanes. It builds the right invocation per lane, reads that lane's native terminal event, and exits non-zero unless a structurally accepted, non-empty response came back.

## The guarantee, exactly

Exit 0 means: the lane's native terminal event says it finished, the response is non-empty, and the lane-specific error checks passed. **It does not mean the task was done.** A refusal that parses cleanly is exit 0. When your task has a real contract, state it:

```bash
node bin/cli-run.mjs codex "Write the report to out/report.md" --expect-file out/report.md   # must exist, be non-empty, and be written during this run
node bin/cli-run.mjs grok  "Return the table as JSON" --expect-json                          # the response must parse as JSON
```

An unmet contract is exit 10 with reason `contract_unmet`. `--expect-file` snapshots the target before the lane starts (existence, size, mtime, content hash) and afterwards requires a non-empty regular file that is new or changed: a different hash, or a later mtime. A file that existed before and was not touched fails, however recent it is; a rewrite with identical bytes and an unchanged mtime also fails, because nothing distinguishes it from no write. Timestamps and hashes are evidence of change, not proof of authorship: if another process could write the same path during the run, use a per-attempt path. Text-only callers need nothing new: without a contract flag the behaviour is the structural check above.

Enabled lanes (edit `bin/lanes.json`): {{CLI_RUN_LANES}}

```bash
node bin/cli-run.mjs <grok|codex|agy|hermes|qwen> "<prompt>" [--brief FILE] [--timeout SECS] [--quiet]
node bin/cli-run.mjs codex --audit "<prompt>"                  # read-only sandbox, the audit shape
node bin/cli-run.mjs qwen [--model ID] [--safe-mode] "<prompt>"
```

Put it on your PATH if you like: `ln -s "$PWD/bin/cli-run.mjs" ~/.local/bin/cli-run`.

## First run: `--doctor`

```bash
node bin/cli-run.mjs --doctor          # which lanes are enabled and which binaries are on PATH; runs nothing
node bin/cli-run.mjs --doctor --run    # also sends each enabled lane one tiny prompt and judges the reply (uses a little quota)
```

A lane that is enabled but not on PATH, or that answers with no deliverable, shows up here before it shows up mid-task.

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
| 0 | structurally accepted non-empty response, every `--expect-*` contract met |
| 10 | ran and produced no deliverable, or a contract was unmet, or the lane was killed by a signal, or output overran the 16 MiB buffer |
| 11 | no output at all |
| 12 | timed out; the lane and every descendant in its process group were killed |
| 13 | lane unavailable: binary missing, disabled in `lanes.json`, or `lanes.json` malformed |
| 130 / 143 | cli-run itself received SIGINT / SIGTERM; the lane's process group was killed first, then the temp dir removed |
| 2 | usage error in cli-run itself |
| N | the lane exited N != 0: passed through unchanged, verdict `exit_nonzero`, even when parseable text came back. The bounded head of the lane's stderr is shown on your terminal so an auth failure reads as one |

## Permissions are a separate layer

`cli-run` never injects permission flags. Each CLI carries its own config, so every caller gets the same behaviour. Use each vendor's deny-list as the base layer; allow-lists only hold if every binary is enumerable in advance.

## Log

`~/.ai-orchestrator/cli-run.log.jsonl`, one line per run: lane, verdict, rc, the lane's own exit code, signal, seconds, raw bytes, deliverable bytes, a 12-hex sha256 prefix of the prompt and its length, and `reason`: one of a fixed set of codes (`ok`, `not_json`, `bad_stop_reason`, `empty_text`, `no_terminal_event`, `bad_status`, `api_error_in_result`, `total_errors`, `contract_unmet`, `exit_nonzero`, `timeout`, `killed`, `disabled`, `lanes_json_malformed`, ...). Never the prompt text, never a provider-supplied value, never free text: a value the log does not recognise is written as `unknown`. The human-readable detail, which may quote the provider, goes to your terminal only (and nowhere with `--quiet`). "This lane is flaky" becomes a query instead of an argument.

## The prompt travels in argv

That is each vendor's documented headless shape (`-p`, `exec`). Two consequences: argv is visible to other processes on the machine, so a prompt is never the place for a key; and argv is bounded by the OS (`ARG_MAX`), so a very large brief should be referenced by path inside the prompt rather than pasted whole.

## lanes.json fails closed

Absent: every lane enabled. Present but malformed or unreadable: every lane refused (exit 13) until it is fixed. A half-written config never re-enables a lane the installer disabled.

## A killed lane is not a deliverable

A lane that dies by signal has no honest exit status. Whatever it printed first is discarded; the run reports `killed` with exit 10.

## Interrupting cli-run kills the lane too

Ctrl-C or a `kill` on the wrapper kills the lane's whole process group before the wrapper exits (130 for SIGINT, 143 for SIGTERM). A second signal during cleanup kills again and exits at once. Handlers are installed per run and removed when it finishes, so `--doctor --run` does not accumulate them. Uncatchable SIGKILL to the wrapper leaves the lane running; that is the operating system, not a promise this tool can make. Under systemd, `KillMode=control-group` covers that case.

## Output is decoded as a UTF-8 stream

Vendor output is decoded with a streaming decoder, so a multibyte character split across two chunks is preserved byte for byte. The 16 MiB cap and the `raw_bytes` field count bytes, not characters.

## Timeouts kill the whole process group

The lane is started detached, as the leader of its own process group. On timeout, or when output overruns the buffer, the group is killed, so a tool the agent shelled out to cannot keep writing after the wrapper reported 12. A child that calls `setsid()` itself escapes this boundary; nothing user-space can promise more without a cgroup, which is what the level 3 systemd unit adds.

## Lane choice is not automated

`cli-run` runs the lane it is given. Which lane fits the job is `ROUTING.md` and `DELEGATION_MATRIX.md`, or a question to the human.
