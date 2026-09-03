# ROUTING.md: the multi-lane decision tree

Primary agent (the orchestrator): **{{PRIMARY_NAME}}**. It routes, maps, builds, verifies and records. Every other AI is a lane it calls.

Your lanes:

{{LANES_TABLE}}

Two kinds of lane. **Lane A** = subscription CLIs: $0 marginal, already paid for, used for interactive and agentic work. **Lane B** = metered APIs: per token, used for programmatic bulk where a subscription CLI cannot serve. **Local** = stays on the machine; a privacy lane, never a cost lane.

Rule of thumb: never spend a frontier token on a task a cheap tier finishes correctly. Escalate on signal (low confidence, explicit complexity, a failed verification), not by default. And an external lane must earn the hop with a real strength; when in doubt, stay in-house.

## Decision tree (first match wins)

0. **Is there a cheaper or better external lane for this?** Check `DELEGATION_MATRIX.md`. The free tier for rough drafts and divergent reads; the cheapest metered lane for structured bulk (never for anything citing a line, number or source); the live-data CLI for X and web reads; the second-coder CLI for adversarial audits. Call every one of them through `bin/cli-run.js`.
1. **Bulk and mechanical?** → fast tier, or the free / cheapest-metered lane if the data may leave your machine. Many independent items each needing its own agent turn → a concurrent fan-out lane if you have one.
2. **Needs live data?** → the live-data CLI first ($0), then standard tier with web tools.
3. **Reviewing without changing?** → standard tier read-only. Security-critical → deep tier, or the second-coder CLI in audit (read-only) mode.
4. **Ambiguous, strategic, expensive to get wrong?** → deep tier (deep-planner). Then hand the plan down.
5. **Everything else that changes files** → the orchestrator builds it directly. Bounded sub-parts go to cheaper tiers; the main build is never handed off whole.

## Who builds

**The orchestrator owns the main build.** It is the only surface that holds these rules: a subagent or a second CLI starts with none of them and cannot route. Handing the main build to one hands it to something the router cannot reach.

Delegate: background and long-running tasks, small tasks, scoping, verification, research, bounded sub-parts. Never delegate: the main build, or any step that must carry a house rule (secrets handling, the loud-negative verification, the durable record).

Every delegation carries `TASK_BUNDLE.md`. Its brief must restate every convention the delegate needs.

## The Build Protocol, with lanes bound

| Stage | Binding |
|---|---|
| 0 Route | live probe for access; `cli-run` lanes are $0 and uncapped |
| 1 Map | the orchestrator sweeps; `cli-run codex` for adversarial critique of the map, `cli-run grok` to verify current API behaviour instead of trusting recall, `cli-run hermes` for a divergent read |
| 2 Judge | deep tier, on the finished map: a named risk and a named flaw |
| 3 Build | the orchestrator, against the installed dependency's source |
| 4 Scan | secret + static + dependency scanners, diff-scoped, fail closed |
| 5 Attack | security-shaped diff → `cli-run codex --audit` (read-only sandbox). Architecture-shaped → deep tier, build against plan. Never both |
| 5b Ship | rollback id recorded, explicit human yes |
| 6 Verify | real test, negative test seen red, old identifier re-grepped to zero |
| 7 Record | one end-to-end doc, tracker Done with evidence, plan doc deleted |

Caps: two deep-tier checkpoints per build. CLI lanes are $0 and do not count.

## Numbers and logic

Every number, comparison, complexity or equivalence claim goes through a tool that computes (`protocols/numbers-and-logic.md`; companion: codecalc, {{CODECALC_STATUS}}). A lane's figure is re-derived before it is repeated: the cheapest metered lane measured 0 of 11 line citations correct while its conclusions were right.

## Modifier rules

- **Plan big, execute small**, within a build: deep tier plans at Checkpoint 1, the orchestrator executes, bulk and wide searches go down.
- **Escalation:** never silently retry at the same tier. Escalate one tier or consult deep once, and say which. Two consults that do not unstick it → stop and tell the human.
- **De-escalation:** a request that sounds deep but is a lookup routes down.
- **Long context:** mechanical digestion → fast tier in chunks; judgment over a long input → standard tier.
- **Token discipline on every delegation:** pass only the context the delegate needs, never the conversation.
- **Effort per agent:** deep xhigh, review and build high, live research medium, bulk low.

## Example routings

| Task | Route |
|---|---|
| "Design the architecture for X" | deep-planner |
| "What is trending on X today" | `cli-run grok` |
| "Review this service for bugs" | code-reviewer |
| "Audit this auth diff" | `cli-run codex --audit` |
| "Classify these 200 items" | bulk-worker, or `cli-run qwen` if the items may leave the machine |
| "Add an endpoint" | the orchestrator builds it |
| "Why does this silently drop rows sometimes" | deep-planner (unknown cause), then build the fix directly |
| "Summarize these 30 notes into one index" | bulk-worker |
| "Research this topic properly" | three engines in parallel, see `RESEARCH_TRIAGE.md` |
