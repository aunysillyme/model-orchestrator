# Vendor fixtures

The original five fixtures contain raw output captured from actual vendor CLI runs. Claude has a synthetic success fixture from official documentation and a captured authentication failure, both labeled separately in the manifest. Synthetic fixtures establish only the shapes they exercise.

Requested by [#11](https://github.com/aunysillyme/model-orchestrator/issues/11): *"Add versioned, sanitized fixtures captured from actual supported vendor versions... Record how fixtures were obtained and what flags/schema they cover."*

## How they were obtained

Captured 2026-09-06 on macOS (Darwin 25.6.0, Node 22.22.3) by running each lane's real binary with **the exact argv `buildArgv()` builds**, and redirecting stdout to a file. One prompt for every lane:

```
Reply with exactly the word OK and nothing else. Task bundle: none (one-line lookup, read-only, no artifact)
```

`manifest.json` records, per fixture: the lane, the vendor version string as the CLI itself reported it, the flags used, the exit code, and what the fixture is there to prove.

## Sanitization

Two substitutions, and nothing else. The output is otherwise byte-for-byte what the vendor produced:

- Every UUID → `00000000-0000-0000-0000-000000000000`. These were session, conversation and request ids.
- `/Users/auny` → `/home/user`. Vendors echo the working directory.

No credential, key or token appears in any of these files; the lanes authenticate out of band and none of them echo their auth.

## What each one is worth

| Fixture | Vendor version | rc | Why it earns its place |
|---|---|---:|---|
| `grok-1.0.5.json` | grok 1.0.5 | 0 | The real object is much larger than the synthetic one: `thought`, `usage`, `modelUsage`, `total_cost_usd_ticks`. Proves the judge reads `text`/`stopReason` and ignores the rest. |
| `hermes-0.20.0.txt` | Hermes Agent v0.20.0 | 0 | Three bytes, `OK\n`. The plainest possible lane, and the one where a judge over-parsing would break. |
| `agy-1.1.27.jsonl` | agy 1.1.27 | 0 | Four events, the `result` event last. `response` is `"OK\n"` with a trailing newline, so the judge must not equality-check the text. The `init` event carries a ~1.5 KB tool list the judge has to skip. |
| `codex-0.153.4.jsonl` + `.out.txt` | codex-cli 0.153.4 | 0 | **The find.** Real codex emitted an `item.completed` whose item is `type:"error"` (a skills-budget warning) *before* `turn.completed`. A judge that treated any error item as failure would refuse a perfectly good run. The synthetic fixtures never contained one. |
| `qwen-0.22.3-nokey.json` | qwen 0.22.3 | 1 | A genuine vendor failure, not an invented one: `error_during_execution` with `is_error: true` because no `OPENROUTER_API_KEY` was set. Proves the judge refuses a real refusal. |

## Gap, stated rather than hidden

**qwen's success shape is still synthetic.** No `OPENROUTER_API_KEY` was available in the capture environment (checked by presence, never printed), so only its failure path is real. `claude-synthetic.json` is a minimal successful print-mode result based on [Anthropic headless documentation](https://code.claude.com/docs/en/headless) and [completion-state documentation](https://code.claude.com/docs/en/agent-sdk/agent-loop), read 2026-09-29. It was written by hand, has no captured vendor version, and does not belong to the 2026-09-06 capture. Claude failure shapes in judge and classifier tests are also synthetic. Ollama has no judge or fixture.

## Refreshing

These are keyed to a version. When a vendor upgrade changes a shape, capture again with the same prompt and argv, bump the filename to the new version, and update `manifest.json` and the compatibility table in the root README together.

## Claude canary on 2026-09-29

Exactly one no-tools prompt was run through the native lane in an empty temporary directory with Claude Code 2.1.285: `Reply OK without using tools.` Existing authentication was confirmed by the CLI status command, but was unavailable under the isolated canary configuration. The worker returned `subtype: "success"`, `is_error: true`, and `Not logged in`; the runner correctly exited 14. This verifies authentication-failure handling only, not live successful completion.

`claude-2.1.285-noauth.json` is the captured native stdout, reformatted as JSON with all UUIDs replaced by zero UUIDs. The manifest records the safety flags: tools, MCP, customizations, hooks and persistence were disabled. No software or authentication was changed, and no retry was made. The installer pin remains unchanged; this newer failure capture does not establish compatibility of a successful run at that pin.
