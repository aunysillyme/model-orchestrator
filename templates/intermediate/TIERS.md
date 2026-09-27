# TIERS.md: choose capability, effort and tool reach

{{STACK_SUMMARY}}

When choosing a model, use the job's required capability and the lane's live roster. A tier names a job; a current family alias or explicit model choice implements it.

| Tier | Use for | On {{PRIMARY_NAME}} |
|---|---|---|
| planning model | ambiguous planning, architecture, strategy, unknown causes | {{PRIMARY_DEEP}} |
| working model | code writing, review, execution and research synthesis | {{PRIMARY_STANDARD}} |
| cheap model | classification, extraction, formatting and bulk summaries | {{PRIMARY_FAST}} |

When selecting another AI tool, use `DELEGATION_MATRIX.md` and verify its current availability. When data must remain local, choose a local runtime with the required privacy boundary.

## Model and effort per job

When routing, consider three levers together: tier sets capability and price; scoped context limits token use; effort sets how much reasoning the call applies.

| Role | Starting tier | Starting effort | Reassess when |
|---|---|---|---|
| {{PLANNER_ROLE}} | planning model | xhigh where supported | The decision can be resolved from a known plan or needs a new capability |
| {{REVIEW_ROLE}} | working model | high | Security, privacy or irreversible effects raise the review scope |
| {{FINDING_ROLE}} | working model | high | Reproduction needs another runtime or access path |
| {{BUILDER_ROLE}} | working model | high | Architecture, security or irreversible work needs xhigh and suitable model capability |
| {{LIVE_ROLE}} | working model | medium | Synthesis becomes complex or sources disagree |
| {{BULK_ROLE}} | cheap model | low | The input stops fitting the given categories |
| {{DONE_ROLE}} | cheap model | low | The definition of done requires interpretation or unavailable tools |
| {{READER_ROLE}} | cheap model | low | The requested result needs judgment across sources |

When the vendor uses different effort names, choose its equivalent after reading its current capabilities. Before each build, probe the live model roster, compare the configured pin with the lane's default, and record the selected model and effort with a reason. A pin below the current default calls for review; a newer model still needs to fit the job.

## Role, complexity and stakes

- **Role:** choose the agent whose tools and task match the work.
- **Complexity:** increase reasoning for ambiguity, interacting systems or an unknown cause; lower it for bounded retrieval and mechanical work.
- **Stakes:** choose the reviewer and verification needed for the consequence of a mistake.
- **Reach:** choose a lane that can read the required sources, run the relevant checks and hold enough context.
- **Capacity:** account for context headroom, concurrency and the lane's current usage limits.

When security, personal data, deletion, bulk mutation or irreversible actions are involved, name the boundary and test it. Use a different model family for the build's single audit pass, with a companion reviewer asking scope versus ask in the same step. Reserve authorization for actions outside the user's existing mandate.

## Effort through the lane runner

When using `aunx cli-run --effort auto`, treat its result as a prompt-size or audit-scope heuristic. It resolves to medium or high, and an audit lane may impose its own effort floor; check the lane's configuration. For a build, select high explicitly; for security-critical or irreversible work, select xhigh explicitly where the lane supports it.

When a lane lacks an effort flag, choose its model and task scope directly. The runner reports an unsupported effort request as a usage error.

## Reassess a route

- When a check fails, diagnose its failure before another attempt and state any route change.
- When the lane lacks required access, hand that part to a lane with authorized reach and continue independent work.
- When a vendor deprecates a model, verify the replacement from the current roster and update the affected configuration.
- When changing a model would change cost, privacy or authority beyond the approved scope, present the choice to the user.
- When the strongest eligible route still cannot resolve the task, return the evidence, partial result and needed decision.
