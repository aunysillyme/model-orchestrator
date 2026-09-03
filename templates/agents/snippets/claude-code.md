# Add this to your project's CLAUDE.md

Copy the block below into `CLAUDE.md` at your project root (create the file if it does not exist). The installer did not modify any file you already had.

```markdown
## Model orchestrator

Routing rules live in `ai-orchestrator/ORCHESTRATOR.md` (or `ai-orchestrator/ROUTING.md` at level 2+). Read them before any build task. Quick version, first match wins:

1. Bulk, mechanical, many similar items -> bulk-worker (fast tier).
2. Needs live data -> live-researcher (standard tier + tools).
3. Review without changing -> code-reviewer (standard, read-only).
4. Ambiguous, architectural, or expensive to get wrong -> deep-planner (deep tier), then hand the plan down.
5. Everything else that changes files -> build it directly. The main build is never handed off whole; bounded sub-parts go to builder.

Every build runs `ai-orchestrator/protocols/build-protocol.md`: two deep-tier checkpoints, a mechanical scan, one adversarial pass, an explicit human yes before anything irreversible, then the loud negative.

Every delegation carries an `ai-orchestrator/TASK_BUNDLE.md` brief. A subagent holds none of these rules; absence is denial.

Never silently retry a failed attempt at the same tier. Escalate once and say so.

Numbers, comparisons, complexity and equivalence claims go through codecalc (or any tool that computes), never your head: `ai-orchestrator/protocols/numbers-and-logic.md`.
```

Subagents were written to `.claude/agents/`. Claude Code picks them up from the project root.
