# ORCHESTRATOR.md: model routing inside one agent

## Your stack: who does what

| Role | Tool and model | Selection evidence |
|---|---|---|
| Fill at setup: plan, build, review, verify, research, bulk, read, private | Fill at setup: verified user tools and current models, or none selected | Fill at setup: reach, family, permissions, billing and capacity |

Use SKILL.md first-run setup to fill this table from the user's real tools.

Main agent: **Fill at setup: the user's main agent**. When work arrives, match it to a capability tier and the tools available in this session. A **tier** describes a model's capability and cost. A **lane** is an AI tool or model you can hand work to.

## Choose the tier for the job

| Tier | Use for | On Fill at setup: the user's main agent |
|---|---|---|
| planning model | ambiguity, architecture, strategy and unknown causes | Fill at setup: current planning model and supported effort |
| working model | code writing, review, execution and research synthesis | Fill at setup: current working model and supported effort |
| cheap model | classification, extraction, formatting and bulk summaries | Fill at setup: current cheap model and supported effort |

When routing, select capability, context size and effort together. Use a cheap model for bounded volume and a planning model when the decision requires it. For builds, check the live model roster and use high effort; raise to xhigh where supported for architecture, security or irreversible work.

## Decision tree (first match wins)

1. **Bulk or mechanical:** classify, tag, extract, rename or reformat -> cheap model tier.
2. **Read many files:** use Fill at setup: reader with enough context and source access; read the scoped sources and return the requested digest.
3. **Current data:** use live tools with a working model.
4. **Review code:** use Fill at setup: reviewer from a known different model family, or report independent review pending in a fresh context, or an independent working model with read-only scope enforced by its prompt; Bash access remains a separate tool grant.
5. **Verify findings:** reproduce each claim before a repair.
6. **Check a definition of done:** probe its named artifact and report MET, NOT_MET or UNVERIFIABLE.
7. **Ambiguity or architecture:** use a planning model and return an executable plan.
8. **Build:** use the working model with high effort where supported; verify write reach and acceptance checks first.

When a route fails, diagnose the cause and state the next choice. When the task is a lookup, route down. Keep small lookups local when dispatch adds no useful reach or capacity.

## Build from a shared context

When building, follow `../protocols/build-protocol.md`: freeze acceptance checks, probe availability, spike risky assumptions, order dependencies, research bounded questions, write one context file, and assign by live capability. Then build, merge split work, audit once with a companion consult asking a different question, and verify the authorized change in use.

When a background task runs, check liveness and output growth every five minutes. After two checks without growth, diagnose and report. When a boundary refuses a write, hand that patch to an authorized writer and continue independent work.

When the workflow needs an independent reviewer unavailable to this session, report the audit as pending and arrange a separate review before shipping.

## Hand off a complete task brief

Before delegating, probe whether the worker loads project rules; supply any missing instructions explicitly. When handing off work, use `../briefs/TASK_BRIEF.md`: include the user's ask, context file, exact scope, non-goals, interfaces, capabilities, denied actions, acceptance checks, inventory, measurements and coverage-table report contract. Actions outside the granted scope are denied.

## Tools and fallbacks

- When a number or logical claim affects a decision, compute it with a tool. codecalc: optional, verify availability at setup; otherwise use the local runtime, spreadsheet or tests. When absent, use the local runtime, spreadsheet or tests. See `../protocols/numbers-and-logic.md`.
- When recording durable information, search first, update its index and keep one writer. obsidian-tc: optional, verify availability at setup; otherwise use project files, search and version control. When absent, use project files and version control. See `../protocols/memory-and-record.md`.
- When writing against a changing interface, read current docs and run a check. Context7: optional, verify availability at setup; otherwise read official docs or installed source. When absent, use official docs or installed source; when codecalc is absent, use the project's runtime. See `../protocols/docs-then-prove.md`.

## Workflow files

When beginning a build, copy briefs/CONTEXT.md and briefs/ACCEPTANCE_CHECKS.json, fill their fields and run each approved verifier with the project runtime. Record decisions in `../briefs/DECISIONS.md`. Use `../protocols/README.md` to find the procedure for a rename, research task, record update or coverage check.

## Add another AI tool

When a task needs another model family, tool reach or capacity, use the intermediate pack and fill its stack table from verified tools. Verify that lane's access before assigning work.
## Loading the rules

Fill at setup: name the project instruction file or session-loading procedure that reads these rules. Verify it in a fresh session; this pack installs no hooks.
