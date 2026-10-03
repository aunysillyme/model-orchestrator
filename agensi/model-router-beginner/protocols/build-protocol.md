# Build protocol: from the request to a change in use

When a task builds, codes, implements, migrates or deploys, follow this procedure. For a lookup, prose edit, bulk classification or one-line configuration change, use the relevant routing rule and verify the result directly.

When a check controls a decision, first demonstrate an input that makes it fail. When a tool reports a finding, reproduce it before treating it as evidence. Keep every step proportional to the approved scope.

## Pre-build

### 1. Frame the request and probe the runtime

- Quote each acceptance-critical clause from the user's request and write the observable property that must hold in the final artifact.
- Give each property an **acceptance check**: a command that exits zero when the property holds, or an explicit manual procedure. Store checks using `../briefs/ACCEPTANCE_CHECKS.json` and `../protocols/acceptance-checks.md`.
- Probe the tools, models, access and services available now. Use the tool's own command or capability listing and record which surface it covers.
- Freeze acceptance-critical availability facts as checks too. When a dependency or permission changes, rerun the affected probe before work that assumes it.
- When the approach depends on a risky assumption, spike it on the actual runtime before building. Carry the measured value, method and date into the task brief.
- When requirements conflict, mark the affected check unresolved and obtain a decision before dependent work proceeds.
- Record decisions as they are made with **Did / Why / Serves / Rejected** in `../briefs/DECISIONS.md`; see `../protocols/decision-log.md`.

**Exit:** the ask, scope, checks, availability evidence and risky assumptions have named records and verifiers.

### 2. Apply the ordering function

When choosing the next step or resource, apply this ordering:

1. Satisfy dependencies before their consumers.
2. Check invalidators earliest: availability, permission and whether the build is needed.
3. Use cheap deterministic probes before model judgment.
4. Run independent units together within the available concurrency and scope.
5. Put irreversible actions last.

When a step is unnecessary, record the skipped step and the evidence for skipping it. Select resources from the live probe when their capabilities serve the task.

### 3. Research bounded questions

- Write the questions, search ceiling and stop condition before research.
- Read current official documentation for changing external interfaces and inspect relevant open-source approaches.
- Vet a repository before reading its implementation: reputation, usage, age, maintenance, author and answered issues.
- When signals are strong in a hard domain, surface adoption versus reimplementation to the user before adding the dependency.
- When signals are adequate, extract the technique and its limits. When signals are weak, exclude the source and record why.
- Return the technique, what it does, its implementation location and licence. Treat documentary claims as assumptions until runtime or source verifies them.
- When research could remove the need for the build, complete it before mapping. Otherwise run it beside independent mapping work.

### 4. Write one context file

- Read the project rules, relevant records and current task state within the authorized scope.
- Map the affected files, interfaces, users and connected surfaces with bounded searches.
- List necessary steps, recorded skips and the facts already answered by existing sources.
- Batch remaining questions that would change the build before dependent implementation.
- Write one `../briefs/CONTEXT.md` per run. Every task brief points to that **context file**; verify a sample of its claims against source. See `../protocols/context-file.md`.

**Exit:** a reader can reconstruct the approved scope and current evidence from one context file.

### 5. Assign by fit

- Before each build dispatch, check the lane's live model roster and compare configured pins with its current default. Flag a pin that has fallen behind, then choose model and effort for this job.
- Select by reasoning depth, tool reach, context window and remaining capacity. Assign sections separately when different resources fit them better.
- Record the lane, model, effort and reason, including why a cheaper eligible route would be insufficient.
- Give each builder the whole scope, its own section, the context file, acceptance checks, holds/lacks inventory, measured assumptions, non-goals, interfaces to preserve, order of work and a coverage-table report contract. Use `../briefs/TASK_BRIEF.md`.
- Run the availability probe and frozen checks before starting work that depends on them.

When dispatching, verify the builder's actual tools and project-rule loading; pass missing context explicitly.

## Build

### 6. Implement and verify

- Record the starting branch, base revision and existing changes before editing.
- Use the selected build model at high effort; use xhigh where supported for architecture, security or irreversible work. Choose the model from the current roster.
- Use the lane's available tools and authorized capabilities, including independent subagents when useful.
- When an external interface may have changed, consult current official sources and trace each API claim to a source read during this run.
- When a sandbox or permission boundary refuses a write, hand the required patch and evidence to an authorized writer and continue independent work. A refusal is a handoff, never a reason to widen permission silently.
- For every background task, arm a **heartbeat** at launch: check it every five minutes for liveness and output growth. After two consecutive checks with no growth, diagnose the stall, stop blind waiting and report the measured cause.
- Run checks appropriate to the change, including relevant secret, static and dependency scans. Read each finding and report scanner errors as unverified coverage.

### 7. Split and merge

- When splitting the build, put the whole scope and all section owners in every brief.
- Give each lane its own write boundaries and shared interface contracts.
- Have the assigning agent merge the sections into one artifact and name every conflict and its resolution.
- Replay acceptance checks on the merged artifact. Use that artifact for the audit.

## Post-build

### 8. Audit once, with a companion consult

Run one audit pass against the final diff: build versus approved scope, correctness, and the final acceptance checks. The auditor is a different author and a different model family from the builder. When a suitable independent reviewer is unavailable, report the audit as pending and obtain the required review before shipping.

Skip this pass only when commands prove **all three** conditions: the diff is docs-only with no executable file touched; it changes no auth, secret, migration, route, mcp or policy path; and it is below the project's recorded line threshold. When a threshold or proof is absent, run the audit.

In the **same step**, run a companion consult asking a different question: scope versus the user's ask, including omissions and unnecessary work. This companion is a second reviewer, independent of optional companion software. If the assigning agent authored a section, have the companion cover that section's build against its scope as well.

- Raise review effort with the measured diff scope; use xhigh where supported for auth, tokens, OAuth, middleware, routes, MCP, untrusted input, deletion or bulk mutation.
- Reproduce every finding or drop it. Preserve inconclusive findings with the evidence needed to settle them. `CLEAN` is a valid result.
- Assign confirmed fixes to a non-author and add one regression per fix, first shown failing against the unfixed behavior.
- Record dated ROUND 1 dispositions. Verify fixes with their regressions and acceptance checks; **no second audit pass** on the same diff.

### 9. Ship into use

- Record the rollback identifier before shipping.
- Confirm the user's authorization covers the concrete change and destination. When it does, continue; when authorization is missing, present the checked result and request it.
- Replay all active acceptance checks against the final artifact immediately before the irreversible action.
- Wire the change into every approved surface that makes it usable, then verify live behavior on each surface.
- Treat shipped as a state: **in use**, with the carrying surfaces named and evidence that a real invocation reaches them.
- When rendering, packaging or deployment can change a checked property, replay the checks against the materialized artifact too.

### 10. Record and report

- Write one end-to-end operations document for anything that runs independently or supports another system: purpose, trigger, invocation chain, dependencies, reads, writes, feedback loop, failure modes, manual verification and source of truth.
- Name what watches it; write `nothing` when there is no watcher.
- Update documentation and indexes, then attach artifact evidence to any authorized tracker update and read the final state back.
- Retire a temporary plan only after its operational knowledge is preserved under the project's retention policy.
- Return a coverage table with one row per requirement and evidence. State what was built, where it is in use, how future sessions reach it, and what remains unverified.

## Tools and fallbacks

When optional companion software is selected, use codecalc for computation, Context7 for documentation, and obsidian-tc for the record store. When one is absent, use the local runtime or test suite, official documentation or installed source, and repository files with search and version control respectively. These substitutions preserve the checks. A missing capability needed by a check remains explicitly unverified until an authorized tool or person can verify it.

## Roles

| Role | Responsibility | Boundary |
|---|---|---|
| Assigning agent | Scope, resource selection, section ownership, merge and reporting | Granted scope |
| Fill at setup: authorized builder | Implement and verify its assigned section | Granted files and commands |
| Planning model | Resolve ambiguity using prepared context and evidence | Read-only planning |
| Independent reviewer | Audit the merged build against scope and acceptance checks | Review and report |
| Companion reviewer | Check scope against the ask in the same audit step | Independent question |
| Cheap workers | Bounded retrieval, classification and mechanical work | Assigned section |
| Human | Resolve missing mandates and authorize irreversible actions | User decisions |
