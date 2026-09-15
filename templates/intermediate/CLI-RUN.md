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
node bin/cli-run.mjs codex "<prompt>" --model gpt-6-astra --effort high
node bin/cli-run.mjs codex "<prompt>" --effort auto                 # medium or high, bounded heuristic
node bin/cli-run.mjs qwen [--safe-mode] "<prompt>"             # qwen-only flag
```

Put it on your PATH if you like: `ln -s "$PWD/bin/cli-run.mjs" ~/.local/bin/cli-run`.

## First run: `--doctor`

```bash
node bin/cli-run.mjs --doctor          # which lanes are enabled and which binaries are on PATH; runs nothing
node bin/cli-run.mjs --doctor --run    # also sends each enabled lane one tiny prompt and judges the reply (uses a little quota)
```

With zero enabled lanes, doctor reports inactive and exits 13. Use level 1 or select a supported CLI. Binary presence does not verify authentication or that your primary loaded its instructions.

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

| Code | Class | Meaning | What to do |
|---|---|---|---|
| 0 | `ok` | structurally accepted non-empty response, every `--expect-*` contract met | use it; if `refused=N` is above 0, read the problem line |
| 10 | `empty` | ran and delivered nothing, or a contract was unmet | rerun once, or use another lane |
| 11 | `no_output` | no output at all | rerun once; check the lane runs on its own |
| 12 | `timeout` | timed out; the lane and every descendant in its process group were killed | raise `--timeout` or split the brief |
| 13 | `unavailable` | binary missing, disabled in `lanes.json`, or `lanes.json` malformed | install or enable the lane |
| 14 | `auth` | the lane's own error says a credential is missing or it is not logged in | set the credential; retrying cannot help |
| 15 | `quota` | the lane's own error says usage limit, credits or rate limit | switch lanes or wait for the reset |
| 16 | `rejected` | the upstream rejected the request: an unknown model id, a malformed request | fix the id, flag or request it names |
| 17 | `refused` | no deliverable, and the lane reports tool calls a hook or deny rule blocked | adjust the rule, or give the lane the tool |
| 18 | `cut_short` | no trustworthy finish: a missing or non-success terminal event, a lane killed by a signal, output past the 16 MiB buffer, or a nonzero vendor exit nothing above explains (hermes' own exit 2, bad args or an empty response, stays `empty`) | rerun once, then read the lane's stderr |
| 130 / 143 | `interrupted` | cli-run itself received SIGINT / SIGTERM; the lane's process group was killed first, then the temp dir removed | |
| 2 | | usage error in cli-run itself | |

A nonzero vendor exit is never `ok`, even when parseable text came back; the vendor's own code is kept in the log as `cli_rc`, and the bounded head of its stderr is shown on your terminal.

## Why a run failed: the class

Exit 10 used to cover causes that need opposite responses. A missing API key is not a model fault, and retrying a spent quota cannot help. So every run lands in exactly one class, and on the terminal every failure (and every `ok` with refused calls) gets two more lines:

```
cli-run[qwen] exit_nonzero rc=14 class=auth refused=0 0.8s raw=212B route=lane default :: lane exited 1; subtype="error_during_execution": Missing API key ...
cli-run problem: cli-run[qwen] auth: Missing API key ...
cli-run fix: set the credential the message above names (its environment variable, or the lane's own login command), then rerun
```

A calling agent relays both lines and asks before fixing anything.

- **Signals come from each lane's authoritative error fields only.** codex: its own `error`, `turn.failed` and error-item events plus stderr. agy: the terminal result's status and error plus stderr. qwen: the terminal event's full error text (never the clipped display line) plus stderr. hermes: stderr on a nonzero exit, never its stdout. Never the model's prose, so an answer that explains what "rate limit" means is not a quota failure. grok and hermes have no native auth signal, and none is invented.
- **Precedence** when several are present: `auth`, `quota`, `rejected`, `refused`, `cut_short`, `empty`. A missing credential explains everything downstream of it.
- **`refused`** counts tool calls a hook or deny rule blocked: qwen's `permission_denials`, agy's deny-rule `TOOL_ERROR` steps, one per codex router `Rejected(` line on stderr, and grok's session transcript (`~/.grok/sessions/<cwd>/<sessionId>/updates.jsonl`: hook runs with `blocked`, and "Denied by permission policy"). grok's `sessionId` comes from lane output, so it must match `^[A-Za-z0-9-]{8,64}$`, the resolved path must stay inside the sessions root, every counted line must name that session, and the read stops at 5 MiB. `null` means the lane gave no readable signal (hermes always), which is an unknown, never 0.
- **Refused with a deliverable is still exit 0.** The deliverable exists; `refused=N` and the problem and fix lines say what was blocked.
- **Redacted.** The status, problem and stderr lines pass through one redaction pass before they are printed: JSON credential keys (escaped quotes, unterminated values and JSON escaped inside a string included), `Authorization:` values of any scheme, bearer values, URL query credentials, and the `sk-`, `xai-`, `ghp_` and `AIza` key prefixes. Redaction runs before any clipping, so a long token is never cut into an unrecognisable fragment. Denial text is searched in at most the first 256 KiB of stdout and of stderr, with bounded patterns, so hostile output cannot stall the wrapper after the lane has exited. None of these lines is ever logged.

## The route: which model, and how hard it thinks

A lane you do not pin runs on **its own config file**, which this tool cannot see. That is the quiet failure this section exists for: a CLI configured months ago at `reasoning_effort = "low"` keeps auditing at low effort while your routing docs describe a second-opinion pass, and nothing anywhere says so.

Pin it per call, or per lane:

```bash
node bin/cli-run.mjs codex "<prompt>" --model gpt-6-astra --effort high   # this call only
node bin/cli-run.mjs --doctor                                            # prints what each lane is pinned to
```

```json
{
  "enabled": ["codex", "grok"],
  "defaults": { "codex": { "model": "gpt-6-astra", "effort": "high" } }
}
```

A flag beats `defaults`; `defaults` beats nothing. Each vendor spells these differently and `cli-run` translates:

| Lane | Model | Reasoning effort |
|---|---|---|
| grok | `-m` | `--reasoning-effort` |
| codex | `-m` | `-c model_reasoning_effort="LEVEL"` |
| agy | `--model` | `--effort` (low, medium, high) |
| hermes | `-m` | `--reasoning` (none, minimal, ...) |
| qwen | `-m` | none: this lane has no reasoning flag |

Three rules that keep this honest:

- **A level `cli-run` does not recognise is not rejected here.** Levels are the vendor's, they change, and guessing the valid set would date this tool. An unknown level is refused by the lane and surfaces as a class (codex reports it as `rejected`, exit 16; a lane with no rejection signal as `cut_short`, exit 18), with the lane's own exit code in the log as `cli_rc` and its stderr on your terminal.
- **`--effort` on qwen is a usage error, not a silent drop.** A flag that vanishes leaves you believing a route that never ran.
- **`--effort auto` is bounded.** It uses prompt size, or an audit's changed-file evidence, and resolves only medium or high. An audit is always high. Auto is a heuristic, not a measurement: name `xhigh` explicitly for security-critical or irreversible work.
- **Values are charset-bounded** (letters, digits, and `. _ : @ / + -`, no leading dash, 64 characters). A model id becomes an argv element and, on codex, part of a TOML value; bounding it is what stops either from being escaped.

## Permissions are a separate layer

`cli-run` never injects permission flags. Each CLI carries its own config, so every caller gets the same behaviour. Use each vendor's deny-list as the base layer; allow-lists only hold if every binary is enumerable in advance.

## Log

`~/.ai-orchestrator/cli-run.log.jsonl`, one line per run: lane, verdict, `class` (one of the classes above), rc, the lane's own exit code (`cli_rc`), signal, `refused` (an integer, or `null` when the lane gives no signal), seconds, raw bytes, deliverable bytes, a 12-hex sha256 prefix of the prompt and its length, the route (`model_requested`, `effort_requested`, and `model_source` / `effort_source`, each one of `flag`, `lanes.json` or `lane_default`), auto-sizing evidence (`effort_resolved`, `effort_basis`, `effort_scope`), and `reason`: one of a fixed set of codes (`ok`, `not_json`, `bad_stop_reason`, `empty_text`, `no_terminal_event`, `bad_status`, `api_error_in_result`, `total_errors`, `contract_unmet`, `exit_nonzero`, `timeout`, `killed`, `disabled`, `lanes_json_malformed`, ...). `effort_basis` is exactly one of `explicit`, `prompt_chars`, `audit_floor`, or `none`. Never the prompt text, never a provider-supplied value, never free text: a value the log does not recognise is written as `unknown`. The human-readable detail, which may quote the provider, goes to your terminal only (and nowhere with `--quiet`). "This lane is flaky" becomes a query instead of an argument, and so does "we route audits at high effort".

The log records what was **requested**, on every record including a run refused before the lane started. It does not record an actual. Reporting is inconsistent: grok returns a `modelUsage` block naming a model, the other four lanes return nothing of the kind, so an `actual` field would be populated for one lane and empty for four. It would also be a provider-supplied string, and this log holds fixed codes and bounded caller-supplied values only. `model_source: "lane_default"` is the honest way to say this run inherited something invisible from here.

## The prompt travels in argv

That is each vendor's documented headless shape (`-p`, `exec`). Two consequences: argv is visible to other processes on the machine, so a prompt is never the place for a key; and argv is bounded by the OS (`ARG_MAX`), so a very large brief should be referenced by path inside the prompt rather than pasted whole.

## lanes.json refuses by default

Absent: every lane enabled, nothing pinned. Present but malformed or unreadable: every lane refused (exit 13) until it is fixed. A half-written config never re-enables a lane the installer disabled. `defaults` is optional and held to the same standard: a malformed entry, an unknown lane, an unknown key, a value outside the charset, or an effort pinned on a lane that has no reasoning flag all make the whole file refuse by default rather than being skipped quietly.

## A killed lane is not a deliverable

A lane that dies by signal has no honest exit status. Whatever it printed first is discarded; the run reports `killed`, class `cut_short`, exit 18.

## Interrupting cli-run kills the lane too

Ctrl-C or a `kill` on the wrapper kills the lane's whole process group before the wrapper exits (130 for SIGINT, 143 for SIGTERM). A second signal during cleanup kills again and exits at once. Handlers are installed per run and removed when it finishes, so `--doctor --run` does not accumulate them. Uncatchable SIGKILL to the wrapper leaves the lane running; that is the operating system, not a promise this tool can make. Under systemd, `KillMode=control-group` covers that case.

## Output is decoded as a UTF-8 stream

Vendor output is decoded with a streaming decoder, so a multibyte character split across two chunks is preserved byte for byte. The 16 MiB cap and the `raw_bytes` field count bytes, not characters.

## Timeouts kill the whole process group

The lane is started detached, as the leader of its own process group. On timeout, or when output overruns the buffer, the group is killed, so a tool the agent shelled out to cannot keep writing after the wrapper reported 12. A child that calls `setsid()` itself escapes this boundary; nothing user-space can promise more without a cgroup, which is what the level 3 systemd unit adds.

## Lane choice is not automated

`cli-run` runs the lane it is given. Which lane fits the job is `ROUTING.md` and `DELEGATION_MATRIX.md`, or a question to the human.
