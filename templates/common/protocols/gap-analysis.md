# Gap analysis: the second pass

**On any comprehensive task, run a second pass that hunts for what is MISSING, not just verifies what is there.** Comprehensive means research, audits, plans, builds, and multi-file work.

Verification asks "is what I did correct?". Gap analysis asks "what did I not do?". They are different questions and the second one is the one a first pass cannot answer about itself.

## The shape

1. **Enumerate what exists.** The live state, not the plan: files written, tests present, lanes configured, jobs scheduled, sources consulted.
2. **Diff it against the ask and the map.** Every clause of the original request maps to at least one thing you did. Every item on the Stage 1 map maps to a change. A clause with no step is dropped scope; a step with no clause is invented scope. Say both.
3. **Hunt the absences.** For each category: what would a reader expect to find here that is not here? What does the source say that the output does not? What fails if a dependency is down?
4. **Report the gaps as findings**, not as apologies. Each one: what is missing, where it should be, and whether you are closing it now or naming it as open.

## Who runs it

- **Level 1 (one agent):** the same agent, in a fresh turn, with a brief that says "you are looking for what is missing; do not re-verify what is present". Fresh context matters more than a different model.
- **Level 2 and up:** a **different model family** reading the same artifact. Disagreement between two families is the cheapest available signal that something is soft. The adversarial coder lane (a second-opinion CLI in read-only mode) is the natural fit.
- **Level 3:** make it recurring. A weekly audit job enumerates live state (lanes, jobs, services, model lists), diffs it against the plan, and files a report. It catches the dead lane and the silently renamed model nobody noticed.

## The second half: analyze, compare, suggest

Once the gaps are named, for each lane or component: what does it give, is there a cheaper, better or faster alternative, and what is the best paid option beside the free default. Parked is fine; unshown is not.

## Anti-patterns

- Treating a green test suite as a gap analysis. Tests verify presence; they cannot see absence.
- Asking the model that wrote the thing whether it is complete, in the same context. It will say yes.
- Reporting gaps you did not verify. A gap is a finding; it needs the same evidence a bug does.
