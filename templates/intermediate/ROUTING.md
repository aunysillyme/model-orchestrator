# ROUTING.md: the multi-lane decision tree

Primary agent (the orchestrator): **{{PRIMARY_NAME}}**. It routes, maps, builds, verifies and records. Every other AI is a lane it calls.

Your lanes:

{{LANES_TABLE}}

Two kinds of lane. **Lane A** = subscription CLIs: $0 marginal, already paid for, used for interactive and agentic work. **Lane B** = metered APIs: per token, used for programmatic bulk where a subscription CLI cannot serve. **Local** = stays on the machine; a privacy lane, never a cost lane.

Rule of thumb: never spend a frontier token on a task a cheap tier finishes correctly. Escalate on signal (low confidence, explicit complexity, a failed verification), not by default. And an external lane must earn the hop with a real strength; when in doubt, stay in-house.

## Decision tree (first match wins)

0. **Is there a cheaper or better external lane for this?** Check `DELEGATION_MATRIX.md`. Your enabled lanes, every one called through `bin/cli-run.mjs`:
{{LANE_STEP0}}
1. **Bulk and mechanical?** → fast tier{{BULK_LANE}}. Many independent items each needing its own agent turn → a concurrent fan-out lane if you have one.
1a. **Reading or digesting many files or notes, not writing?** → reader. Different from a bulk pass: reader reports, it does not classify, tag or transform.
2. **Needs live data?** → {{LIVE_LANE}} standard tier with web tools.
3. **Reviewing without changing?** → standard tier read-only. Security-critical → {{ATTACK_LANE}}.
3a. **Holding findings from a review or a scanner?** → finding-verifier before any of them cause a repair. A finding is a claim, not a fact.
3b. **Checking a tracker item or task against its stated done-signal?** → done-verifier. It probes the named artifact and returns MET, NOT_MET or UNVERIFIABLE; it never closes anything itself.
4. **Ambiguous, strategic, expensive to get wrong?** → deep tier (deep-planner). Then hand the plan down.
{{DECISION_RULE5}}

{{WHO_BUILDS}}

## The Build Protocol, with lanes bound

| Stage | Binding |
|---|---|
| 0 Route | live probe for access; `cli-run` lanes are $0 and uncapped |
| 1 Map | the orchestrator sweeps{{STAGE1_LANES}} |
| 2 Judge | deep tier, on the finished map: a named risk and a named flaw |
| 3 Build | the orchestrator, against the installed dependency's source |
| 4 Scan | secret + static + dependency scanners, diff-scoped, fail closed |
| 5 Attack | security-shaped diff → {{ATTACK_LANE}}. Architecture-shaped → deep tier, build against plan. Never both |
| 5a Verify findings | finding-verifier, a different model family where you have one: CONFIRMED, NOT_REPRODUCED or INCONCLUSIVE per finding. Only CONFIRMED earns a repair |
| 5b Ship | rollback id recorded, explicit human yes |
| 6 Verify | real test, negative test seen red, old identifier re-grepped to zero |
| 7 Record | one end-to-end doc, tracker Done with evidence, plan doc deleted |

Caps: two deep-tier checkpoints per build. CLI lanes are $0 and do not count.

## Numbers and logic

Every number, comparison, complexity or equivalence claim goes through a tool that computes (`protocols/numbers-and-logic.md`; companion: codecalc, {{CODECALC_STATUS}}). A lane's figure is re-derived before it is repeated: the cheapest metered lane measured 0 of 11 line citations correct while its conclusions were right.

## Memory and record

One writer per run; every other lane proposes. Search before writing, index in the same pass (`protocols/memory-and-record.md`; companion, optional: obsidian-tc, {{OBSIDIAN_TC_STATUS}}).

## Modifier rules

- **Plan big, execute small**, within a build: deep tier plans at Checkpoint 1, the orchestrator executes, bulk and wide searches go down.{{INLINE_THRESHOLD_NOTE}}
- **Escalation:** never silently retry at the same tier. Escalate one tier or consult deep once, and say which. Two consults that do not unstick it → stop and tell the human.
- **De-escalation:** a request that sounds deep but is a lookup routes down.
- **Long context:** mechanical digestion → fast tier in chunks; judgment over a long input → standard tier.
- **Token discipline on every delegation:** pass only the context the delegate needs, never the conversation.
- **Effort per agent:** deep xhigh, review, verification and build high, live research medium, bulk low.
- **Three inputs, not one:** role picks the agent, complexity moves the effort, risk moves the tier and who reads it. A one-line auth change is simple and high-risk at once, and the risk decides. See `TIERS.md`.
- **Pin the route when it matters:** a lane with no `--model`/`--effort` and no `defaults` entry in `bin/lanes.json` runs on its own config, which may be nothing like what this file describes. `cli-run --doctor` prints what each lane is pinned to, and every run logs the value requested and where it came from.

## Example routings

| Task | Route |
|---|---|
| "Design the architecture for X" | deep-planner |
| "Review this service for bugs" | code-reviewer |
{{ADD_ENDPOINT_ROW}}
| "Why does this silently drop rows sometimes" | deep-planner (unknown cause), then build the fix directly |
| "Summarize these 30 notes into one index" | bulk-worker |
| "Read every note in this folder and pull out every mention of X" | reader |
| "The audit returned 6 findings" | finding-verifier first; repair only what comes back CONFIRMED |
| "Is issue #123 actually done" | done-verifier |
{{LANE_EXAMPLES}}
{{ROUTE_GATE_SECTION}}
