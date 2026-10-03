# ROUTING.md: model router for your available tools

Main agent: **Fill at setup: the user's main agent**. A **lane** is an AI tool or model the main agent can hand work to. A **tier** describes a model's capability and cost: planning model, working model or cheap model.

When a task arrives, choose its route from the live tools and these rules. Apply the decision tree below to the task's scope, required tools and stakes before dispatching.

| Role | Tool and model | Selection evidence |
|---|---|---|
| Fill at setup: plan, build, review, verify, research, bulk, read, private | Fill at setup: verified user tools and current models, or none selected | Fill at setup: reach, family, permissions, billing and capacity |

When a separate eligible lane is absent, the main agent handles the job at the appropriate tier. A same-family fresh-context review is a self-check. Independent review needs a verified different family; private work needs a verified local runtime.

Fill at setup: name unavailable roles and access. Unknown capabilities remain UNVERIFIED; review and private roles remain none selected until verified.

## Your lanes

| Tool | Models and family | Reach and permissions | Billing and headroom |
|---|---|---|---|
| Fill at setup: actual available tool | Fill at setup: probe current roster | Fill at setup: verified access | Fill at setup: local, free, subscription or metered |

## Plan guidance

Fill at setup: verify the user's plans, quota and model availability. Unknown prices or capacity remain UNVERIFIED. Choose by job, complexity, stakes and reach; never assume a subscription permits unlimited work.

When choosing a billing route, distinguish **subscription lanes** (usage covered by a subscription, subject to its limits) from **pay-per-token lanes** (metered API usage). When data must stay on the machine, choose a verified **local lane** and check its network behavior.

When a cheaper eligible route can complete and verify the task, select it. When verification fails, complexity emerges or tool reach is insufficient, escalate with a named reason.

## Decision tree (first match wins)

0. **An external lane offers useful reach or capacity:** check `../rules/DELEGATION_MATRIX.md` and call the selected CLI through `node <skill-dir>/bin/cli-run.mjs` from the user's project root.
0a. **Availability:** read the user's filled stack table and verify tools, permissions and headroom before dispatch.
1. **Bulk or mechanical work:** classify, tag, extract, rename or reformat -> cheap model tier / Fill at setup: bounded worker, preferring eligible cheaper billing. Use fan-out only when a selected tool's live capabilities verify it.
1a. **Read or digest many files:** -> Fill at setup: reader with enough context and source access; return facts, quotes or an index within the brief's scope.
2. **Current data is required:** -> Fill at setup: available research tool with verified live access working model tier with live tools.
3. **Review code without changing it:** -> Fill at setup: reviewer from a known different model family, or report independent review pending, working model tier. For security-critical scope -> Fill at setup: different-family reviewer with scope and suitable effort with appropriate effort.
3a. **A reviewer or scanner has returned findings:** -> Fill at setup: finding verifier with reproduction access; reproduce each claim before repair.
3b. **Check a task's definition of done:** -> Fill at setup: completion verifier with artifact access; probe the named artifact and return MET, NOT_MET or UNVERIFIABLE.
4. **Ambiguity, architecture or an unknown cause:** -> planning model tier / Fill at setup: planner, preferring the main agent then largest verified context. Return a concrete plan for execution.
5. **Build:** use the verified builder with high effort where supported; raise to xhigh for architecture, security or irreversible work.

When assigning a build, prefer the main agent with authorized writes, then an eligible headless CLI. Write the choice and evidence in briefs/DECISIONS.md.

## Build process and ownership

When a task builds or changes a system, run `../protocols/build-protocol.md`.

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


- When reporting consequential arithmetic or code equivalence, use a computing tool (`../protocols/numbers-and-logic.md`). codecalc: optional, verify availability at setup; otherwise use the local runtime, spreadsheet or tests. When absent, use the local runtime, test suite or spreadsheet. Verify current provider rates before quoting costs.
- When writing durable records, search first, update the index and keep one writer (`../protocols/memory-and-record.md`). obsidian-tc: optional, verify availability at setup; otherwise use project files, search and version control. When absent, use project files, search and version control.
- When using a changing library or API, read current documentation and verify behavior (`../protocols/docs-then-prove.md`). Context7: optional, verify availability at setup; otherwise read official docs or installed source. When absent, read official docs or installed source; use the local runtime when codecalc is absent.

## Choose effort and verify the route

Use planning capability for unresolved decisions and scoped working capability for execution.  Keep small lookups local when dispatch adds no useful reach or capacity.
- When a lookup is sufficient, use the cheap model tier; when the task needs judgment, choose the working or planning model tier by evidence.
- When an attempt fails, identify the failure class before retrying; change the route or resolve the cause explicitly.
- When delegating, pass the context file and task brief with scoped source references and acceptance checks.
- When role, complexity or stakes change, reassess model, effort and reviewer together. See `../rules/TIERS.md`.
- Before each build, inspect the lane's live roster and any configured pin. Flag stale pins and record the model and effort selected for this task.
- When the route matters, set `--model` and `--effort` or verify `../bin/lanes.json` defaults. Run `node <skill-dir>/bin/cli-run.mjs --doctor` to inspect requested defaults; an unpinned lane uses its own configuration.

## Example routings

| Task | Route |
|---|---|
| Design the architecture for a service | Fill at setup: planner, preferring the main agent then largest verified context, planning model tier |
| Review this service for bugs | Fill at setup: reviewer from a known different model family, or report independent review pending, working model tier |
| Add an endpoint from an agreed specification | Fill at setup: verified builder, working model tier |
| Find why this silently drops rows | Fill at setup: planner, preferring the main agent then largest verified context, then a scoped build |
| Summarize similar notes into one index | Fill at setup: bounded worker, preferring eligible cheaper billing, cheap model tier |
| Read every file and extract mentions of a topic | Fill at setup: reader with enough context and source access, cheap model tier |
| Verify the audit's findings | Fill at setup: finding verifier with reproduction access before repairs |
| Check whether the stated definition of done holds | Fill at setup: completion verifier with artifact access |
| Fill at setup: project-specific task | Fill at setup: eligible lane, model and selection reason |
## Loading the rules

Fill at setup: name the project instruction file or session-loading procedure that reads these rules. Verify it in a fresh session; this pack installs no hooks.
