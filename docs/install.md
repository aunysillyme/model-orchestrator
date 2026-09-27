# Installing

Everything the installer asks, writes and accepts as a flag. The short version is in the [README](../README.md).

## Install walkthrough

![Terminal walkthrough of the installer](demo.gif)

This recording shows the published 0.1.x installer. Version 1.0 detects your tools and asks for one confirmation. Companions start unselected, and third-party installation instructions are printed for you to run. Re-record from the published release with `bash scripts/record-demo.sh`.

## What a run does


The installer detects the AI binaries on your PATH, proposes a setup and shows **Your stack: who does what** before writing. The default flow asks exactly one question:

```text
Write these files?
[Y/n/e]  (e to change anything above):
```

- **Confirm:** press Enter or `y` to write the displayed files. `n` exits without writing.
- **Edit:** enter `e`, choose one setting and return to the summary. The edit menu includes level, AIs, main agent, companions, paths and plans; level 3 also includes API providers.
- **No detected tools:** answer "Which AIs do you have access to?" first, then confirm. This path asks two questions.
- **Defaults:** one selected tool starts at level 1; several tools including a supported worker start at level 2, subject to each tool's minimum level. Level 3 requires an explicit choice. Companions and API providers start unselected.
- **Main agent:** capability ranking prefers project-rule-loading subagents, then an agent-definition surface, then a CLI with a project rules file. Ties keep selection order.
- **Overrides:** explicit flags take precedence and appear in the plan. Existing recorded plans and automatic-effort consent survive a rerun.

It never writes a secret, runs no third-party installer, and preserves existing documents by default. `--force` explicitly replaces them; `--apply-snippets` opts into the backed-up activation merge described below. Two exceptions, both stated when they happen: `MANIFEST.json` and `bin/lanes.json` are machine-owned and rewritten on every run so a changed selection applies; runtime files (`cli-run`, the audit job, compose, gateway config, setup script) are upgraded when the installed copy matches the hash a previous run recorded, kept and reported as a conflict when you edited them, and kept as unverifiable when no manifest exists (`--upgrade-runtime` replaces runtime files only). The same hash rule is available for documents on request: `--update-docs` regenerates the documents a previous run wrote and nobody edited, so a changed selection reaches `ROUTING.md` and the delegation matrix without `--force`; edited documents are kept and named. Docs and protocols go to `--dir` (default `./ai-orchestrator`). Only the main agent receives its subagent definitions when supported: Claude Code or Antigravity. Those definitions and Claude Code's three hook scripts go to the project root your agent runs from (`--project`, default the current directory). The generated `README.md` gives activation steps for that main agent and level, including the installed runner's smoke command at level 2 and up. Use `--uninstall` to remove unedited managed files, then remove your manually merged activation entries. See [Uninstall](#uninstall).

The manifest's `roles` assignment is refreshed on every run. If a changed assignment leaves edited documents in place, the installer names that difference: `aunx route` uses the current manifest while those documents retain your edits. Use `--update-docs` to regenerate unchanged managed documents.

## Apply Claude Code snippets

Pass `--apply-snippets` with a Claude Code main agent to apply both activation snippets. The flag is off by default; other primaries exit 2 and name the snippet to paste by hand.

- **Rules:** create `CLAUDE.md` if missing, or insert a block between `<!-- model-orchestrator:start -->` and `<!-- model-orchestrator:end -->`. Reruns replace that block in place, keeping every byte outside it. Incomplete or duplicate markers are refused before writing.
- **Settings:** create `.claude/settings.json` if missing, or merge the generated hooks while preserving existing keys and hooks. A command with the same arguments already present in that event is kept once. Unparseable JSON exits 2, names the file, and writes nothing anywhere.
- **Backups:** every existing file changed during an apply run gets a sibling `<name>.bak-YYYYMMDDTHHMMSS`, including generated files replaced on a rerun. Each path is printed. New and unchanged activation files need no backup; existing backups are preserved.
- **Preview:** `--apply-snippets --dry` and `--apply-snippets --dry-run` list writes, kept files and backup paths without changing the filesystem.
- **Activation:** the summary reports the applied rules and hooks, then lists sign-ins and verification. Start a fresh Claude Code session to verify the instructions loaded.
- **Revert:** uninstall leaves the marked block, settings and backups in place and names them in its manual steps. Review a backup before restoring it so later edits survive.

```bash
npx model-orchestrator --yes --level 2 --ais claude-code,codex --primary claude-code --project . --dir ./ai-orchestrator --apply-snippets
```

## Plans and automatic effort

State known subscription plans with `--plans codex=pro-20x,agy=ultra-5x`, or choose subscription plans from the edit menu. The generated guidance uses plan headroom to allocate volume only. Every catalog plan currently has an unverified model mapping, so agent definitions omit `model:` and use your tool's configuration. Probe the available models before dispatching work. Claude Code also honors `CLAUDE_CODE_SUBAGENT_MODEL`; a manual `model:` line can set a verified choice. Plan support for `xhigh` and `max` effort remains UNVERIFIED.

`--effort-auto` is explicit consent to set `auto` only for selected high or max headroom CLI lanes. Auto chooses medium below 4,000 prompt characters and high otherwise, never higher. An audit lane may impose its own effort floor; check its configuration. Name `xhigh` explicitly for security-critical or irreversible work. The default install skips plan and effort questions; choosing plans in the edit menu enables the effort choice in that same step.
## The two folders every run writes to

An install has two targets, and a scripted run should set both.

| Flag | Default | What lands there |
|---|---|---|
| `--dir` | `./ai-orchestrator` | the docs, protocols and (level 2+) `bin/cli-run.mjs`. Named after what it contains, not after this package, so a project can hold one without looking like a checkout of it. Pass `--dir ./model-orchestrator` if you prefer the package name. |
| `--project` | the current directory | the main agent's subagent definitions: `.claude/agents/` for Claude Code or `.agents/agents/` for Antigravity. A Claude Code main agent also gets three hook scripts in `.claude/hooks/`, wired by a settings snippet you merge yourself or apply with `--apply-snippets`. The generated activation steps name the project rules file to create or update. |

`--project` defaulting to the current directory is the one that surprises people: run the command from your home folder with Claude Code as the main agent and the subagent and hook files land in your home folder. The installer prints the resolved project path in the plan and says when you left it at the default. Set it.

Rules inside the project use project-relative snippet paths, so moving the whole project preserves them. Rules outside the project use absolute paths and carry a relocation note. After moving those rules, re-run the installer or set `MODEL_ORCHESTRATOR_RULES_DIR` for the installed rule-reading hooks, and update your agent instruction paths. An absolute override names the new folder; a relative override is relative to `CLAUDE_PROJECT_DIR`. `route-metrics` reads no rules and keeps its home-directory log. The separately installed Claude Code plugin keeps its existing default-path lookup.

## Headless installation

`--yes` requires both `--level` and `--ais`, giving scripted installs an explicit selection. Detection-based inference applies to the interactive flow. All existing flags remain available, including `--primary`, `--tools`, `--plans`, `--apis`, `--no-tools` and `--no-install`.

```bash
# both targets set: docs in ./ai-orchestrator, subagents into ./my-app/.claude/agents
npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok --primary claude-code \
  --dir ./ai-orchestrator --project ./my-app
# Companions default to none, including with --yes.
# Add --tools codecalc,obsidian-tc,context7 to write their guides and snippets.

npx model-orchestrator --yes --level 3 --ais claude-code,codex,agy,grok,hermes,qwen,ollama --apis anthropic,openrouter --dry   # print the plan, write nothing
npx model-orchestrator --yes --level 2 --ais claude-code,codex --project ~/my-app --dir ~/my-app/ai-orchestrator --no-tools  # subagents into ~/my-app/.claude/agents
npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok --primary claude-code --dir ./ai-orchestrator --project . --update-docs   # added a lane: regenerate the docs you never edited
```

## Upgrading from 0.1.x

Use the same project and rules folder as your existing install. Preview first:

```bash
npx model-orchestrator@1 --yes --level 2 --ais claude-code,codex --primary claude-code --project . --dir ./ai-orchestrator --update-docs --dry
```

- **Documents:** `--update-docs` replaces only files matching their recorded installed hashes. The former brief filename migrates to `TASK_BRIEF.md` when unedited. An edited legacy brief stays and is named so you can move your changes deliberately.
- **Runtime:** unchanged managed runtime files upgrade automatically. Use `--upgrade-runtime` when you intend to replace an edited runtime; it leaves document edits alone.
- **Companions:** existing codecalc guides and snippets stay managed. New installs select none unless you pass `--tools`. `--uninstall` still removes companion files only when unedited.
- **Activation:** review regenerated snippets and merge them, or use `--apply-snippets` for Claude Code with its printed backups.
- **Compatibility:** every 0.1.x installer flag remains accepted. `--no-tools` and `--no-install` remain accepted for older scripts.
- **Verification:** remove `--dry` to apply, then run `aunx cli-run --doctor` (direct form: `node ai-orchestrator/bin/cli-run.mjs --doctor`) and start a fresh agent session.

The installer installs only its own files. Missing selected CLIs and companions appear in one **Install these yourself** block with official commands and links.

## Uninstall

Use the same `--dir` and `--project` paths you installed with. The uninstall reads `MANIFEST.json` under `--dir` and checks every recorded path before removing any file.

```bash
# Preview the exact removals and kept files.
npx model-orchestrator --uninstall --dir ./ai-orchestrator --project ./my-app --dry
# Remove the files whose content still matches the recorded hash.
npx model-orchestrator --uninstall --dir ./ai-orchestrator --project ./my-app
```

- **Unedited files:** removed when their content hash matches the manifest.
- **Edited files:** kept and listed by path, with the manifest retained so you can review them.
- **Other files:** anything outside the manifest stays, including your own files in shared `.claude/agents/` and `.claude/hooks/` folders.
- **Directories:** removed only when the manifest records that the installer created them and they are empty after removal. Older manifests leave directories in place because they carry no directory ownership record.
- **Manifest:** removed last, only when every managed file has been removed.
- **Path safety:** an absolute path, traversal entry, or symlink is refused before any removal. Entries must stay inside their declared `--dir` or `--project` root.
- **Missing manifest:** exits 2 and names the expected `MANIFEST.json` path.
- **Target paths:** `--dir` and `--project` must match the installation paths in the manifest. A mismatch exits 2 before removal.
- **Preview:** `--dry` (or `--dry-run`) lists the planned removals and writes nothing.

The command prints the remaining manual steps: remove the pasted model-orchestrator block from `CLAUDE.md` and its merged hook entries from `.claude/settings.json`. Applied blocks use `<!-- model-orchestrator:start -->` and `<!-- model-orchestrator:end -->`. Timestamped `CLAUDE.md.bak-*` and `.claude/settings.json.bak-*` backups stay beside the originals for a reviewed restore. Keep your other rules and hooks. With another main agent, remove its pasted activation block from the corresponding rules file.

## What gets written (level 3, everything)

The tree shows the activation alternatives. Each install writes the main agent's snippet and its supported agent set; companion files appear when selected. Paths beginning with `<project>/` are relative to `--project`, separate from the rules folder.

```
ai-orchestrator/
  README.md                 start here, written for your level and your AIs
  ORCHESTRATOR.md           single-agent routing rules (level 1)
  TASK_BRIEF.md            the brief every delegation carries
  CONTEXT.md               shared facts every delegation reads
  ACCEPTANCE_CHECKS.json   executable acceptance checks
  DECISIONS.md             the decision log: Did / Why / Serves / Rejected
  protocols/                acceptance-checks · build-protocol · context-file · decision-log · deep-research · docs-then-prove · gap-analysis · memory-and-record · numbers-and-logic · propagate
  CODECALC.md  OBSIDIAN-TC.md  CONTEXT7.md  mcp/   companion-tool install docs + per-agent registration snippets (if selected)
  CLAUDE.snippet.md         paste into CLAUDE.md (Claude Code main agent)
  settings.hooks.snippet.json  merge into .claude/settings.json (Claude Code main agent)
  GEMINI.snippet.md         paste into GEMINI.md (Antigravity main agent)
  AGENTS.snippet.md         paste into AGENTS.md (Codex main agent)
  QWEN.snippet.md           paste into QWEN.md (Qwen Code main agent)
  PASTE-INTO-YOUR-AGENT.md  paste into instructions (main agent with no project rules file)
  ROUTING.md                multi-lane decision tree (level 2+)
  TIERS.md  DELEGATION_MATRIX.md  RESEARCH_TRIAGE.md  CLI-RUN.md
  bin/cli-run.mjs  bin/lanes.json          (aunx cli-run --doctor, or node bin/cli-run.mjs --doctor)
  vm/                       gateway config, compose, box rules, privacy gates, jobs/ (level 3)

<project>/.claude/agents/  Claude Code main agent's subagent set
<project>/.claude/hooks/   route-gate.mjs, subagent-context.mjs, route-metrics.mjs (Claude Code main agent)
<project>/.agents/agents/  Antigravity main agent's custom agent set
```

## Project commands (`aunx`)

Install the command with `npm install -g model-orchestrator`, then run these from your project. `aunx` without a subcommand accepts the installer flags.

| Command | Result |
|---|---|
| `aunx cli-run --doctor` | Check selected CLIs; add `--run` for live vendor canaries |
| `aunx route-metrics --summary` | Summarize your local routing history |
| `aunx brief` | Print the task brief template |
| `aunx brief new TASK_BRIEF.md` | Scaffold a task brief |
| `aunx context CONTEXT.md` | Scaffold a shared context file |
| `aunx checks ACCEPTANCE_CHECKS.json` | Scaffold executable acceptance checks |
| `aunx checks run ACCEPTANCE_CHECKS.json` | Execute trusted check commands; exit 1 on any failure |
| `aunx route [--dir PATH] "rename this file"` | Print the role, assigned AI, tier, effort and reason from your manifest |

`aunx cli-run` uses the packaged runner by default; pass `--dir PATH` to use that project's own installed runner under `PATH/bin/` instead, and `aunx` prints the runner path it is using. Review check commands before running them: they execute with your shell permissions.

`aunx route` reads `MANIFEST.json` first under `--dir`, then under `./ai-orchestrator`, then in the current folder. It reads regular JSON files of at most 1 MiB, refuses symlinks and executes no project code. A missing or invalid manifest gives the generic suggestion plus an install notice.

## Repo layout

| Folder | What |
|---|---|
| [`bin/`](../bin/README.md) | `cli.js` (the installer), `aunx.js` (the CLI entry point) and `cli-run.mjs` (the lane runner) |
| [`src/`](../src/README.md) | the catalog, the pure planner, detection, rendering |
| [`templates/`](../templates/README.md) | everything the installer can write, by level, plus `tools/` for companions |
| [`docs/`](../docs/README.md) | the three parts and the catalog |
| [`plugin/`](../plugin/README.md) | the Claude Code plugin, generated from `templates/` by `npm run gen:plugin`; `.claude-plugin/marketplace.json` at the root lists it |
| [`proof/`](../proof/README.md) | the measured numbers behind the README's claims: method, sample size, date and expiry |
| [`test/`](../test/README.md) | `npm test`: judges proven to go red, catalog integrity, planner, end-to-end install in a temp dir; `.github/workflows/test.yml` runs it on Ubuntu, macOS and Windows, Node 18/20/22 |
