# TIERS.md: capability tiers and the three cost levers

The router routes by capability tier, not model name. Each tier maps to a family alias where the vendor offers one, so a routine version bump needs no file change.

| Tier | Purpose | On {{PRIMARY_NAME}} |
|---|---|---|
| deep | ambiguous planning, architecture, strategy, hard debugging | {{PRIMARY_DEEP}} |
| standard | code writing, code review, execution, live research synthesis | {{PRIMARY_STANDARD}} |
| fast | classification, extraction, formatting, bulk summarization | {{PRIMARY_FAST}} |
| escalation | above deep: only when the human asks, or when deep has already run, the call is still unresolved, and the change is irreversible | your vendor's strongest model, if you have one |

Non-primary lanes are owned by `DELEGATION_MATRIX.md`.

## Effort per agent (the third lever)

Tier sets the price per token. Token discipline sets how many tokens. **Effort sets how hard each call thinks.**

| Agent | Tier | Effort | Why |
|---|---|---|---|
| deep-planner | deep | xhigh | judges every build twice; expensive to get wrong |
| code-reviewer | standard | high | every endpoint is internet-facing |
| builder | standard | high | a botched deploy is the costly failure |
| live-researcher | standard | medium | tools do the retrieval |
| bulk-worker | fast | low | the biggest cost win |

Dials: drop builder to medium when the plan is airtight; raise code-reviewer to xhigh for a security-critical audit.

## Why split tiers: robustness first, cost second

The split produces better work. The deep tier steers every build twice, and what it steers is **judgment, never retrieval**: the orchestrator sweeps the blast radius itself and hands the deep tier a finished map. Paying deep-tier rates for a file list is the most expensive routing mistake available.

Against a baseline of "standard tier with no consults", default checkpoints are a spend increase. That is the accepted trade, not a saving to claim.

## Escalation above deep

Fires on exactly two conditions: (a) the human asks for it directly; or (b) all three of: deep has already run on this task, the decision is still unresolved, and the change is irreversible or rewrites a standing rule. (b) is a conjunction, not a mood. A failed attempt is an escalation-ladder event; a hard problem is a deep-tier event; neither reaches the top model alone. It replaces the second deep consult, never adds a third. Say so whenever it fires.

## Slotting a new model

1. Newer version of an existing family: same tier; aliases pick it up.
2. New family above your deep model: candidate for deep. Confirm with the human before touching agent files.
3. New family between tiers: slot by the vendor's own positioning; confirm if it would change who handles a task type.
4. New cheap family below fast: candidate for fast if quality holds.
5. Deprecation notice on a slotted model: move the tier immediately and note it here.
