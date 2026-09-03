# model-orchestrator

**A model orchestrator you can `npm run`.** Route every task to the cheapest AI that does it well, whether you have one chat app, five agent CLIs, or a virtual machine running them unattended. One installer asks what you have access to and writes only what fits.

Built from a working system, not a diagram: the routing rules, the protocols and the lane runner here run in production, generalized so they transfer to any stack.

```bash
npx model-orchestrator
```

The installer asks three things, then writes a folder:

1. **Which level?** 1 beginner · 2 intermediate · 3 advanced
2. **Which AIs do you have access to?** (it marks the ones already on your PATH)
3. **Which one is your primary agent?** (the one that runs the system)

It never writes a secret, never runs a vendor shell script for you, and never overwrites a file you already have unless you pass `--force`. Delete the folder to uninstall.

## The three levels

| Level | You have | You get |
|---|---|---|
| **1 · Beginner** | one LLM or one agent | tiers, task classification, the two build checkpoints, five protocols (build, propagate, gap analysis, deep research, numbers and logic), a task-bundle template, and your agent set up to follow them |
| **2 · Intermediate** | several AIs with CLIs | everything above, plus `cli-run` (exit 0 means the deliverable exists), a delegation matrix generated from your selection, three-engine research triage |
| **3 · Advanced** | a virtual machine | everything above, plus a gateway config where only one process holds keys, a compose file, box rules, privacy gates, and a weekly gap-analysis job with "what watches it" written down |

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

`npx model-orchestrator --list` prints the catalog with install and sign-in notes. Details: [docs/catalog.md](docs/catalog.md).

## Companion tool: codecalc

An orchestrator routes work; it does not make a model stop guessing numbers. [codecalc](https://github.com/The-40-Thieves/codecalc) does: an offline, self-hosted MCP server that gives any agent exact arithmetic, code execution in 31 languages, SMT logic checks, complexity measurement, and two proofs (`verify_translation`, `verify_optimization`). The installer asks whether to set it up (default yes, `--tools codecalc` or `--no-tools`), writes `CODECALC.md` with the one-command install (`uvx 'codecalc[full]' setup --write` registers it with Claude Code, Claude Desktop, Cursor, VS Code and Zed) plus config snippets for Codex, Antigravity and Qwen Code, and every level carries `protocols/numbers-and-logic.md`: when calling is mandatory, how to report a computed figure, and why a thought log is not evidence.

## Run it straight from GitHub

Until the package is on the npm registry (or if you want the current main branch):

```bash
npx github:aunysillyme/model-orchestrator
```

## Non-interactive

```bash
npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok --primary claude-code --dir ./ai-orchestrator
npx model-orchestrator --yes --level 3 --ais claude-code,codex,agy,grok,hermes,qwen,ollama --dry   # print the plan, write nothing
```

## What gets written (level 3, everything)

```
ai-orchestrator/
  README.md                 start here, written for your level and your AIs
  ORCHESTRATOR.md           single-agent routing rules (level 1)
  TASK_BUNDLE.md            the brief every delegation carries
  protocols/                build-protocol · propagate · gap-analysis · deep-research · numbers-and-logic
  CODECALC.md  mcp/         codecalc install + per-agent registration snippets (if selected)
  .claude/agents/           five subagents, one per tier (if Claude Code is primary)
  CLAUDE.snippet.md         the block to paste into your CLAUDE.md
  ROUTING.md                multi-lane decision tree (level 2+)
  TIERS.md  DELEGATION_MATRIX.md  RESEARCH_TRIAGE.md  CLI-RUN.md
  bin/cli-run.js  bin/lanes.json
  vm/                       gateway config, compose, box rules, privacy gates, jobs/ (level 3)
```

## Repo layout

| Folder | What |
|---|---|
| [`bin/`](bin/README.md) | `cli.js` (the installer) and `cli-run.js` (the lane runner) |
| [`src/`](src/README.md) | the catalog, the pure planner, detection, rendering |
| [`templates/`](templates/README.md) | everything the installer can write, by level, plus `tools/` for companions |
| [`docs/`](docs/README.md) | the three parts and the catalog |
| [`test/`](test/README.md) | `npm test`: judges proven to go red, catalog integrity, planner, end-to-end install in a temp dir; `.github/workflows/test.yml` runs it on Ubuntu and macOS, Node 18/20/22 |

## Principles the whole thing rests on

1. **Route by capability tier, not model name.** Default down, escalate on evidence.
2. **A gate you cannot fail is not a gate.** Every checkpoint is a question that can come back wrong.
3. **Exit 0 is not a deliverable.** Check for the artifact, not the status line.
6. **Numbers are computed, never guessed.** A tool that calculates beats a model that feels finished.
4. **The orchestrator owns the main build.** Delegates hold none of your rules; they get bounded sub-parts and a brief.
5. **Only one process holds keys.** Names in the environment, values in a secrets manager, never in a file here.

## Requirements

Node 18 or newer. No dependencies. Works on macOS and Linux; the level 3 box templates assume Ubuntu.

## Contributing

Add an AI to `src/catalog.js` and every prompt, table, config and doc picks it up. Run `npm test`. Keep templates free of logic and free of anything that looks like a credential.

## License

[MIT](LICENSE)
