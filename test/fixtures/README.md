# Real vendor fixtures

Raw output captured from **actual vendor CLI runs**, not written by hand. Every other judge test in this repository uses synthetic shapes; these prove the judges against what the vendors really emit, at versions this repository records.

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

**qwen's success shape is still synthetic.** No `OPENROUTER_API_KEY` was available in the capture environment (checked by presence, never printed), so only its failure path is real. `claude` and `ollama` have no judge of their own and so have no fixture.

## Refreshing

These are keyed to a version. When a vendor upgrade changes a shape, capture again with the same prompt and argv, bump the filename to the new version, and update `manifest.json` and the compatibility table in the root README together.
