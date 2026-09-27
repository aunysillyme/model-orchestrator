# templates/

Everything the installer can write, organized by the level that adds it. Files are rendered with `{{PLACEHOLDERS}}` filled from `src/catalog.js` and the user's answers (`src/install.js` computes every value; templates contain no logic).

| Folder | Written at | Contents |
|---|---|---|
| `common/` | every level | the start-here README, `TASK_BRIEF.md`, `CONTEXT.md`, `ACCEPTANCE_CHECKS.json`, `DECISIONS.md` and indexed workflow protocols |
| `beginner/` | every level | `ORCHESTRATOR.md`, the single-agent routing rules |
| `agents/` | every level, one variant | the main agent's loading surface: Claude Code subagents (plus `.claude/hooks/route-gate.mjs` and `subagent-context.mjs`, and `settings.hooks.snippet.json` to wire them in), Antigravity custom agents, or a paste snippet |
| `intermediate/` | level 2+ | `ROUTING.md`, `TIERS.md`, `DELEGATION_MATRIX.md`, `RESEARCH_TRIAGE.md`, `CLI-RUN.md` |
| `advanced/` | level 3 | `vm/`: gateway config, compose file, box rules, privacy gates, scheduled jobs |
| `tools/` | when selected | companion tools the AIs call: `codecalc/`, `obsidian-tc/` and `context7/` (install doc + MCP snippets each). See `tools/README.md` |

Agent definitions under `agents/claude-code/` and `agents/agy/` are written to the PROJECT root (`--project`), not `--dir`, because that is where those CLIs read them. A `README.md` at the root of a tier folder (like this one) documents the repo and is not installed. `common/README.md` is the exception: it is the user's start-here file. READMEs deeper in (`protocols/`, `vm/`, `vm/jobs/`) are installed as folder indexes.

## Workflow protocols

When editing a procedure, update its installed index in `common/protocols/README.md` too.

| Protocol | Purpose |
|---|---|
| Build | Frame, assign, implement, audit once and verify the change in use |
| Context file | Share one source of context across the run |
| Acceptance checks | Verify requirements against the final artifact |
| Decision log | Record Did / Why / Serves / Rejected |
| Propagate | Complete shared-name and interface changes |
| Gap analysis | Compare scope with the user's ask |
| Deep research | Reconcile bounded research against primary sources |
| Numbers and logic | Compute decision inputs |
| Memory and record | Keep durable information indexed |
| Docs then prove | Verify changing interfaces on the runtime |
