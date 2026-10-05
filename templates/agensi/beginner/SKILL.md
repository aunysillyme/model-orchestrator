---
name: model-router-beginner
description: "Model routing inside one agent: choose which model for which task, match reasoning effort to complexity, and control token cost. Use with Claude Code, Codex, Cursor or Gemini CLI for planning, builds, reading, review and verified completion. Includes task briefs and protocols; no installer required."
---

# Model router: beginner

Use this pack to route work inside the AI agent the user already has. Start with [ORCHESTRATOR.md](rules/ORCHESTRATOR.md); the remaining files supply task briefs and procedures. The pack needs no npm installation.

## First-run setup in the user's project

1. **Ask and probe:** ask which AI tools and subscriptions the user has, which agent coordinates the project, and where to put project copies (default `ai-orchestrator/`). Inspect the current session's tools, available models, supported effort settings, context capacity and permissions. Confirm any facts the runtime cannot expose with the user; mark unknown capabilities UNVERIFIED.
2. **Copy:** create the chosen folder inside the project. Copy `rules/`, `briefs/` and `protocols/` from this pack, retaining their layout. Preserve existing user edits and ask before replacing them. Apply the following setup steps to these project copies.
3. **Fill:** replace every `Fill at setup` instruction in the copies with the user's verified tool and model names, role assignments and reasons. Fill the main-agent name, stack summary, planning/working/cheap models, reader and reviewer roles, companion status and project loading instructions. Record unavailable roles as `none selected`; retain UNVERIFIED for facts without evidence.
4. **Select:** use the rules below. Choose models from the live roster, with planning models for ambiguity and architecture, working models for scoped builds and synthesis, and cheap models for bounded extraction or formatting. A model name alone does not establish its access or capability.
5. **Load:** load the filled `rules/ORCHESTRATOR.md` in the main agent's project instructions using its supported project loading surface. If the agent cannot load files automatically, read that file at the start of each task. Verify which instructions it receives before relying on them.

## Assign from the user's real stack

| Role | Selection rule |
|---|---|
| Plan and read | Prefer the main agent; require enough context for the scoped sources |
| Build | Require authorized file writes and tools to run acceptance checks |
| Current data | Require verified live-source access; otherwise report the missing access |
| Review | Require a known model family different from the author for independent review |
| Verify | Probe findings and the definition of done with available tools; prefer a different known family when available |
| Bulk | Use the cheapest capable model for a bounded transformation |
| Private | Require a verified local runtime and the user's required data boundary |

When a separate route is unavailable, the main agent carries eligible jobs at the named tier. Independent review and private work remain `none selected` unless their requirements are met. A fresh-context review in the author's family is a self-check; record that limitation and arrange required independent review before release. Unknown family does not establish independence.

When role candidates tie, prefer local, free, subscription, then pay-per-token billing. Check provider rates and quota before a consequential cost choice. Choose role, complexity, context capacity, effort and tools together; record the reason when escalating after a failure.

## Load the file for the job

- **Route a task:** read the project's filled [ORCHESTRATOR.md](rules/ORCHESTRATOR.md).
- **Begin a build:** read [build-protocol.md](protocols/build-protocol.md); quote the ask, probe availability, freeze checks and collect one context file before assigning work.
- **Share verified facts:** copy and fill [CONTEXT.md](briefs/CONTEXT.md) using [context-file.md](protocols/context-file.md).
- **Hand off work:** copy and fill [TASK_BRIEF.md](briefs/TASK_BRIEF.md); include scope, interfaces, denied actions, checks and what the worker has and lacks.
- **Check completion:** copy and fill [ACCEPTANCE_CHECKS.json](briefs/ACCEPTANCE_CHECKS.json); run its reviewed commands through the project's runtime and record pass, fail or unverified evidence. Follow [acceptance-checks.md](protocols/acceptance-checks.md).
- **Record a choice:** copy and fill [DECISIONS.md](briefs/DECISIONS.md) with Did / Why / Serves / Rejected and evidence.
- **Find another procedure:** read the [protocol index](protocols/README.md) for research, renames, coverage and durable records.

When building, use one audit step on the final artifact with a companion checking scope against the ask. Reproduce findings before repair and demonstrate each repair's regression can fail. Verify the authorized change in use and name its rollback and operational record.

## Optional companions and fallbacks

- **codecalc absent:** compute consequential figures and execute checks with the local runtime, tests, calculator or spreadsheet. Follow [numbers-and-logic.md](protocols/numbers-and-logic.md).
- **obsidian-tc absent:** use scoped project search, a folder index and version control; keep one writer and check for concurrent changes. Follow [memory-and-record.md](protocols/memory-and-record.md).
- **Context7 absent:** read current official documentation or installed source, then verify on the project's runtime. Follow [docs-then-prove.md](protocols/docs-then-prove.md).

When another model family or CLI offers needed reach, use the intermediate pack and verify its availability before delegation.
