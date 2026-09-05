# model-orchestrator

**A model orchestrator you can `npm run`.** Route every task to the cheapest AI that does it well, whether you have one chat app, five agent CLIs, or a virtual machine running them unattended. One installer asks what you have access to and writes only what fits.

Built from a working system, not a diagram: the routing rules, the protocols and the lane runner here run in production, generalized so they transfer to any stack.

```bash
npx github:aunysillyme/model-orchestrator#v0.1.1
```

That runs the reviewed release straight from GitHub (drop `#v0.1.1` for the current main). `npx model-orchestrator` will work once the package is on the npm registry; until then it is not a command you can run.

The installer asks a few things, then writes a folder:

1. **Which level?** 1 beginner · 2 intermediate · 3 advanced
2. **Which AIs do you have access to?** (it marks the ones already on your PATH)
3. **Which one is your primary agent?** (the one that runs the system)

It never writes a secret, never runs a vendor shell script for you, and never overwrites a file you already have unless you pass `--force`. Docs and protocols go to `--dir` (default `./ai-orchestrator`); subagent definitions go to the project root your agent runs from (`--project`, default the current directory), because that is the only place Claude Code and Antigravity read them. It ends with an activation summary: what to copy where, which sign-ins, and one smoke command. Uninstall: delete the folder, the subagent folder it named, and `~/.ai-orchestrator/cli-run.log.jsonl` if you used `cli-run`.

## The three levels

| Level | You have | You get |
|---|---|---|
| **1 · Beginner** | one LLM or one agent | tiers, task classification, the two build checkpoints, the protocols (build, propagate, gap analysis, deep research, numbers and logic, memory and record), a task-bundle template, and your agent set up to follow them |
| **2 · Intermediate** | several AIs with CLIs | everything above, plus `cli-run` (exit 0 means a structurally accepted non-empty response; opt-in `--expect-file` / `--expect-json` for real contracts), a delegation matrix generated from your selection, research triage across the lanes you have |
| **3 · Advanced** | a virtual machine | everything above, plus a gateway config rendered from the API keys you hold (asked separately from your CLIs), pinned images, box rules, privacy gates, and a weekly gap-analysis job with "what watches it" written down |

Read the thinking behind each level in [docs/](docs/README.md): [Part 1](docs/part-1-beginner.md) · [Part 2](docs/part-2-intermediate.md) · [Part 3](docs/part-3-advanced.md).

## The AIs it knows about

| Id | What | Level |
|---|---|---|
| `claude-code` | Claude Code CLI, the default orchestrator | 1+ |
| `codex` | Codex CLI on a ChatGPT plan: second coder, adversarial auditor | 1+ |
| `agy` | Antigravity CLI on a Google AI plan: research sweeps, concurrent fan-out | 1+ |
| `grok` | Grok CLI on X Premium: live X and web reads at $0 | 1+ |
| `hermes` | Hermes Agent: the free tier | 2+ |
| `qwen` | Qwen Code CLI with a cheap metered model: structured bulk | 2+ |
| `ollama` | local models: the privacy lane | 2+ |
| `claude-app`, `chatgpt-app`, `gemini-app` | chat apps with no CLI: level 1 via a paste block | 1 |

`npx github:aunysillyme/model-orchestrator#v0.1.1 --list` prints the catalog with install and sign-in notes. Details: [docs/catalog.md](docs/catalog.md).

## Companion tools (both optional)

An orchestrator routes work. It does not make a model stop guessing numbers, and it does not give it a memory. Two tools from the same maintainer close those gaps. The installer asks about each one separately; selecting one writes a doc and config snippets, it installs nothing. `--tools codecalc,obsidian-tc` or `--no-tools` for scripted runs; `--yes` alone selects only the recommended one.

| Tool | Closes | Default | You need first |
|---|---|---|---|
| [codecalc](https://github.com/The-40-Thieves/codecalc) | guessed numbers, comparisons, complexity and equivalence claims: exact arithmetic, code execution in 31 languages, SMT logic checks, `verify_translation` / `verify_optimization`; offline, no key | yes | Python 3.10+ and `uv`. `uvx 'codecalc[full]' setup --write` registers it with Claude Code, Claude Desktop, Cursor, VS Code, Zed; snippets for Codex, Antigravity, Qwen Code are written for you |
| [obsidian-tc](https://github.com/The-40-Thieves/obsidian-tc) | no durable memory: hybrid search, backlinks, compare-and-swap writes with a confirmation gate, folder ACLs, a poison scan on inferred writes; 163 tools, local by default; AGPL-3.0 | no | an Obsidian vault folder; Node 24+ or Bun 1.1+ (stricter than this installer); Ollama with `nomic-embed-text` or a cloud embeddings key; the Obsidian app and its Local REST API plugin only for live bridge tools. Skip it if you do not keep notes in Obsidian |

Whether or not you select them, every level carries the two rules they serve: `protocols/numbers-and-logic.md` (when calling a calculator is mandatory, how to report a computed figure, why a thought log is not evidence) and `protocols/memory-and-record.md` (search before writing, the folder index is part of the change, one writer, inferred content marked as inferred).

## Non-interactive

```bash
npx github:aunysillyme/model-orchestrator#v0.1.1 --yes --level 2 --ais claude-code,codex,grok --primary claude-code --dir ./ai-orchestrator
npx github:aunysillyme/model-orchestrator#v0.1.1 --yes --level 3 --ais claude-code,codex,agy,grok,hermes,qwen,ollama --apis anthropic,openrouter --dry   # print the plan, write nothing
npx github:aunysillyme/model-orchestrator#v0.1.1 --yes --level 2 --ais claude-code,codex --project ~/my-app --dir ~/my-app/ai-orchestrator  # subagents into ~/my-app/.claude/agents
```

## What gets written (level 3, everything)

```
ai-orchestrator/
  README.md                 start here, written for your level and your AIs
  ORCHESTRATOR.md           single-agent routing rules (level 1)
  TASK_BUNDLE.md            the brief every delegation carries
  protocols/                build-protocol · propagate · gap-analysis · deep-research · numbers-and-logic · memory-and-record
  CODECALC.md  OBSIDIAN-TC.md  mcp/   companion-tool install docs + per-agent registration snippets (if selected)
  <project>/.claude/agents/ five subagents, one per tier, at the PROJECT root (if Claude Code is primary)
  CLAUDE.snippet.md         the block to paste into your CLAUDE.md
  ROUTING.md                multi-lane decision tree (level 2+)
  TIERS.md  DELEGATION_MATRIX.md  RESEARCH_TRIAGE.md  CLI-RUN.md
  bin/cli-run.mjs  bin/lanes.json          (node bin/cli-run.mjs --doctor is the smoke test)
  vm/                       gateway config, compose, box rules, privacy gates, jobs/ (level 3)
```

## Repo layout

| Folder | What |
|---|---|
| [`bin/`](bin/README.md) | `cli.js` (the installer) and `cli-run.mjs` (the lane runner) |
| [`src/`](src/README.md) | the catalog, the pure planner, detection, rendering |
| [`templates/`](templates/README.md) | everything the installer can write, by level, plus `tools/` for companions |
| [`docs/`](docs/README.md) | the three parts and the catalog |
| [`test/`](test/README.md) | `npm test`: judges proven to go red, catalog integrity, planner, end-to-end install in a temp dir; `.github/workflows/test.yml` runs it on Ubuntu and macOS, Node 18/20/22 |

## What is enforced, what is delegated, what is an instruction

Most of what this package ships is text an agent is asked to follow. Be clear about which is which before relying on it unattended.

| Property | How it holds |
|---|---|
| Installer writes only inside `--dir` and `--project`, never a secret, never over your files without `--force` | **enforced by code** (preflight, exclusive create, rollback; tested) |
| `cli-run` exit codes, process-group kill on timeout, fixed-code durable log, `--expect-*` contracts | **enforced by code** (tested with stub lanes) |
| Codex audit lane runs read-only | **delegated to the vendor flag** (`--audit` → `--sandbox read-only`); commands and network still follow your codex config |
| Other lanes' permissions, sign-in state, model versions | **delegated to each vendor's own config**; `--doctor` checks presence, not versions |
| Gateway binds to loopback, keys by name only | **enforced in the generated files**; whether the gateway authenticates is your environment |
| Lane selection, tiers, privacy classes, one-writer, escalation, the protocols | **agent instructions**. Nothing here stops an agent that ignores its rules; the task bundle and the protocols make ignoring them visible, not impossible |
| Weekly audit bounded, previous report preserved | **enforced in the generated script and unit** (watchdog, temp-and-rename, `TimeoutStartSec`) |

If you need a property in the third row to be enforced, that is a router, a policy engine or a sandbox, and this package does not claim to be one.

## Principles the whole thing rests on

1. **Route by capability tier, not model name.** Default down, escalate on evidence.
2. **A gate you cannot fail is not a gate.** Every checkpoint is a question that can come back wrong.
3. **Exit 0 is not a deliverable.** Check for the artifact, not the status line. `cli-run` checks the response is structurally there; `--expect-file` checks the artifact.
6. **Numbers are computed, never guessed.** A tool that calculates beats a model that feels finished.
7. **A write nobody can find again did not happen.** Search first, keep the index true, one writer.
4. **The orchestrator owns the main build.** Delegates hold none of your rules; they get bounded sub-parts and a brief.
5. **Only one process holds keys.** Names in the environment, values in a secrets manager, never in a file here.

## Requirements

Node 18 or newer. No dependencies. Works on macOS and Linux; the level 3 box templates assume Ubuntu.

## Contributing

Add an AI to `src/catalog.js` and every prompt, table, config and doc picks it up. Run `npm test`. Keep templates free of logic and free of anything that looks like a credential.

## License

[MIT](LICENSE)
