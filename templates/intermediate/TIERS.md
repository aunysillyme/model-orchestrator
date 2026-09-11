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
| finding-verifier | standard | high | judging a claim is harder than producing it |
| builder | standard | high | a botched deploy is the costly failure |
| live-researcher | standard | medium | tools do the retrieval |
| bulk-worker | fast | low | the biggest cost win |
| done-verifier | fast | low | a done-signal check is a lookup, not a judgment call |
| reader | fast | low | digestion, not judgment |

## Three inputs, not one

Role alone does not decide a route. Two more inputs move it, and they move it in
opposite directions, so state them separately instead of folding them into the
role.

**Complexity moves the effort.** The same role does not need the same reasoning
on every task.

| Complexity | What it looks like | What moves |
|---|---|---|
| simple | one file, one obvious edit, no unknowns | drop one effort level |
| standard | the default | the table above |
| complex | several surfaces, or an unknown cause | keep effort, add the deep-tier checkpoint |
| critical | irreversible, or it rewrites a standing rule | the escalation rule below applies |

The dial that pays for itself: **a worker executing a finished plan needs less
reasoning than the reviewer judging its output.** When the plan is airtight the
spec is carrying the thinking, so builder drops to medium. When the plan is
vague, fix the plan; do not buy reasoning to paper over it.

**Stakes move the tier and the reader, never just the effort.** These four are
the ones worth naming, because their failures are not recoverable by editing the
code afterwards.

Stakes means what a mistake would cost: a security hole, leaked personal data,
lost data, or something you can't undo. Most tasks are low-stakes and route
normally.

| Stakes | Present when the change touches | What it buys |
|---|---|---|
| security | auth, tokens, sessions, routes, untrusted input | the challenge pass, ideally a different model family |
| privacy | personal data, anything leaving the machine | the local lane, and a named check on what is sent |
| data loss | deletion, bulk mutation, migrations, overwrites | a reviewed rollback path before the change is written |
| irreversible | publishing, sending, rotating, anything with an audience | a human yes at Stage 5b, never an agent's |

High stakes raise code-reviewer to xhigh, and a security-shaped diff goes to
the challenge lane rather than to a second read by the same family. Stakes are
not a synonym for difficulty: a one-line change to an auth check is simple and
high-stakes at the same time, and it is the stakes that decide the route.

**Reserve the top of the ladder for evidence.** xhigh and the escalation tier are
bought with a named reason: a reproduced failure, a checkpoint that came back
unresolved, an irreversible change. A task that merely feels hard is a deep-tier
task, not an escalation.

## Why split tiers: robustness first, cost second

The split produces better work. The deep tier steers every build twice, and what it steers is **judgment, never retrieval**: the orchestrator sweeps everything it touches itself and hands the deep tier a finished map. Paying deep-tier rates for a file list is the most expensive routing mistake available.

Against a baseline of "standard tier with no consults", default checkpoints are a spend increase. That is the accepted trade, not a saving to claim.

## Escalation above deep

Fires on exactly two conditions: (a) the human asks for it directly; or (b) all three of: deep has already run on this task, the decision is still unresolved, and the change is irreversible or rewrites a standing rule. (b) is a conjunction, not a mood. A failed attempt is an escalation-ladder event; a hard problem is a deep-tier event; neither reaches the top model alone. It replaces the second deep consult, never adds a third. Say so whenever it fires.

## Slotting a new model

1. Newer version of an existing family: same tier; aliases pick it up.
2. New family above your deep model: candidate for deep. Confirm with the human before touching agent files.
3. New family between tiers: slot by the vendor's own positioning; confirm if it would change who handles a task type.
4. New cheap family below fast: candidate for fast if quality holds.
5. Deprecation notice on a slotted model: move the tier immediately and note it here.
