# ROUTING.md: model router for your available tools

Main agent: **{{PRIMARY_NAME}}**. A **lane** is an AI tool or model the main agent can hand work to. A **tier** describes a model's capability and cost: planning model, working model or cheap model.

When a task arrives, choose its route from the live tools and these rules. `aunx route "<task>"` prints a deterministic keyword suggestion; verify that suggestion against the task's scope, required tools and stakes before dispatching.

## Your lanes

{{LANES_TABLE}}

## Plan guidance

{{PLAN_GUIDANCE}}

When choosing a billing route, distinguish **subscription lanes** (usage covered by a subscription, subject to its limits) from **pay-per-token lanes** (metered API usage). When data must stay on the machine, choose a verified **local lane** and check its network behavior.

When a cheaper eligible route can complete and verify the task, select it. When verification fails, complexity emerges or tool reach is insufficient, escalate with a named reason.

## Decision tree (first match wins)

0. **An external lane offers useful reach or capacity:** check `DELEGATION_MATRIX.md` and call the selected CLI through `aunx cli-run` or the installed `bin/cli-run.mjs`.
{{LANE_STEP0}}
1. **Bulk or mechanical work:** classify, tag, extract, rename or reformat -> cheap model tier / bulk-worker{{BULK_LANE}}.{{FAN_OUT_ADVICE}}
1a. **Read or digest many files:** -> reader; return facts, quotes or an index within the brief's scope.
2. **Current data is required:** -> {{LIVE_LANE}} working model tier with live tools.
3. **Review code without changing it:** -> code-reviewer, working model tier. For security-critical scope -> {{ATTACK_LANE}} with appropriate effort.
3a. **A reviewer or scanner has returned findings:** -> finding-verifier; reproduce each claim before repair.
3b. **Check a task's definition of done:** -> done-verifier; probe the named artifact and return MET, NOT_MET or UNVERIFIABLE.
4. **Ambiguity, architecture or an unknown cause:** -> planning model tier / deep-planner. Return a concrete plan for execution.
{{DECISION_RULE5}}

{{WHO_BUILDS}}

## Build process and ownership

When a task builds or changes a system, run `protocols/build-protocol.md`.

| Step | Action |
|---|---|
| Frame and probe | Quote the ask, freeze acceptance checks and verify required availability |
| Ordering | Dependencies first, invalidators early, deterministic checks before judgment, irreversible actions last |
| Research | Vet sources, inspect current interfaces and spike risky assumptions |
| Context file | Map affected surfaces once; every brief reads the same context file |
| Assign | Choose each section's lane, model and effort by live capability and job fit |
| Build | Execute the approved scope; hand refused writes to an authorized writer |
| Split and merge | Keep the whole scope in each brief; merge sections and name conflicts |
| Audit | One pass on the merged artifact plus a companion consult asking scope versus ask |
| Ship | Record rollback, confirm authorization, replay checks and verify the change in use |
| Record | Return coverage and evidence, update documentation and name what watches it |

When work runs in the background, check liveness and output growth every five minutes. Two checks without growth call for diagnosis and a report. When an audit finding is confirmed, assign its fix to a non-author and show the regression failing before the fix. Verify the fix; no second audit pass.

## Tools and fallbacks

- When reporting consequential arithmetic or code equivalence, use a computing tool (`protocols/numbers-and-logic.md`). codecalc: {{CODECALC_STATUS}}. When absent, use the local runtime, test suite or spreadsheet.{{METERED_CITATION_NOTE}}
- When writing durable records, search first, update the index and keep one writer (`protocols/memory-and-record.md`). obsidian-tc: {{OBSIDIAN_TC_STATUS}}. When absent, use project files, search and version control.
- When using a changing library or API, read current documentation and verify behavior (`protocols/docs-then-prove.md`). Context7: {{CONTEXT7_STATUS}}. When absent, read official docs or installed source; use the local runtime when codecalc is absent.

## Choose effort and verify the route

{{PLAN_BIG_LINE}}{{INLINE_THRESHOLD_NOTE}}
- When a lookup is sufficient, use the cheap model tier; when the task needs judgment, choose the working or planning model tier by evidence.
- When an attempt fails, identify the failure class before retrying; change the route or resolve the cause explicitly.
- When delegating, pass the context file and task brief with scoped source references and acceptance checks.
- When role, complexity or stakes change, reassess model, effort and reviewer together. See `TIERS.md`.
- Before each build, inspect the lane's live roster and any configured pin. Flag stale pins and record the model and effort selected for this task.
- When the route matters, set `--model` and `--effort` or verify `bin/lanes.json` defaults. Run `aunx cli-run --doctor` to inspect requested defaults; an unpinned lane uses its own configuration.

## Example routings

| Task | Route |
|---|---|
| Design the architecture for a service | deep-planner, planning model tier |
| Review this service for bugs | code-reviewer, working model tier |
{{ADD_ENDPOINT_ROW}}
| Find why this silently drops rows | deep-planner, then a scoped build |
| Summarize similar notes into one index | bulk-worker, cheap model tier |
| Read every file and extract mentions of a topic | reader, cheap model tier |
| Verify the audit's findings | finding-verifier before repairs |
| Check whether the stated definition of done holds | done-verifier |
{{LANE_EXAMPLES}}
{{ROUTE_GATE_SECTION}}
