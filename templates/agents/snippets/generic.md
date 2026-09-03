# Add this to {{PRIMARY_RULES_FILE}}

Your agent, {{PRIMARY_NAME}}, reads `{{PRIMARY_RULES_FILE}}` from the project root. Copy the block below into it (create the file if it does not exist). The installer did not modify any file you already had.

```markdown
## Model orchestrator

Routing rules live in `ai-orchestrator/ORCHESTRATOR.md` (or `ai-orchestrator/ROUTING.md` at level 2+). Read them before any build task.

Route by capability tier, first match wins: bulk and mechanical -> fast tier · needs live data -> standard tier with tools · review without changing -> standard, read-only · ambiguous or expensive to get wrong -> deep tier, then hand the plan down · everything else -> build it directly at standard tier.

Every build runs `ai-orchestrator/protocols/build-protocol.md`: map the blast radius yourself, ask the deep tier for a named risk and a named flaw, build green, scan the added lines, one adversarial pass with every finding reproduced, an explicit human yes before anything irreversible, then re-grep the old identifier and expect zero.

Every delegation carries an `ai-orchestrator/TASK_BUNDLE.md` brief. A fresh context holds none of these rules; absence is denial.

Never silently retry a failed attempt at the same tier. Escalate once and say so.

Numbers, comparisons, complexity and equivalence claims go through codecalc (or any tool that computes), never your head: `ai-orchestrator/protocols/numbers-and-logic.md`.
```
