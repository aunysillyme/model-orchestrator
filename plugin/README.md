# model-orchestrator plugin for Claude Code

Routing rules for Claude Code, as a plugin. A hook reads your project's routing table and injects it on every prompt, so Claude picks the right subagent tier for each task and fewer tokens go to the most expensive model. Eight subagents ship with it, one per job, each with its own model alias, effort level and an explicit tool list.

This folder is generated from the same templates `npx model-orchestrator` installs (`npm run gen:plugin`), so the plugin and the npm install carry the same agents and hooks.

## Install

```
/plugin marketplace add aunysillyme/model-orchestrator
/plugin install model-orchestrator@model-orchestrator
```

From a terminal instead of a session: `claude plugin marketplace add aunysillyme/model-orchestrator`, then `claude plugin install model-orchestrator@model-orchestrator`. Add `--scope project` to share it with everyone who opens the project.

## First run: write the routing rules

A plugin cannot run an installer, so it cannot write your routing rules. Generate them once per project, from the project root:

```
npx model-orchestrator --yes --level 2 --ais claude-code --project . --dir ./ai-orchestrator
```

Run `npx model-orchestrator` with no flags to choose interactively instead. Pick Claude Code as the primary agent: only a Claude Code install writes the route-gate table the hook reads.

Until that file exists, the plugin tells you so once at session start, and tells Claude on every prompt, naming the command above. It never fails silently and never blocks a prompt.

## What it ships

| Part | Event | What it does |
|---|---|---|
| `hooks/route-gate.mjs` | UserPromptSubmit | Reads the table between `<!-- route-gate:start -->` and `<!-- route-gate:end -->` in `ai-orchestrator/ROUTING.md` (level 2 and 3), or `ai-orchestrator/ORCHESTRATOR.md` (level 1), and injects it. |
| `hooks/route-gate.mjs --session-start` | SessionStart | Shows a one-line notice when neither rules file exists. Says nothing otherwise. |
| `hooks/subagent-context.mjs` | SubagentStart | Gives each subagent a short, fixed reminder: where the rules live, the report contract, and not to route work further itself. |

| Agent | Model alias | Tools | Job |
|---|---|---|---|
| `deep-planner` | opus | Read, Glob, Grep | plans and judges; never edits |
| `builder` | sonnet | Read, Write, Edit, Glob, Grep, Bash | executes; the default for work that changes files |
| `code-reviewer` | sonnet | Read, Glob, Grep, Bash | findings only; no file-editing tools |
| `finding-verifier` | sonnet | Read, Glob, Grep, Bash | tries to disprove a finding before it causes a repair |
| `live-researcher` | sonnet | WebSearch, WebFetch | fresh data from the web |
| `bulk-worker` | haiku | Read, Glob, Grep, Write | mechanical volume |
| `done-verifier` | haiku | Read, Glob, Grep, Bash | probes a stated done-signal before a close |
| `reader` | haiku | Read, Glob, Grep | reads and digests many files; read-only |

Plugin agents are namespaced: `builder` is `model-orchestrator:builder`. The hook adds that note under the table, so the bare names in your rules still resolve.

## What the hooks do

- They only read. No network, no file writes, no subprocesses, no credential or `.env` access.
- The rules read is bounded to 64 KB, regular files only, so a FIFO or a huge file at that path cannot hang a prompt.
- Every path exits 0. A problem becomes a line of context, never a blocked prompt.
- The table they inject comes from your project's own rules file, so anyone who can edit that file can edit what Claude reads. Treat it like `CLAUDE.md`.

## Installed by npx

- **The routing log.** `npx model-orchestrator` also installs `route-metrics.mjs`, which appends one JSON line per routing event so you can measure whether the rules are followed. It writes to disk, and the plugin ships only hooks that read, so it is npm-only.
- **A custom rules folder.** The plugin reads only the installer's default `ai-orchestrator/` folder. If you installed with a different `--dir`, use the hooks the installer rendered for that folder (`.claude/hooks/` plus `settings.hooks.snippet.json`) instead of the plugin's hooks.

## Using it next to an npm install

If you already merged the installer's `settings.hooks.snippet.json`, your project runs its own `route-gate.mjs` and `subagent-context.mjs`. Keep one copy of each: either remove those two entries from your settings (and keep `route-metrics.mjs`), or disable the plugin. Two copies inject the same table twice.

The installer also writes the same eight agents to `.claude/agents/`. Both sets load; the plugin's are the namespaced ones.

## Uninstall

```
/plugin uninstall model-orchestrator@model-orchestrator
```

Your `ai-orchestrator/` folder is yours and stays.

## More

- Full documentation, levels and the CLI lane runner: https://github.com/aunysillyme/model-orchestrator#readme
- Security notes: https://github.com/aunysillyme/model-orchestrator/blob/main/SECURITY.md
- License: MIT, see `LICENSE`.
