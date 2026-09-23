# Installing

Everything the installer asks, writes and accepts as a flag. The short version is in the [README](../README.md).

## What a run does


The installer asks a few things, then writes a folder:

1. **Which level?** 1 beginner · 2 intermediate · 3 advanced
2. **Which AIs do you have access to?** (it marks the ones already on your PATH)
3. **Which one is your primary agent?** (the one that runs the system)

It never writes a secret, never runs a vendor shell script for you, and never overwrites a document you already have unless you pass `--force`. Two exceptions, both stated when they happen: `MANIFEST.json` and `bin/lanes.json` are machine-owned and rewritten on every run so a changed selection applies; runtime files (`cli-run`, the audit job, compose, gateway config, setup script) are upgraded when the installed copy matches the hash a previous run recorded, kept and reported as a conflict when you edited them, and kept as unverifiable when no manifest exists (`--upgrade-runtime` replaces runtime files only). The same hash rule is available for documents on request: `--update-docs` regenerates the documents a previous run wrote and nobody edited, so a changed selection reaches `ROUTING.md` and the delegation matrix without `--force`; edited documents are kept and named. Docs and protocols go to `--dir` (default `./ai-orchestrator`); subagent definitions (and, on Claude Code, three hook scripts) go to the project root your agent runs from (`--project`, default the current directory), because that is the only place Claude Code and Antigravity read them. It ends with an activation summary: what to copy where, which sign-ins, and one smoke command. Uninstall: follow the generated README. Inspect the manifest and remove only the individual managed subagent files you no longer need, preserve edited or pre-existing files, and remove your manually pasted activation block. Never delete a shared subagent folder.

## Plans and automatic effort

State known subscription plans with `--plans codex=pro-20x,agy=ultra-5x`. The generated guidance uses plan headroom to allocate volume only. It never changes capability or independent-review rules. `--effort-auto` is explicit consent to set `auto` only for selected high or max headroom CLI lanes. Auto chooses medium below 4,000 prompt characters and high otherwise, never higher. A codex audit is always high. Name `xhigh` explicitly for security-critical or irreversible work.
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
# Add --no-tools for none, or --tools codecalc,obsidian-tc,context7 to choose.

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
  protocols/                build-protocol · propagate · gap-analysis · deep-research · numbers-and-logic · memory-and-record · docs-then-prove
  CODECALC.md  OBSIDIAN-TC.md  CONTEXT7.md  mcp/   companion-tool install docs + per-agent registration snippets (if selected)
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
| [`plugin/`](plugin/README.md) | the Claude Code plugin, generated from `templates/` by `npm run gen:plugin`; `.claude-plugin/marketplace.json` at the root lists it |
| [`test/`](test/README.md) | `npm test`: judges proven to go red, catalog integrity, planner, end-to-end install in a temp dir; `.github/workflows/test.yml` runs it on Ubuntu, macOS and Windows, Node 18/20/22 |

