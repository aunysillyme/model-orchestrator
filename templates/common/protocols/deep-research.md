# Deep research: parallel engines, then triage

Two research lanes, not three. The old "quick fact / known source / deep" split was ceremony.

| Lane | Entry condition | Output |
|---|---|---|
| **Search** | You can name the source, or one lookup answers it | Inline answer, no artifact |
| **Deep** | All three: the source set is unknown, several sources must be reconciled, and the output must survive being cited later | A dated, cited artifact |

## The shape of a deep run

```
0 CHARTER   what topics, what counts as a source, what is worth interrupting a human for
1 PLAN      decompose into sub-questions   <- highest leverage stage; a mis-scoped question
                                              produces a confident report about the wrong thing
2 RUN       fan out to independent engines
3 TRIAGE    reconcile disagreement against primary sources you open yourself
4 DEDUPE    check what you already have BEFORE writing (semantic search; see memory-and-record.md)
5 BRIEF     one dated artifact with marks (below)
6 ROUTE     adopt / prototype / watch / pass / no action
```

## Marks every claim carries

- **CONFIRMED**: at least two independent engines agreed AND you opened the primary source.
- **DISAGREEMENT**: engines conflicted. Record the verdict and the rejected reading. Never average.
- **REPORTED**: a named person's post, a forum thread, a tool's self-report. Quoted, not trusted.
- **UNVERIFIED**: plausible, single-source, or unsourced precision. Do not cite as fact.

Agreement is weak evidence. Disagreement is the signal.

## Level 1: one agent

You still get the shape. Run PLAN as its own turn and inspect it before spending anything. Run the sweep. Then run a **fresh-context adversarial turn** with a brief that says "attack the premise; list what this report would get wrong if its sources were stale". Plant one deliberately wrong figure in the brief and see whether it corrects it: if it does not, its confirmations are worth less than they look. Mark every claim.

## Level 2 and up: three engines, one triager

Fan out the same PLAN to three different model families through their CLIs (a web-sweep lane, an adversarial-read lane, a live-data lane). Run them through `cli-run` so a run that produced nothing is caught as `rc=10` rather than read as an empty finding. The orchestrator triages: it opens the primary sources itself, marks each claim, and writes the brief. Only the orchestrator writes the durable record; every other engine proposes.

Known failure shape: one engine will return confident unsourced numerics and claim full coverage. Downgrade those to hypothesis. The engines that report their own gaps honestly are the ones to weight.

## Measure

Count **dispositions**, not briefs. A week that produced seven briefs and zero decisions is a failure.
