# Add this to your project's CLAUDE.md

Copy the block below into `CLAUDE.md` at your project root (create the file if it does not exist). The installer did not modify any file you already had.

```markdown
## Model orchestrator

Routing rules live in `{{RULES_PATH}}/{{ROUTING_FILE}}`. Read them before any build task. Quick version, first match wins:

1. Bulk, mechanical, many similar items -> bulk-worker (fast tier).
2. Needs live data -> live-researcher (standard tier + tools).
3. Review without changing -> code-reviewer (standard, read-only).
3a. Holding findings from a review or scanner -> finding-verifier before any repair. Only CONFIRMED findings earn a change.
3b. Checking a tracker item against its stated done-signal -> done-verifier. It never closes anything itself.
4. Ambiguous, architectural, or expensive to get wrong -> deep-planner (deep tier), then hand the plan down.
5. Everything else that changes files -> builder executes by default. The orchestrator plans, briefs, verifies and talks to you; it stays inline only when (a) the brief would cost as much as the work, (b) the task needs this conversation's own context, or (c) it is your decision, or the final verification of delegated work. Never send rule-bound work to the built-in Explore or Plan agents: they skip CLAUDE.md. general-purpose should not take work a named agent already owns.

A subagent starts with your CLAUDE.md and tool definitions already loaded, so it has a fixed start-up cost before it does anything. Measure yours once: spawn a subagent with a one-line task and read its token count. Work smaller than that stays inline.

Every build runs `{{RULES_PATH}}/protocols/build-protocol.md`: two deep-tier checkpoints, a mechanical scan, one adversarial pass, an explicit human yes before anything irreversible, then the loud negative.

Every delegation carries an `{{RULES_PATH}}/TASK_BUNDLE.md` brief. A Claude Code subagent loads this CLAUDE.md hierarchy, so it holds the standing rules already, just not this task's scope; a second CLI or a fresh chat window may hold none of them. Absence is denial either way.

Never silently retry a failed attempt at the same tier. Escalate once and say so.

Numbers, comparisons, complexity and equivalence claims go through codecalc (or any tool that computes), never your head: `{{RULES_PATH}}/protocols/numbers-and-logic.md`.

Anything durable is searched for before it is written and its folder index is corrected in the same pass; one writer per run: `{{RULES_PATH}}/protocols/memory-and-record.md`.
```

Subagents were written to `{{AGENTS_DIR}}` (the project root, which is where Claude Code reads project-level agents; `--project` changes it). Run `claude` from `{{PROJECT_DIR}}` and they are available as {{AGENTS_LIST_LINE}}.

Two hooks were written to `{{AGENTS_DIR}}/../hooks/` (`.claude/hooks/`): `route-gate.mjs` injects the routing table on every prompt, and `subagent-context.mjs` reminds a spawned subagent where the rules and the task-bundle format live. Merge `settings.hooks.snippet.json`, written next to this file, into `.claude/settings.json` to wire them in.
