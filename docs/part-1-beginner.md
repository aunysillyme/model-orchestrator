# Part 1: route work inside one agent

Start with the agent or chat app you already use. The installer gives it task classes, model tiers and checks it can apply before calling another tool.

## Choose a tier for the job

| Tier | Job | Effort guidance |
|---|---|---|
| Planning model | Ambiguous requirements, architecture and root-cause analysis | Increase reasoning for the unresolved decisions |
| Working model | Build a scoped change, review code, synthesize research | Match effort to complexity and consequences |
| Cheap model | Classify, extract, format and digest many files | Keep routine work bounded |

Map tiers to the models your agent actually exposes. With a chat app, use the same categories to decide whether the next turn needs a plan, an execution step or a short structured answer.

Role selects the job. Complexity sets effort. Security, privacy, data loss and irreversible changes affect which model and reviewer can safely handle it. Check the current tool and model roster before deciding.

## Classify a task

The installed decision tree covers bulk work, reading many files, live data, review, verification of findings, definition-of-done checks, ambiguous planning and builds. `aunx route "rename this file"` gives a keyword-based suggestion; the agent applies the full rules to the task's context.

When a worker fails, inspect the evidence and choose the next action explicitly. A reproducible problem can justify a stronger model or more capable tools. A simple lookup belongs with a reader or a direct tool call.

## Build from checks to verified use

The build protocol starts by quoting the request and assigning acceptance checks. It probes available tools, tests uncertain assumptions, orders work by dependencies and collects one context file. An Assign step chooses the worker by reasoning fit, permissions, context capacity and headroom.

After the build, an independent reviewer checks the final merged artifact. A companion reviewer checks the scope against the original ask in the same audit step. Findings get reproduced before repair, and each fix gets a regression that can fail. Release means the change is in use on named surfaces, with live behavior checked and a rollback identified.

The mechanical audit-skip conditions are documented in `protocols/build-protocol.md`. They are evaluated together against the diff. The process uses one audit pass, with regression checks for its fixes.

## Give each worker a task brief

```bash
aunx context CONTEXT.md
aunx brief new TASK_BRIEF.md
aunx checks ACCEPTANCE_CHECKS.json
```

The context file carries verified facts once. The task brief quotes the ask and names scope, files, non-goals, interfaces to preserve, available and missing tools, checks, measurements, order of work and a coverage-table report. A worker gets the same task boundaries whether it is a subagent or a separate CLI.

Claude Code subagents load the project's instruction hierarchy. A separate CLI or chat window may need those instructions supplied explicitly. Probe what the worker receives and include the missing context.

## Compute, record and verify with your tools

- **Numbers:** use a calculator or execution tool for figures someone will act on. codecalc is an optional companion.
- **Notes:** search before writing, keep the index accurate and use one writer. A notes folder works; obsidian-tc adds search and controlled writes.
- **APIs:** read current official documentation and test the call. Context7 can retrieve the documentation when available.
- **Decisions:** record Did / Why / Serves / Rejected when choosing between approaches. Keep evidence and operational consequences in the record.

Every protocol names the fallback when its optional companion is absent. [Companion setup](companions.md).

## What the installer gives you at this level

- **Rules:** `ORCHESTRATOR.md` and the loading surface for your main agent.
- **Briefs:** `TASK_BRIEF.md`, a context-file template and acceptance-check template.
- **Protocols:** building, context, acceptance checks, decisions, propagation, gap analysis, research, calculation, notes and documentation verification.
- **Optional tools:** setup guides and MCP snippets only for companions you select.

## Add a second model family

When a task would benefit from another model's review or a CLI with different tools, move to [Part 2](part-2-intermediate.md).
