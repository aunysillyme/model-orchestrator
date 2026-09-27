# Part 2: delegate across your AI CLIs

Keep one main agent coordinating the work. Each other AI is a **lane**: a CLI or model the main agent can call with a scoped task brief.

## Subscription lanes, pay-per-token lanes and local models

- **Subscription lanes:** use the tools and quota included in your vendor plan. Check that plan's current limits before assigning volume.
- **Pay-per-token lanes:** use metered APIs for programmatic work, with an explicit budget and model choice.
- **Local models:** keep private input on your machine when the task requires that boundary.

The generated delegation matrix describes the tools you selected. Check current model names, permissions and tool reach before assigning a section. Another tool earns a handoff when its capabilities serve the job.

## Lane runner (`aunx cli-run`)

```bash
aunx cli-run --doctor
# Direct form from the installed rules folder:
node bin/cli-run.mjs --doctor
aunx cli-run codex --brief TASK_BRIEF.md --effort high
# Direct form: node bin/cli-run.mjs codex --brief TASK_BRIEF.md --effort high
```

`cli-run` reads each vendor's terminal result and returns nonzero when the response is missing, interrupted, timed out or rejected by an output contract. It distinguishes authentication, quota and unavailable-tool failures so the next action can address the cause. Use `--expect-file` or `--expect-json` when your task needs a specific output shape.

`--model` and `--effort` set a request for one call. `defaults` in `bin/lanes.json` supplies per-tool defaults. The local log records requested values and their source; the vendor's own output is the place to confirm actual model execution.

## Plans and automatic effort

`--plans codex=pro-20x,agy=ultra-5x` records plan headroom for volume allocation. Capability and independent review still follow the task and available tools. `--effort-auto` opts eligible high-headroom tools into the runner's prompt-size heuristic. Explicitly choose higher effort for security or irreversible work when the heuristic is insufficient. [Runner reference](../bin/README.md).

## Task brief (`aunx brief`)

Each worker reads the shared context file and a brief naming the whole build, its own section, permissions, non-goals, interfaces to preserve and acceptance commands. On a split build, identify who merges and require conflicts to be named before the audit of the final combined result.

When a requested write is refused by the worker's sandbox, hand that exact file change to an authorized writer and continue independent work. For a background call, arrange a heartbeat; the protocol defines when unchanged output requires investigation.

## Review and verify

Use one audit step. One reviewer checks build against scope; a companion reviewer checks scope against the user's request at the same time. Prefer different model families from the author. If an independent reviewer is unavailable, record that limitation and arrange the required review before release.

`finding-verifier` tries to reproduce each claim. `done-verifier` probes the named definition of done. Repairs follow confirmed findings and each fix gets a regression that is demonstrated to fail before the fix.

## Research and shared notes

Give independent research questions to tools that can answer them, then inspect primary sources before accepting the claims. Compute consequential figures independently. Use one writer for the final shared record.

Optional companions can help: codecalc for execution and calculations, obsidian-tc for searchable notes, Context7 for current library docs. Without them, use the runtime, notes and official documentation already available to your agent.

## Measure your own routing

`aunx route-metrics --summary` reads your local Claude Code routing log. It reports where work went, route-marker coverage and subagent durations. Your own measurements are the basis for changing assignments and checking whether the rules are being followed.

## What the installer gives you at this level

Everything from [Part 1](part-1-beginner.md), plus `ROUTING.md`, `TIERS.md`, `DELEGATION_MATRIX.md`, `RESEARCH_TRIAGE.md`, `CLI-RUN.md`, `bin/cli-run.mjs` and `bin/lanes.json`.

## Run scheduled work

When the setup needs an always-on host or scheduled review, move to [Part 3](part-3-advanced.md).
