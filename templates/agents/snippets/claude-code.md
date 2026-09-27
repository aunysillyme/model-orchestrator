{{CLAUDE_SNIPPET_INTRO}}

```markdown
## Model router

When a task arrives, read `{{RULES_PATH}}/{{ROUTING_FILE}}` and choose the route before acting.
{{RULES_PATH_NOTE}}

1. Bulk or mechanical work -> bulk-worker (cheap model tier).
2. Reading many files -> reader (cheap model tier, read-only tools).
3. Current information -> live-researcher (working model tier with live tools).
4. Code review -> code-reviewer (working model tier; no file-editing tools, Bash checks bound by its prompt).
5. Review findings -> finding-verifier; reproduce each finding before repair.
6. Definition-of-done check -> done-verifier; return artifact evidence and a verdict.
7. Ambiguity or architecture -> deep-planner (planning model tier).
8. Build -> use Assign in the build protocol to select the lane, model and effort by live capability; builder is the local execution agent.

When a brief would cost as much as the task, or the work needs this conversation's own context, keep it inline. When a rule-bound task needs delegation, use an agent that loads the project's standing instructions and supply the task's scope explicitly.

When building, run `{{RULES_PATH}}/protocols/build-protocol.md`: acceptance checks, live probes, one context file, Assign, build and merge, one audit plus a companion consult asking a different question, then the authorized change verified in use.

When delegating, fill `{{RULES_PATH}}/TASK_BRIEF.md`. A Claude Code subagent loads the project's CLAUDE.md hierarchy; it still needs the user's ask, context file, scope, capabilities, denied actions, interfaces, checks and stopping conditions. A separate CLI or chat may need the standing rules supplied too.

When background work runs, check liveness and output growth every five minutes. After two checks without growth, diagnose and report. When a write is refused, hand it to an authorized writer and continue independent work.

When a consequential number or logical claim matters, compute it with codecalc or the local runtime. When recording durable information, search first, update the index and keep one writer. When an API may have changed, use Context7 or official docs and verify the call locally. Optional companions extend these workflows; local tools provide the fallback.
```

Subagents were written to `.claude/agents/` under the project root (`--project` selects that root). Run Claude Code from that root; the project agents are available as {{AGENTS_LIST_LINE}}.

Three hooks were written to `.claude/hooks/` under the project root: `route-gate.mjs` injects the routing table, `subagent-context.mjs` supplies the rules and task-brief paths, and `route-metrics.mjs` records bounded local routing metadata. Read your routing split with `aunx route-metrics --summary` or `node .claude/hooks/route-metrics.mjs --summary`. {{CLAUDE_HOOKS_ACTIVATION}}
