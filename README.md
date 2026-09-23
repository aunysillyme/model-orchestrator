# model-orchestrator

[![npm](https://img.shields.io/npm/v/model-orchestrator.svg)](https://www.npmjs.com/package/model-orchestrator) [![test](https://github.com/aunysillyme/model-orchestrator/actions/workflows/test.yml/badge.svg)](https://github.com/aunysillyme/model-orchestrator/actions/workflows/test.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

**A model orchestrator for AI coding agents: routing rules, subagents and a lane runner that tell your agent which model handles each task,** so small work goes to cheap tiers and fewer tokens go to frontier models. Answer a few questions and it writes the setup for exactly the AIs you have: Claude Code, Codex, Antigravity (Google), Grok, Qwen, Ollama.

**The problem:** one agent does every task on its biggest model, so renaming a file costs the same as designing a system.

**What you get:** rules your agent follows to keep planning on the frontier model and hand routine work to cheaper tiers and the other AIs you already pay for, plus a log that shows where the work went.

```bash
npx model-orchestrator
```

<img src="docs/demo.gif" alt="A terminal running npx model-orchestrator with --dry: it prints the level, the AIs detected, both target folders and all 38 files it would write, then says nothing was written." width="100%" />

A few questions, then it writes the setup for the AIs you picked. For Claude Code, Codex and Grok that is 38 files:

| Part | What it does for you |
|---|---|
| `ROUTING.md`, `TIERS.md`, `DELEGATION_MATRIX.md` | tell your agent which model or CLI handles each kind of task, and at what effort |
| `TASK_BUNDLE.md` and `protocols/` | the brief every hand-off carries, plus build, research, audit and record-keeping steps |
| 8 subagents in `.claude/agents/` | builder, planner, reviewer, researcher, bulk worker, reader and two verifiers, each with its own tools |
| 3 hooks in `.claude/hooks/` | put the routing table in front of your agent on every prompt and every subagent start, and log where work went |
| `bin/cli-run.mjs` | calls Codex, Grok and the other CLIs, and counts a run as done only when it returns a result |
| `mcp/` and `CODECALC.md` | ready-to-paste configs for the companion tools you chose |

Preview it in any folder, nothing is written:

```bash
npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok --primary claude-code --dir ./ai-orchestrator --project . --dry
```

Every file, folder by folder: [docs/install.md](docs/install.md#what-gets-written-level-3-everything).

The recording above comes from the published package under `asciinema`, rendered with `agg`: `bash scripts/record-demo.sh`.

- **What it is:** routing rules, subagent definitions and a CLI lane runner (`cli-run`) for the AI tools you already pay for.
- **Where it sits:** above the request layer. Your agent reads the rules and picks the lane, so the decision stays somewhere you can read, version and edit. Request-level routers and gateways sit underneath it.
- **Use it when:** you run more than one model or agent and want the expensive tier kept for planning and judgment.
- **For agents:** [`llms.txt`](llms.txt) summarizes the package and links every doc; [`AGENTS.md`](AGENTS.md) has the headless commands.

## After you install

For the Claude Code setup above, follow the activation summary from the project folder:

1. **Rules:** copy the block in `ai-orchestrator/CLAUDE.snippet.md` into `CLAUDE.md` (create it if missing).
2. **Hooks:** merge `ai-orchestrator/settings.hooks.snippet.json` into `.claude/settings.json` (create it if missing).
3. **Smoke test:** run `node ./ai-orchestrator/bin/cli-run.mjs --doctor` to check the enabled lanes. Add `--run` to send each lane one tiny prompt.

Run `claude` from the project folder to load the subagents. Follow the sign-in and companion-tool steps printed for your selection; the same steps are saved in `ai-orchestrator/README.md`.

A real call through the lane runner, captured from a fresh install on 2026-09-23 (Codex CLI 0.154.0). Your agent sends a small read to Codex at low effort, and `cli-run` prints one status line with the route it used:

```text
$ node ai-orchestrator/bin/cli-run.mjs codex "In one sentence, what is ai-orchestrator/ROUTING.md for?" --effort low
cli-run[codex] ok rc=0 class=ok refused=null 18.9s raw=20418B route=lane default/low :: turn.completed
```

Each call also appends one line to `~/.ai-orchestrator/cli-run.log.jsonl` with the lane, the model and effort requested and resolved, the verdict, the exit code, the seconds and the deliverable size, so you can see where the work went. A run that produces no deliverable exits non-zero: on the same install, `--expect-file summary.md` for a file the lane never wrote printed `no_deliverable rc=10 class=empty` and a fix line.

## Part of a set

Three open-source tools that work on their own and fit together:

| Repo | What it gives you |
|---|---|
| [agent-personalizer](https://github.com/aunysillyme/agent-personalizer) | One interview writes the profile and rules every AI you use reads, kept in sync from one source. |
| **model-orchestrator** | Routing rules that tell your agent which model handles each task, so frontier models do the hard work and cheaper tiers do the rest. |
| [website-build-skill](https://github.com/aunysillyme/website-build-skill) | A skill pack that teaches your AI current website-building expertise: research, design, code, accessibility, performance, search and security. |

## The three levels


| Level | You have | You get |
|---|---|---|
| **1 · Beginner** | one LLM or one agent | tiers, task classification, the two build checkpoints, the protocols (build, propagate, gap analysis, deep research, numbers and logic, memory and record, docs and proof), a task-bundle template, and your agent set up to follow them |
| **2 · Intermediate** | several AIs with CLIs | everything above, plus `cli-run` (exit 0 means a structurally accepted non-empty response; opt-in `--expect-file` / `--expect-json` for real contracts; `--model` / `--effort` to pin the route and log it), a delegation matrix generated from your selection, research triage across the lanes you have |
| **3 · Advanced** | a virtual machine | everything above, plus a gateway config rendered from the API keys you hold (asked separately from your CLIs), pinned images, box rules, privacy gates, and a weekly gap-analysis job with "what watches it" written down |

Levels explained: [Part 1](docs/part-1-beginner.md) · [Part 2](docs/part-2-intermediate.md) · [Part 3](docs/part-3-advanced.md).

## The AIs it knows about

| Id | What | Level |
|---|---|---|
| `claude-code` | Claude Code CLI, the default orchestrator | 1+ |
| `codex` | Codex CLI on a ChatGPT plan: second coder and second-opinion reviewer (a different model family reading your diff) | 1+ |
| `agy` | Antigravity CLI on a Google AI plan: research sweeps, concurrent fan-out | 1+ |
| `grok` | Grok CLI on X Premium: live X and web reads at $0 | 1+ |
| `hermes` | Hermes Agent: the free tier | 2+ |
| `qwen` | Qwen Code CLI with a cheap metered model: structured bulk | 2+ |
| `ollama` | local models: the privacy lane | 2+ |
| `claude-app`, `chatgpt-app`, `gemini-app` | chat apps: level 1 via a paste block | 1 |

`npx model-orchestrator --list` prints the catalog with install and sign-in notes. Details: [docs/catalog.md](docs/catalog.md).

## Measuring routing

See where your agent sends the work. On a claude-code install, `route-metrics.mjs` turns every turn, dispatch and subagent start/stop into one JSON line under `~/.ai-orchestrator/route-metrics.jsonl`, including the lane your agent named in its own `<!-- route: <lane> | <why> -->` marker.

```bash
node .claude/hooks/route-metrics.mjs --summary                        # since the log began
node .claude/hooks/route-metrics.mjs --summary --since 2026-09-01     # since a date
```

The report prints turns, **route-marker coverage** (the share of turns that carried a real lane, which answers "is the agent actually tagging its routing decisions?"), **work sent off the main session**, lanes by count, dispatches by `subagent_type`, and mean/max duration per agent type. The log holds exactly five things: a timestamp, the event, the session id, the lane name and the agent type. Every turn keeps running whatever the hook does, so the worst case is a quieter report.

## Claude Code plugin

The hooks and subagents also ship as a plugin, so they install and update through Claude Code itself:

```
/plugin marketplace add aunysillyme/model-orchestrator
/plugin install model-orchestrator@model-orchestrator
```

It ships the two read-only hooks (`route-gate`, `subagent-context`) and the eight subagents, each with an explicit tool list, and loads them namespaced as `model-orchestrator:builder`. The routing rules come from `npx model-orchestrator`, which is the step that reads your setup and writes rules to match it. `plugin/` is generated from `templates/`, and `test/plugin.test.js` holds the bundle to that shape: committed output matches the generator, hooks stay read-only, every agent keeps its tool list. The third hook, `route-metrics`, writes a log, so it comes only with the npm install. Details: [plugin/README.md](plugin/README.md).

## Companion tools (all optional)

An orchestrator routes work. Three companion tools cover the rest of what a working agent needs, exact numbers, a memory, and current library docs:

| Tool | What it gives you | Set up |
|---|---|---|
| [codecalc](https://github.com/The-40-Thieves/codecalc) | exact arithmetic, code execution in 31 languages and logic checks, running offline | by default |
| [obsidian-tc](https://github.com/The-40-Thieves/obsidian-tc) | durable memory with hybrid search, backlinks and compare-and-swap writes; local by default | when you pick it |
| [Context7](https://github.com/upstash/context7) | current, version-specific library docs pulled into the prompt | when you pick it |

Selecting one writes a doc and the config snippets for your agents, so the install stays yours to run. What each needs first, and how Context7 and codecalc pair up (docs say what an API should do, a run proves what it does): [docs/companions.md](docs/companions.md). Every level carries the three rules they serve either way: `protocols/numbers-and-logic.md`, `protocols/memory-and-record.md` and `protocols/docs-then-prove.md`.

## Principles the whole thing rests on

1. **Route by capability tier.** Start at the smallest tier that fits, and let evidence move it up.
2. **Every gate can come back wrong.** A checkpoint earns its place by being answerable both ways.
3. **Check for the artifact.** A deliverable is a file, a commit or a line you can point at. `cli-run` checks the response is structurally there; `--expect-file` checks the artifact.
4. **Numbers are computed.** A tool that calculates beats a model that feels finished.
5. **A write stays findable.** Search first, keep the index true, one writer.
6. **A delegate's brief carries this task's scope, whatever it already holds.** A Claude Code subagent loads the project's CLAUDE.md hierarchy at start, so it already has the standing rules; a second CLI or a fresh chat window may hold none of them. Either way, the brief is what carries this task. On claude-code, that changes who executes: see "Who builds" in `ROUTING.md`.
7. **Only one process holds keys.** Names in the environment, values in a secrets manager.

## Common questions

### How do I cut token usage across Claude Code, Codex and Antigravity (Google)?

Install for the tools you have, then let the generated `ROUTING.md` decide the tier per task: bulk, reading and verification go to the fast tier or a cheaper CLI lane, and the deep tier only plans and judges. On Claude Code, execution goes to the `builder` subagent by default and the main session plans and verifies. Every lane call through `cli-run` logs the model and effort it ran with, so you can check where the tokens went.

### How do I route tasks to cheaper models?

The rules route by role, complexity and stakes (see [Routing by role, complexity and stakes](docs/how-it-routes.md#routing-by-role-complexity-and-stakes)). Role picks the agent, complexity moves the effort, stakes move the tier. A task a cheap tier finishes correctly stays on the cheap tier, and the frontier tokens go to the work that earns them.

### Where does this sit next to an LLM router or an AI gateway?

One layer up, and they compose. This routes at the task level, through instructions your agent follows and a runner for agent CLIs. Request-level routers and gateways (RouteLLM, LiteLLM, OpenRouter, claude-code-router) forward the model on every API call, and they sit underneath this happily: pick the lane here, let the gateway carry the call.

### How does an agent install and run it headlessly?

Use the CLI flags. `--yes` with `--level`, `--ais` and `--project` runs headless, `--dry-run` previews the plan, and `--list` prints every supported AI. Your own documents are kept unless you pass `--force`; activation snippets are ready to merge. `MANIFEST.json` and `bin/lanes.json` are rewritten each run. Runtime files upgrade when they match the recorded hash; edited copies are kept and named. See [re-running an install](docs/install.md#what-a-run-does) for `--update-docs` and `--upgrade-runtime`.


## Uninstall

Remove unedited files recorded by the installer; edited files stay and are listed.
Run `npx model-orchestrator --uninstall --dir ./ai-orchestrator --project .` (add `--dry` to preview).
Remove the pasted rules block and merged hooks entry by hand. [Removal details](docs/install.md#uninstall).

## Read next

| Doc | What is in it |
|---|---|
| [docs/install.md](docs/install.md) | every flag, the two folders a run writes to, headless examples, the full file list |
| [docs/how-it-routes.md](docs/how-it-routes.md) | role, complexity and stakes; the three verifier agents; pinning a lane's model and effort |
| [docs/guarantees.md](docs/guarantees.md) | what is enforced by code, what is delegated to a vendor flag, and what is only an instruction |
| [docs/part-1-beginner.md](docs/part-1-beginner.md) · [Part 2](docs/part-2-intermediate.md) · [Part 3](docs/part-3-advanced.md) | the thinking behind each level |
| [docs/catalog.md](docs/catalog.md) | every supported AI with install and sign-in notes |

<details>
<summary><strong>Platform support, and every test this suite skips</strong></summary>


Node 18 or newer, with zero runtime dependencies. Works on macOS and Linux; the level 3 box templates assume Ubuntu. Windows: CI runs the suite on `windows-latest` (Node 18, 20, 22), including lane execution end to end through `cli-run` against a fake CLI installed the same way npm installs a real one (a `.cmd` shim). `cli-run` never runs a lane through `cmd.exe` when it can avoid it: it resolves the shim to the Node script underneath and spawns Node directly, so a prompt reaching a real lane never passes through a Windows shell. A `.cmd` or `.bat` lane that cannot be resolved that way (an old or hand-edited shim) is refused with exit 13 and a message saying how to fix it, rather than run through `cmd.exe`: a batch file re-reads its arguments after `cmd.exe` has parsed them once, and no escaping fully contains a prompt through both passes. Install, detection, the hooks and `cli-run`'s `taskkill` tree kill are tested on Windows too, including SIGTERM/SIGINT to the wrapper (Windows has no OS-level signals: both terminate it unconditionally, verified there rather than treated the same as POSIX). The Windows skip list covers POSIX behavior, with each skip pinned by `test/prose.test.js`: `statSync().mode`'s executable bit (NTFS has none, so that one assertion is conditional inside a test that otherwise runs everywhere); a lane dying mid-run from a real POSIX signal (a real Windows lane cannot die "by signal"); running `weekly-audit.sh`'s watchdog functions for real under Git Bash's job control, both the end-to-end run and the `bounded()` timeout check (the script itself only ever runs on the Ubuntu box it targets); and a `mkfifo` FIFO at the rules path, the one case that proves `route-gate.mjs` cannot HANG on a non-regular file, since Windows has no `mkfifo` to build one (the guard behind it is covered on every OS by a directory at the same path); and an untracked `mkfifo` FIFO in the repository `cli-run --audit` sizes, the case that proves `--effort auto` never opens a non-regular file (the symlink half of that test runs on every OS). `test/prose.test.js` counts every `skip:` in the suite and requires this list to document each one.

**Privacy.** The installer sends no telemetry and makes no network call of its own once it is running. Two things around that are worth being exact about:

- `npx model-orchestrator` is itself a download: npm fetches this package from the registry before any of it runs. `npm install -g model-orchestrator` once, then run `model-orchestrator`, if you would rather that happen exactly one time.
- For a missing vendor CLI, the installer prints the install command. An interactive run offers to run one pinned `npm install -g` per package with your confirmation; `--yes` and `--no-install` keep installation in your hands. Vendor shell installers (Antigravity, Grok) are only ever printed, alongside the `curl … | less` you would use to read one before running it.

`cli-run` calls the vendor CLI you name.


</details>

<details>
<summary><strong>Vendor version compatibility</strong></summary>


**Detection checks whether a binary is present.** Use the compatibility table below to compare vendor versions. `--doctor` reports presence; add `--run` to send every enabled lane a small canary and check its sign-in and output against the runner's success criteria.

The lane wiring and the output judges were written against these versions, which are the ones this release was exercised on:

<!-- vendor-table:start -->

| Lane | Vendor | Version this release was built against | Where that number is proved |
|---|---|---|---|
| `claude` | Anthropic | 2.1.226 | the npm pin the installer writes, `@anthropic-ai/claude-code@2.1.226` |
| `codex` | OpenAI | 0.153.4 | `test/fixtures/codex-0.153.4.jsonl`, a recorded run |
| `agy` | Google | 1.1.27 | `test/fixtures/agy-1.1.27.jsonl`, a recorded run |
| `grok` | xAI | 1.0.5 | `test/fixtures/grok-1.0.5.json`, a recorded run |
| `hermes` | Nous Research | 0.20.0 | `test/fixtures/hermes-0.20.0.txt`, a recorded run |
| `qwen` | Alibaba | 0.22.3 | `test/fixtures/qwen-0.22.3-nokey.json`, a recorded run |
| `ollama` | Ollama | 0.33.3 | the pinned image the level 3 box runs, `ollama/ollama:0.33.3` |

Generated from `src/catalog.js` by `npm run gen:catalog`; `npm test` fails if this table and the catalog disagree. Fixtures were captured 2026-09-06.

<!-- vendor-table:end -->

For npm-installed lanes, `builtAgainst` in the catalog supplies both the compatibility table and the install pin. Newer vendor versions may work or may change a flag the generated wiring uses. When a lane starts failing after a vendor upgrade, compare against this table first.

**The live canary runs on your machine, with your credentials.** That is what `node bin/cli-run.mjs --doctor --run` is: it sends every enabled lane one tiny prompt through your own sign-ins and reports `canary ok` or `canary FAILED rc=` per lane. Run it after install, and again after any vendor upgrade.

CI runs the full suite against stub lanes on Ubuntu, macOS and Windows, Node 18/20/22, plus a packaged install into a clean consumer. Run the live check locally to verify your own sign-ins, quota and vendor versions.


</details>

## Contributing

Contributions are welcome:

- **New AIs:** add an entry to `src/catalog.js`; prompts, tables, configs and docs use the catalog.
- **Vendor updates:** contribute a lane fixture captured from a newer vendor version and the test that checks it.
- **Docs:** fix an unclear instruction or add a reproducible example.

Run `npm test` with your change. Keep templates free of logic and credential values. See [CONTRIBUTING.md](CONTRIBUTING.md), [RELEASING.md](RELEASING.md) and [SECURITY.md](SECURITY.md).

## Credits

- [@shawnwows](https://x.com/shawnwows) reviewed the router and made the case for separating role, complexity and stakes instead of compressing them into one scale, for recording the model and effort a lane was actually asked for, and for verifying findings before they trigger repairs. All three shipped in 0.1.14.

## License

[MIT](LICENSE)
