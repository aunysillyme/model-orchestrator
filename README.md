# model-orchestrator

[![npm](https://img.shields.io/npm/v/model-orchestrator.svg)](https://www.npmjs.com/package/model-orchestrator) [![test](https://github.com/aunysillyme/model-orchestrator/actions/workflows/test.yml/badge.svg)](https://github.com/aunysillyme/model-orchestrator/actions/workflows/test.yml) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) [![node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](package.json)

**Route every task to the right model, agent or LLM, and spend fewer tokens.** A model orchestrator for AI coding agents and LLMs: Claude Code, Codex, Gemini, Grok, Qwen, Ollama. One installer asks what you have access to and writes routing rules, subagents and a CLI runner for exactly that setup, from one chat app to several agent CLIs or a virtual machine. Routing rules tell your agent which model, subagent or CLI to use for each task, so small work goes to cheap tiers and fewer tokens go to frontier models; the runner executes the lane it is given. On Claude Code it also delegates execution to subagents by default, with two hooks that inject the routing table every turn.

## At a glance

- **What it is:** routing rules, subagent definitions and a CLI lane runner (`cli-run`) for the AI tools you already pay for.
- **What it is not:** a proxy, a gateway or an API router. It does not automatically compare prices or select models; your agent follows the rules and chooses.
- **Install:** `npx model-orchestrator` (interactive), or headless from a script or an agent: `npx model-orchestrator --yes --level 2 --ais claude-code,codex --project . --dir ./ai-orchestrator`.
- **Use it when:** you run more than one model or agent and want each task sent to the smallest one that can do it well.
- **What it saves:** frontier-model tokens. Bulk work, reading and checks go to fast tiers; the expensive tier is kept for planning and judgment.
- **For agents:** [`llms.txt`](llms.txt) summarizes the package and links every doc; [`AGENTS.md`](AGENTS.md) has the headless commands.

Built from a working system, not a diagram: the routing rules, the protocols and the lane runner here run in production, generalized so they transfer to any stack.

```bash
npx model-orchestrator
```

That runs the latest published release from the npm registry, and `npx model-orchestrator --version` prints which one you got. To run the current main straight from GitHub instead: `npx github:aunysillyme/model-orchestrator`. Add `#vX.Y.Z` for one specific release; the tags are on the [releases page](https://github.com/aunysillyme/model-orchestrator/releases), so this page never pins a number the registry has moved past.

The installer asks a few things, then writes a folder:

1. **Which level?** 1 beginner · 2 intermediate · 3 advanced
2. **Which AIs do you have access to?** (it marks the ones already on your PATH)
3. **Which one is your primary agent?** (the one that runs the system)

It never writes a secret, never runs a vendor shell script for you, and never overwrites a document you already have unless you pass `--force`. Two exceptions, both stated when they happen: `MANIFEST.json` and `bin/lanes.json` are machine-owned and rewritten on every run so a changed selection applies; runtime files (`cli-run`, the audit job, compose, gateway config, setup script) are upgraded when the installed copy matches the hash a previous run recorded, kept and reported as a conflict when you edited them, and kept as unverifiable when no manifest exists (`--upgrade-runtime` replaces runtime files only). The same hash rule is available for documents on request: `--update-docs` regenerates the documents a previous run wrote and nobody edited, so a changed selection reaches `ROUTING.md` and the delegation matrix without `--force`; edited documents are kept and named. Docs and protocols go to `--dir` (default `./ai-orchestrator`); subagent definitions (and, on Claude Code, two hook scripts) go to the project root your agent runs from (`--project`, default the current directory), because that is the only place Claude Code and Antigravity read them. It ends with an activation summary: what to copy where, which sign-ins, and one smoke command. Uninstall: follow the generated README. Inspect the manifest and remove only the individual managed subagent files you no longer need, preserve edited or pre-existing files, and remove your manually pasted activation block. Never delete a shared subagent folder.

## The three levels

| Level | You have | You get |
|---|---|---|
| **1 · Beginner** | one LLM or one agent | tiers, task classification, the two build checkpoints, the protocols (build, propagate, gap analysis, deep research, numbers and logic, memory and record), a task-bundle template, and your agent set up to follow them |
| **2 · Intermediate** | several AIs with CLIs | everything above, plus `cli-run` (exit 0 means a structurally accepted non-empty response; opt-in `--expect-file` / `--expect-json` for real contracts; `--model` / `--effort` to pin the route and log it), a delegation matrix generated from your selection, research triage across the lanes you have |
| **3 · Advanced** | a virtual machine | everything above, plus a gateway config rendered from the API keys you hold (asked separately from your CLIs), pinned images, box rules, privacy gates, and a weekly gap-analysis job with "what watches it" written down |

Read the thinking behind each level in [docs/](docs/README.md): [Part 1](docs/part-1-beginner.md) · [Part 2](docs/part-2-intermediate.md) · [Part 3](docs/part-3-advanced.md).

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
| `claude-app`, `chatgpt-app`, `gemini-app` | chat apps with no CLI: level 1 via a paste block | 1 |

`npx model-orchestrator --list` prints the catalog with install and sign-in notes. Details: [docs/catalog.md](docs/catalog.md).

## Companion tools (both optional)

An orchestrator routes work. It does not make a model stop guessing numbers, and it does not give it a memory. Two tools from the same maintainer close those gaps. The installer asks about each one separately; selecting one writes a doc and config snippets, it installs nothing. `--tools codecalc,obsidian-tc` or `--no-tools` for scripted runs; `--yes` alone selects only the recommended one.

| Tool | Closes | Default | You need first |
|---|---|---|---|
| [codecalc](https://github.com/The-40-Thieves/codecalc) | guessed numbers, comparisons, complexity and equivalence claims: exact arithmetic, code execution in 31 languages, SMT logic checks, `verify_translation` / `verify_optimization`; offline, no key | yes | Python 3.10+ and `uv`. `uvx 'codecalc[full]' setup --write` registers it with Claude Code, Claude Desktop, Cursor, VS Code, Zed; snippets for Codex, Antigravity, Qwen Code are written for you |
| [obsidian-tc](https://github.com/The-40-Thieves/obsidian-tc) | no durable memory: hybrid search, backlinks, compare-and-swap writes with a confirmation gate, folder ACLs, a poison scan on inferred writes; 163 tools, local by default; AGPL-3.0 | no | an Obsidian vault folder; Node 24+ or Bun 1.1+ (stricter than this installer); Ollama with `nomic-embed-text` or a cloud embeddings key; the Obsidian app and its Local REST API plugin only for live bridge tools. Skip it if you do not keep notes in Obsidian |

Whether or not you select them, every level carries the two rules they serve: `protocols/numbers-and-logic.md` (when calling a calculator is mandatory, how to report a computed figure, why a thought log is not evidence) and `protocols/memory-and-record.md` (search before writing, the folder index is part of the change, one writer, inferred content marked as inferred).

## The two folders every run writes to

An install has two targets, and a scripted run should set both.

| Flag | Default | What lands there |
|---|---|---|
| `--dir` | `./ai-orchestrator` | the docs, protocols and (level 2+) `bin/cli-run.mjs`. Named after what it contains, not after this package, so a project can hold one without looking like a checkout of it. Pass `--dir ./model-orchestrator` if you prefer the package name. |
| `--project` | the current directory | the subagent definitions, and the rules file your agent reads. Only Claude Code (`.claude/agents/`) and Antigravity (`.agents/agents/`) get files here, because that is the only place those CLIs look. Claude Code also gets three hook scripts in `.claude/hooks/`, wired by a settings snippet you merge yourself. |

`--project` defaulting to the current directory is the one that surprises people: run the command from your home folder with Claude Code as the primary and five agent files land in your home folder. The installer prints the resolved project path in the plan and says when you left it at the default. Set it.

## Non-interactive

```bash
# both targets set: docs in ./ai-orchestrator, subagents into ./my-app/.claude/agents
npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok --primary claude-code \
  --dir ./ai-orchestrator --project ./my-app
# --yes selects the recommended companion tool (codecalc), which writes CODECALC.md and mcp/ snippets.
# Add --no-tools for none, or --tools codecalc,obsidian-tc to choose.

npx model-orchestrator --yes --level 3 --ais claude-code,codex,agy,grok,hermes,qwen,ollama --apis anthropic,openrouter --dry   # print the plan, write nothing
npx model-orchestrator --yes --level 2 --ais claude-code,codex --project ~/my-app --dir ~/my-app/ai-orchestrator --no-tools  # subagents into ~/my-app/.claude/agents
npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok --primary claude-code --dir ./ai-orchestrator --project . --update-docs   # added a lane: regenerate the docs you never edited
```

## What gets written (level 3, everything)

```
ai-orchestrator/
  README.md                 start here, written for your level and your AIs
  ORCHESTRATOR.md           single-agent routing rules (level 1)
  TASK_BUNDLE.md            the brief every delegation carries
  protocols/                build-protocol · propagate · gap-analysis · deep-research · numbers-and-logic · memory-and-record
  CODECALC.md  OBSIDIAN-TC.md  mcp/   companion-tool install docs + per-agent registration snippets (if selected)
  <project>/.claude/agents/ one per tier plus finding-verifier, done-verifier, reader, at the PROJECT root (if Claude Code is primary)
  <project>/.claude/hooks/  route-gate.mjs (UserPromptSubmit) + subagent-context.mjs (SubagentStart) + route-metrics.mjs (all five: see "Measuring routing" below), Claude Code only
  CLAUDE.snippet.md         the block to paste into your CLAUDE.md
  settings.hooks.snippet.json  the hooks block to merge into .claude/settings.json (Claude Code only)
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
| [`test/`](test/README.md) | `npm test`: judges proven to go red, catalog integrity, planner, end-to-end install in a temp dir; `.github/workflows/test.yml` runs it on Ubuntu, macOS and Windows, Node 18/20/22 |

## What is enforced, what is delegated, what is an instruction

Most of what this package ships is text an agent is asked to follow. Be clear about which is which before relying on it unattended.

| Property | How it holds |
|---|---|
| Installer writes only inside `--dir` and `--project`, never a secret, never over a document without `--force` (or `--update-docs`, which touches only documents provably untouched since a previous run); machine-owned config always, runtime files only when provably untouched or with `--upgrade-runtime` | **enforced by code** (preflight, exclusive create, rollback, manifest hashes; tested) |
| `cli-run` exit codes, process-group kill on timeout and on SIGINT/SIGTERM, UTF-8-safe streaming, fixed-code durable log, `--expect-*` contracts with a pre-run snapshot | **enforced by code** (tested with stub lanes) |
| Codex audit lane runs read-only | **delegated to the vendor flag** (`--audit` → `--sandbox read-only`); commands and network still follow your codex config |
| Other lanes' permissions, sign-in state, model versions | **delegated to each vendor's own config**; `--doctor` checks presence, not versions |
| Gateway binds to loopback, keys by name only | **enforced in the generated files**; whether the gateway authenticates is your environment |
| Lane selection, tiers, privacy classes, one-writer, escalation, the protocols | **agent instructions**. Nothing here stops an agent that ignores its rules; the task bundle and the protocols make ignoring them visible, not impossible |
| Weekly audit bounded, previous report preserved | **enforced in the generated script and unit** (watchdog, temp-and-rename, `TimeoutStartSec`) |

If you need a property in the third row to be enforced, that is a router, a policy engine or a sandbox, and this package does not claim to be one.

### Vendor version compatibility

**This package detects that a binary exists. It does not check its version, and a present binary is not a working lane.** `--doctor` reports presence, and with `--run` sends one lane a one-word canary; neither validates that the vendor's flags, output shape or auth still match what the generated files assume.

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

One number per lane, and it is the same number the installer pins: where a lane installs from npm, `builtAgainst` in the catalog *is* the pin, so "built against" and "pinned to" can never be two answers. That pin is a floor, not a ceiling: these CLIs ship breaking flag changes on their own schedules, so a newer version may work perfectly, or may change a flag the generated wiring passes. When a lane starts failing after a vendor upgrade, compare against this table first.

**The live canary runs on your machine, with your credentials.** That is what `node bin/cli-run.mjs --doctor --run` is: it sends every enabled lane one tiny prompt through your own sign-ins and reports `canary ok` or `canary FAILED rc=` per lane. Run it after install, and again after any vendor upgrade.

It deliberately does not run in this repository's CI. A canary is only meaningful against real credentials, and there are no credentials a maintainer could supply that would tell **you** anything about **your** lanes: your sign-ins, your quota, your vendor versions. A maintainer-credential canary in CI would prove one machine works and bill someone per run to do it. So CI runs the full suite against stub lanes on Ubuntu, macOS and Windows, Node 18/20/22, plus a packaged install into a clean consumer, and the live check ships to you instead.

## Principles the whole thing rests on

1. **Route by capability tier, not model name.** Default down, escalate on evidence.
2. **A gate you cannot fail is not a gate.** Every checkpoint is a question that can come back wrong.
3. **Exit 0 is not a deliverable.** Check for the artifact, not the status line. `cli-run` checks the response is structurally there; `--expect-file` checks the artifact.
4. **Numbers are computed, never guessed.** A tool that calculates beats a model that feels finished.
5. **A write nobody can find again did not happen.** Search first, keep the index true, one writer.
6. **A delegate's brief carries this task's scope, whatever it already holds.** A Claude Code subagent loads the project's CLAUDE.md hierarchy at start, so it already has the standing rules; a second CLI or a fresh chat window may hold none of them. Either way, only the brief carries what this task needs. On claude-code, that changes who executes: see "Who builds" in `ROUTING.md`.
7. **Only one process holds keys.** Names in the environment, values in a secrets manager, never in a file here.

## Routing by role, complexity and stakes

Role picks the agent. Two more inputs move the choice, and they move it in
different directions, so `TIERS.md` states them separately rather than folding
them into the role:

- **Complexity moves the effort.** A worker executing a finished plan needs less
  reasoning than the reviewer judging its output. When the plan is airtight the
  spec is carrying the thinking.
- **Stakes move the tier and the reader.** Security, privacy, data loss and
  irreversible changes buy the challenge lane, a named check, a rollback path or
  a human yes. A one-line change to an auth check is simple and high-stakes at
  the same time, and it is the stakes that decide.

Stakes means what a mistake would cost: a security hole, leaked personal data,
lost data, or something you can't undo. Most tasks are low-stakes and route
normally.

The top of the ladder is bought with evidence: a reproduced failure, an
unresolved checkpoint, an irreversible change. A task that merely feels hard is
a deep-tier task, not an escalation.

## A finding is a claim, not a fact

Review findings do not go straight to a repair. `finding-verifier` reads the
cited line, states what would trigger the problem, then hunts for the guard,
caller or test that makes it impossible, and returns **CONFIRMED**,
**NOT_REPRODUCED** or **INCONCLUSIVE** per finding. Only CONFIRMED earns a
change. Use a different model family from the one that produced the finding
where you have one: a family asked to check its own claim tends to agree with
itself.

## Two more fast-tier checks

`done-verifier` probes the artifact a tracker item's done-signal names (a file, a commit, a URL, a log line, a count) and returns MET, NOT_MET or UNVERIFIABLE; it never closes or edits anything itself. It carries no file-editing tools, but on claude-code it does carry `Bash` for those probes (`git log`, `grep`, `wc -l`, `test -f`); staying to read-only commands there is a rule in its prompt, not a restriction on the tool grant, and its own description says so. On agy, `commandExecutionPolicy: off` blocks command execution mechanically instead. `reader` is the one that is read-only by tool grant on both: no `Write`, `Edit`, or `Bash`. It reads and digests many files or notes and hands back exactly what the brief asked for, cited by `path:line`; it never classifies, tags or writes, which is what separates it from `bulk-worker`. Both ship in the claude-code and agy agent sets, at the fast tier.

## Measuring routing

A routing rule nobody measures is a rule nobody knows is followed. On a claude-code install, `route-metrics.mjs` (the third hook, wired to `UserPromptSubmit`, `PreToolUse` on `Agent`/`Task`, `SubagentStart`, `SubagentStop` and `Stop`) turns each of those into one JSON line under `~/.ai-orchestrator/route-metrics.jsonl`: a turn started, a subagent was dispatched (and with what, and in the background or not), a subagent started and stopped (so a duration can be computed), and the lane your agent named in its own hidden `<!-- route: <lane> | <why> -->` marker, which the route-gate block now asks for on every reply. It never logs prompt text, tool descriptions, or the "why" half of the marker: only the named fields above, charset-bounded, same principle as `cli-run.mjs`'s log.

```bash
node .claude/hooks/route-metrics.mjs --summary                        # since the log began
node .claude/hooks/route-metrics.mjs --summary --since 2026-09-01     # since a date
```

The report prints turns, **route-marker coverage** (the percentage of turns whose `Stop` event carried a real lane, not `missing`, which is the number that answers "is the agent actually tagging its routing decisions?"), lanes by count, dispatches by `subagent_type`, dispatches with no matching start (a hook or guard blocked the subagent before it launched), and mean/max duration per agent type. Fail-open by design, like the other two hooks: a miss here is a missing log line, never a blocked turn, and it prints nothing to stdout on any event since stdout on `UserPromptSubmit`/`SubagentStart` becomes model context.

## Pin the route, or know that you did not

A lane with no `--model`, no `--effort` and no `defaults` entry in
`bin/lanes.json` runs on **its own config file**, which `cli-run` cannot see. A
CLI configured months ago at a low reasoning effort keeps auditing at that
effort while your routing docs describe a second-opinion pass.

```bash
node bin/cli-run.mjs codex "<prompt>" --model gpt-6-astra --effort high
node bin/cli-run.mjs --doctor     # prints what each lane is pinned to, and what is not pinned
```

Every run logs the model and effort **requested** and where the request came
from: `flag`, `lanes.json`, or `lane_default`, on every record including the
runs that never reached a lane. It does not log an actual. One lane of five
(grok) reports a model id in its own output and the other four report none, so
an actual field would be present for one lane and missing for four, and it
would be a provider-supplied string, which the durable log deliberately never
holds.

## Common questions

### How do I cut token usage across Claude Code, Codex and Gemini?

Install for the tools you have, then let the generated `ROUTING.md` decide the tier per task: bulk, reading and verification go to the fast tier or a cheaper CLI lane, and the deep tier only plans and judges. On Claude Code, execution goes to the `builder` subagent by default and the main session plans and verifies. Every lane call through `cli-run` logs the model and effort it ran with, so you can check where the tokens went.

### How do I route tasks to cheaper models?

The rules route by role, complexity and stakes (see [Routing by role, complexity and stakes](#routing-by-role-complexity-and-stakes)). Role picks the agent, complexity moves the effort, stakes move the tier. A task a cheap tier finishes correctly never gets a frontier token.

### Is this an LLM router or an AI gateway?

No. It routes at the task level, through instructions your agent follows and a runner for agent CLIs. If you want a service or proxy that picks or forwards the model on every API request, look at request-level routers and gateways such as RouteLLM, LiteLLM, OpenRouter or claude-code-router. They solve a different problem and can sit underneath this.

### Can an agent install and run it without a person?

Yes. `--yes` with `--level`, `--ais` and `--project` runs headless, `--dry-run` previews the plan, and `--list` prints every supported AI. Nothing is appended to a file you already have; activation snippets are written next to your files for you to merge.

## Requirements

Node 18 or newer. No dependencies. Works on macOS and Linux; the level 3 box templates assume Ubuntu. Windows: CI runs the suite on `windows-latest` (Node 18, 20, 22), including lane execution end to end through `cli-run` against a fake CLI installed the same way npm installs a real one (a `.cmd` shim). `cli-run` never runs a lane through `cmd.exe` when it can avoid it: it resolves the shim to the Node script underneath and spawns Node directly, so a prompt reaching a real lane never passes through a Windows shell. A `.cmd` or `.bat` lane that cannot be resolved that way (an old or hand-edited shim) is refused with exit 13 and a message saying how to fix it, rather than run through `cmd.exe`: a batch file re-reads its arguments after `cmd.exe` has parsed them once, and no escaping fully contains a prompt through both passes. Install, detection, the hooks and `cli-run`'s `taskkill` tree kill are tested on Windows too, including SIGTERM/SIGINT to the wrapper (Windows has no OS-level signals: both terminate it unconditionally, verified there rather than treated the same as POSIX). Three narrow skips remain on Windows, each for a POSIX behavior the OS or the CI shell genuinely does not have: `statSync().mode`'s executable bit (NTFS has none), a lane dying mid-run from a real POSIX signal (a real Windows lane cannot die "by signal"), and running `weekly-audit.sh`'s watchdog for real under Git Bash's job control (the script itself only ever runs on the Ubuntu box it targets).

**Privacy.** The installer sends no telemetry and makes no network call of its own once it is running. Two things around that are worth being exact about:

- `npx model-orchestrator` is itself a download: npm fetches this package from the registry before any of it runs. `npm install -g model-orchestrator` once, then run `model-orchestrator`, if you would rather that happen exactly one time.
- A missing vendor CLI is *printed*, not installed. In an interactive run the installer offers to run one pinned `npm install -g` per package and only runs the ones you answer yes to; with `--yes` or `--no-install` it answers no for you and prints the command instead. Vendor shell installers (Antigravity, Grok) are only ever printed, alongside the `curl … | less` you would use to read one before running it.

`cli-run` talks to nothing but the vendor CLI you name.

## Contributing

Add an AI to `src/catalog.js` and every prompt, table, config and doc picks it up. Run `npm test`. Keep templates free of logic and free of anything that looks like a credential. The rest is in [CONTRIBUTING.md](CONTRIBUTING.md); releases in [RELEASING.md](RELEASING.md); security reports in [SECURITY.md](SECURITY.md).

## Credits

- [@shawnwows](https://x.com/shawnwows) reviewed the router and made the case for
  separating role, complexity and stakes instead of compressing them into one
  scale, for recording the model and effort a lane was actually asked for, and
  for verifying findings before they trigger repairs. All three shipped in
  0.1.14.

## License

[MIT](LICENSE)
