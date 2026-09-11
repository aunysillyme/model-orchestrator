# Build Protocol

**Three phases, eight stages, and every gate is a question that can be answered wrong.**

Fires on any task that builds, codes, implements, migrates or deploys. Rough test: if it would earn a second-opinion audit or a tracker issue, it runs this.

> **The one rule underneath:** a gate you cannot fail is not a gate. If a stage's exit reads like "confirm it looks good", it is written wrong and it will pass every time, including the times it should not.

Three corollaries:
1. A check nobody has watched fail is not known to work. Prove a gate can go red before trusting green.
2. A tool's output is a claim, not a fact. Scanner findings, audit reports and exit codes get read and reproduced before they are repeated.
3. A gate that fires on unrelated things gets bypassed, and a bypassed gate certifies what it never checked.

| Phase | Master question | Stages |
|---|---|---|
| 1 Pre-build | What exactly are we building, what do we need first, and what does this touch or break? | 0 Route · 1 Map · 2 Judge |
| 2 Build | Is it secure, built on current code, and correct without hidden flaws? | 3 Build · 4 Scan · 5 Challenge · 5b Ship gate |
| 3 Post-build | Did it land everywhere, is it proven against the real thing, and is it recorded? | 6 Verify · 7 Record |

The two seams are the point. Pre-build to Build: nothing is written yet, changing your mind costs a conversation. Build to Post-build: the ship, the only irreversible step, the only one that needs an explicit human yes.

## Phase 1 · Pre-build

### Stage 0 · Route
1. Do we have everything needed to start? Every key, access path and asset **verified present by a live probe**, not assumed from a doc.
2. Is this actually a build, or a quick fix, doc edit, or question that needs no plan?

**Gate:** classified, and every required input confirmed to exist and work. Verify access here, never at ship time. A missing credential found at Stage 0 costs a message; found at Stage 5b it costs the session.

### Stage 1 · Map
1. What does this touch, improve, scale, or replace? Docs, indexes, tracker issues, tool servers, devices, scheduled jobs, hooks, other repos.
2. What already-working thing could this break, and does something already do this?

Four bounded questions, not four exhaustive scans. **The builder maps; the judgment tier does not.** Retrieval is mechanical and the builder holds the local tooling and the map stays in its context for the build. Paying top-tier rates for a file list is the most expensive routing mistake available.

**Gate:** a written map naming affected files, systems and issues.

### Stage 2 · Judge (Checkpoint 1)
Ask the judgment tier, on the finished map:
1. Is this the simplest way to build it, or are we overcomplicating?
2. What is most likely to go wrong, and what did the request miss?

**Gate:** **one named weak spot** and **one gap in the request**. Approval alone is not an exit; an advisor asked only to approve will approve. If a consult comes back mostly restating the map, the brief asked it to retrieve when it should have asked it to decide.

## Phase 2 · Build

### Stage 3 · Build
"Up to date" means two things. Ask both.
1. Is our repo clean and current? No stray uncommitted work, on a branch, base ref recorded.
2. Am I writing against an external API or SDK, and have I read its actual source this session? Never from recall. Read the installed dependency, which is what actually runs.
3. Does the new code follow existing conventions and pass typecheck, tests, or dry-run?

**Gate:** clean baseline recorded, every external-API claim traced to source read this session, build green. Check a reference clone's date before trusting it: a stale clone read as current is worse than no clone.

### Stage 4 · Scan (automatic, no judgment)
1. Any secret, key or token in the new code?
2. Any vulnerability or vulnerable dependency in the lines we added?

Secret detection, static analysis and dependency scanning, filtered to lines this diff added. Refuses by default: a missing or erroring scanner exits non-zero, never a silent green.

**Gate:** zero flags on added lines. Pre-existing flags are reported, never inherited as blockers, and never waved through unread. A scanner finding is a claim; read the code before calling it anything.

### Stage 5 · Challenge (Checkpoint 2, one pass, never two)
1. Can bad input or a bad actor break it, and what happens when a dependency fails?
2. Did the build stick to the approved plan, or did unintended changes sneak in?

Route by shape: security-shaped diffs (auth, tokens, routes, deletion, bulk mutation, untrusted input) go to a second-opinion reviewer, ideally a **different model family**. Architecture-shaped diffs go to the judgment tier reviewing build against plan. Never both on one diff.

Findings do not go straight to a repair. Hand them to the **finding-verifier**, whose job is to DISPROVE each one: read the cited line, state what would trigger it, then hunt for the guard, caller or test that makes it impossible. It returns one of three verdicts per finding, and rounding between them is the failure mode to watch for.

| Verdict | Meaning | What happens next |
|---|---|---|
| CONFIRMED | reproduced, or a concrete path nothing blocks | it earns a repair |
| NOT_REPRODUCED | something prevents it, named and located | dropped, and not narrated |
| INCONCLUSIVE | not settleable read-only | say what it would take; never round it to either side |

Use a different model family from the one that produced the finding where you have one: a family asked to check its own claim tends to agree with itself.

**Gate:** every finding **verified** before it reaches a human, and only CONFIRMED findings trigger a change. Hard cap one re-audit. `CLEAN` is a valid success state; an auditor that is not allowed to say so manufactures something, and so does a verifier that is expected to confirm.

### Stage 5b · Ship gate
1. What is the rollback target? Record it before shipping.
2. Has the human authorised this specific change going live?

**Gate:** rollback identifier written down, and an explicit yes. Authorisation is per change and does not carry over.

## Phase 3 · Post-build

### Stage 6 · Verify
1. Did it land across ALL connected surfaces? Re-grep the OLD identifier everywhere and expect zero except named historical records.
2. Can we prove it works against the real thing, including when a dependency fails, and has each check been *seen* to go red?

**Gate:** real-world test passes, the negative test behaves, every gate proven capable of failing. Prefer a local reproduction of the real fault over inducing it in production.

### Stage 7 · Record
1. Where is the ONE doc that traces this end to end? Name the path.
2. What watches this thing? Name it, or write "nothing".
3. Are the docs, indexes, memory and tracker updated with evidence rather than claims?
4. Is the plan doc deleted?

**Gate:** the end-to-end doc exists at a named path in the folder that owns the domain, with that folder's index corrected in the same pass (`protocols/memory-and-record.md`); the watcher is named or its absence is written down; the tracker is Done with evidence and read back; then the plan doc is deleted, not archived. "Nothing watches it" is a valid answer and usually the valuable one: writing it down turns an invisible gap into a tracked one.

## Roles, as capabilities

| Role | Does | Does not |
|---|---|---|
{{ROLES_BUILDER_ROW}}
| Judgment tier | Stage 2 and the architectural arm of Stage 5. Argues with a finished map | Perform the retrieval |
| Second-opinion reviewer | The security arm of Stage 5. Reviews the diff | Fix anything |
| Mechanical gates | Stage 4 and any always-on guard | Be overridden without reading |
| Cheap workers | Bounded sub-parts: bulk passes, wide searches, long loops | Own a stage |
| Human | Stage 5b, and any irreversible or architectural call | Be the first line of review |

{{BUILDER_HANDOFF_NOTE}}

## Checklist

```
PRE-BUILD
[ ] 0  Inputs and access verified by live probe, not assumed
[ ] 0  Confirmed this is a build and not a quick fix
[ ] 1  Everything it touches written: files, systems, issues
[ ] 1  Asked what could break, and whether this already exists
[ ] 2  Judgment tier named a weak spot AND a gap in the request

BUILD
[ ] 3  Repo clean, on a branch, base ref recorded
[ ] 3  External API claims traced to source read this session
[ ] 3  Typecheck / tests / dry-run green
[ ] 4  Scan clean on ADDED lines; pre-existing flags read, not inherited
[ ] 5  One audit pass, findings reproduced, plan drift reviewed
[ ] 5b Rollback target recorded
[ ] 5b Human authorised this specific ship

POST-BUILD
[ ] 6  Old identifier re-grepped everywhere, zero hits
[ ] 6  Real-world test passes; negative test goes red
[ ] 6  Every gate proven capable of failing
[ ] 7  End-to-end doc exists at ONE named path
[ ] 7  "What watches it" answered, even if the answer is "nothing"
[ ] 7  Tracker Done with evidence, state read back
[ ] 7  Plan doc deleted (only after the end-to-end doc exists)
```
