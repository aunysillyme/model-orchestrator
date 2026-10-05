---
name: model-router-intermediate
description: "Model routing across AI CLIs: choose which model for which task, delegate scoped work and control token cost with verified results. Use with Claude Code, Codex, Cursor or Gemini CLI as coordinator and supported worker CLIs. Includes routing rules, task briefs, protocols and a bundled Node lane runner."
---

# Model router: intermediate

Use this pack to keep one main agent coordinating work across verified AI tools. A lane is a tool or model that receives a scoped task brief. This pack includes the beginner method, delegation rules and a runner; it needs no npm installation. Running the bundled CLI runner requires Node.js 18 or newer and the worker CLI's existing sign-in.

## First-run setup in the user's project

1. **Ask and probe:** ask which AI tools and subscriptions the user has, which agent coordinates the project, and where to put project copies (default `ai-orchestrator/`). Inspect current tools, model rosters, supported effort settings, context capacity, billing, permissions and quota. Verify installed CLI presence with each CLI's own help. Mark missing evidence UNVERIFIED.
2. **Copy:** create the chosen folder inside the project. Copy `rules/`, `briefs/`, `protocols/` and `bin/` from this pack, retaining their layout. Preserve existing user edits and ask before replacing them. Perform setup on these project copies.
3. **Fill:** replace every `Fill at setup` instruction in the copies with verified names and assignments. Fill the main agent, stack and lane tables, planning/working/cheap models, task roles, reasons, billing guidance, examples, research commands, companion status and loading instructions. Use the selection rules below; retain `none selected` and UNVERIFIED where requirements are unmet.
4. **Enable:** edit the project's `bin/lanes.json` beside its runner. All lanes start disabled with unpinned defaults. Put only verified installed worker IDs in its `enabled` array; use the catalog-supported IDs listed in that file. Leave `defaults` empty to inherit vendor configuration, or choose current verified model and effort settings. Pair a Hermes model with its serving provider. Keep the configuration file beside the runner; a missing file enables every supported lane.
5. **Check and load:** run the project copy's runner with `--doctor`. It checks CLI presence and requested defaults; verify authentication, actual model execution and loaded project instructions separately. Load the filled `rules/ROUTING.md` in the main agent's supported project instructions, or read it before each task when automatic loading is unavailable. Read `rules/ORCHESTRATOR.md` for the single-agent fallback.

## Assign from the user's real stack

| Role | Selection rule |
|---|---|
| Plan and read | Prefer the main agent, then the largest verified context capacity |
| Build | Require authorized writes and main-agent access or a supported headless runner; prefer main agent, then project-rule and agent-definition loading |
| Review | Require a supported runner and a known family different from the author; prefer read-only mode, then billing order |
| Verify | Use the main agent or a supported runner; prefer a different known family, then billing order |
| Research | Require verified live-source access; prefer billing order |
| Bulk | Require a supported headless runner; prefer billing order, then verified input pricing for metered ties |
| Private | Require a verified runtime that keeps work on the user's machine |
| Fan-out | Assign only when a verified tool starts several children in one call |
| Long-context | Assign only when verified context capacity exceeds the main agent's; prefer the largest |

Billing order is local, free, subscription, then pay-per-token. Unknown rates require checking the provider; user selection order breaks remaining ties. Unknown capabilities cannot satisfy a role requirement. When a separate lane is unavailable, the main agent carries eligible jobs at the named tier; independent review and private work remain `none selected` unless their requirements are met. A fresh-context review in the author's family is a self-check. Record unavailable independent review and arrange it before release.

## Load the file for the job

- **Single-agent work:** [ORCHESTRATOR.md](rules/ORCHESTRATOR.md).
- **Choose a route:** [ROUTING.md](rules/ROUTING.md), then [DELEGATION_MATRIX.md](rules/DELEGATION_MATRIX.md) for capability and billing assignments.
- **Choose model and effort:** [TIERS.md](rules/TIERS.md); probe the live roster before each build and use high effort, or xhigh where supported for architecture, security or irreversible work.
- **Delegate to a CLI:** [CLI-RUN.md](rules/CLI-RUN.md); pass a filled [TASK_BRIEF.md](briefs/TASK_BRIEF.md) and shared [CONTEXT.md](briefs/CONTEXT.md).
- **Research:** [RESEARCH_TRIAGE.md](rules/RESEARCH_TRIAGE.md); bound independent questions and verify primary sources before accepting claims.
- **Build, merge and release:** [build-protocol.md](protocols/build-protocol.md); name the merger on split work and audit the final combined artifact once with a companion checking scope against the ask.
- **Verify completion:** fill [ACCEPTANCE_CHECKS.json](briefs/ACCEPTANCE_CHECKS.json), review and run its commands manually, and record the evidence using [acceptance-checks.md](protocols/acceptance-checks.md).
- **Record decisions:** fill [DECISIONS.md](briefs/DECISIONS.md); use the [protocol index](protocols/README.md) for other procedures.

## Use the bundled runner

In these commands, `<skill-dir>` is the absolute path to the configured project copy of this pack. Replace `<lane>` with an enabled supported ID. Run from the user's project so workers receive the intended project directory. Copy and fill `briefs/TASK_BRIEF.md` as `TASK_BRIEF.md` in that working directory, or pass the absolute path to your filled brief. The runner appends one line per call to a local log at `~/.ai-orchestrator/cli-run.log.jsonl` and, for Grok, reads that CLI's own session files under `~/.grok/sessions` to confirm the result. It makes no network calls of its own; each worker CLI keeps its own sign-in.

```bash
node <skill-dir>/bin/cli-run.mjs --doctor
node <skill-dir>/bin/cli-run.mjs <lane> --brief TASK_BRIEF.md --effort high
```

For a lane without an effort flag, omit `--effort` and choose its supported model settings directly. `--model` and `--effort` override requested defaults for one call; inspect vendor output to confirm actual execution. The unconfigured pack's doctor reports no executable lanes enabled and exits 13. After setup, require doctor exit 0 for selected binary presence. Run `--doctor --run` only when authorized to consume vendor quota.

When a call fails, read its exit class and evidence before choosing another action. Add `--expect-file <path>` or `--expect-json` when a response needs that shape; verify the task's acceptance checks separately even after exit 0. Preserve existing permissions, use authorized source paths in briefs and keep secrets out of prompts. For background work, check liveness and output growth every five minutes; two unchanged checks require diagnosis. Hand refused writes to an authorized writer and continue independent work.

## Optional companions and fallbacks

- **codecalc absent:** use the local runtime, tests, calculator or spreadsheet for consequential arithmetic and execution. Follow [numbers-and-logic.md](protocols/numbers-and-logic.md).
- **obsidian-tc absent:** use scoped project search, a folder index and version control; keep one writer and check for concurrent edits. Follow [memory-and-record.md](protocols/memory-and-record.md).
- **Context7 absent:** read current official documentation or installed source, then run the representative check locally. Follow [docs-then-prove.md](protocols/docs-then-prove.md).
