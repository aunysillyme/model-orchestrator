# ORCHESTRATOR.md: routing rules for one agent

Primary agent: **{{PRIMARY_NAME}}**. Everything below runs inside that one agent. You do not need a second vendor to orchestrate; you need tiers, task classes, and gates that can fail.

## Tiers (capability, not model names)

| Tier | Use for | On {{PRIMARY_NAME}} |
|---|---|---|
| **deep** | ambiguous planning, architecture, strategy, root-cause debugging, anything expensive to get wrong | {{PRIMARY_DEEP}}, highest effort |
| **standard** | code writing, code review, execution of a known plan, research synthesis | {{PRIMARY_STANDARD}}, high effort |
| **fast** | classification, extraction, formatting, bulk summarization | {{PRIMARY_FAST}}, low effort |

Three cost levers, always together: **tier** sets the price per token, **token discipline** sets how many tokens (read only what you will touch, never re-read, deliverables not narration), **effort** sets how hard each call thinks.

Robustness first, cost second. Split tiers because the split produces better work, not because it is cheaper. Cost is a constraint to respect, never the reason for a routing choice.

## Decision tree (first match wins)

1. **Bulk and mechanical?** classify, tag, extract, reformat, summarize many similar items → fast tier.
2. **Needs live data?** trends, current docs, pricing, recent events → standard tier with tools; freshness comes from tools, not from a bigger model.
3. **Reviewing without changing?** → standard tier, read-only, findings ranked by severity. Escalate to deep only for security-critical review.
4. **Ambiguous, strategic, or expensive to get wrong?** "design my…", "figure out…", unknown cause → deep tier. Then hand the plan down.
5. **Everything else that changes files or executes a known plan** → you build it directly, at standard tier. The main build is never handed off whole; bounded sub-parts (a bulk pass, a wide search, a long audit loop) can go to cheaper tiers.

Modifiers:
- **Plan big, execute small.** The expensive tier steers, the cheaper tier does the volume. Never make the fast tier design anything; never make the deep tier grind out bulk output.
- **Never silently retry at the same tier after a failure.** Escalate one tier, or consult the deep tier once, and say which you did. If two consults do not unstick it, stop and tell the human.
- **De-escalate.** If a request sounds deep but is a lookup or a small edit, route down. Default down, escalate on evidence.

## The two checkpoints (every build)

- **Checkpoint 1, before writing anything.** You map the blast radius yourself (files, systems, docs, tickets). Then ask the deep tier, on the finished map: *is this the simplest way, what is the single biggest risk, where is the request as filed wrong?* It must return a named risk and a named flaw. Approval alone is not an answer.
- **Checkpoint 2, after the build is green.** Security-shaped diffs get an adversarial read (in a fresh context, told to attack, allowed to answer CLEAN). Architecture-shaped diffs get the deep tier reviewing build against plan. Never both on one diff. Every finding reproduced before it reaches a human.

Cap: two deep-tier consults per build. The full procedure is `protocols/build-protocol.md`.

## Delegating inside one agent

Subagents, a fresh chat, a second window: each one holds none of these rules. Every hand-off carries a `TASK_BUNDLE.md` brief: purpose, task class, granted scope, capabilities, denied actions, conventions it does not have, report contract, exit parameters. Absence is denial.

## Numbers and logic go through a tool, never your head

Any figure someone will act on, any comparison you state, any complexity, equivalence or speedup claim: computed, not estimated. `protocols/numbers-and-logic.md` names when calling is mandatory. Companion tool: codecalc ({{CODECALC_STATUS}}).

## Memory and record

Anything durable is searched for before it is written, its folder index is corrected in the same pass, and one writer records. `protocols/memory-and-record.md`. Companion tool (optional, needs an Obsidian vault): obsidian-tc, {{OBSIDIAN_TC_STATUS}}.

## The six protocols

`protocols/build-protocol.md` · `protocols/propagate.md` · `protocols/gap-analysis.md` · `protocols/deep-research.md` · `protocols/numbers-and-logic.md` · `protocols/memory-and-record.md`. Each is a set of questions that can be answered wrong. That is the design, not a flaw.

## When you outgrow this

You will know: you keep wanting a second model family to read your diff, a $0 lane for bulk, or a live-data lane your primary does not have. That is level 2. Re-run the installer with `--level 2`.
