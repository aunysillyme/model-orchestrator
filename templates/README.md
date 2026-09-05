# templates/

Everything the installer can write, organized by the level that adds it. Files are rendered with `{{PLACEHOLDERS}}` filled from `src/catalog.js` and the user's answers (`src/install.js` computes every value; templates contain no logic).

| Folder | Written at | Contents |
|---|---|---|
| `common/` | every level | the start-here README, `TASK_BUNDLE.md`, `protocols/` (build, propagate, gap analysis, deep research, numbers and logic, memory and record) |
| `beginner/` | every level | `ORCHESTRATOR.md`, the single-agent routing rules |
| `agents/` | every level, one variant | the primary agent's loading surface: Claude Code subagents, Antigravity custom agents, or a paste snippet |
| `intermediate/` | level 2+ | `ROUTING.md`, `TIERS.md`, `DELEGATION_MATRIX.md`, `RESEARCH_TRIAGE.md`, `CLI-RUN.md` |
| `advanced/` | level 3 | `vm/`: gateway config, compose file, box rules, privacy gates, scheduled jobs |
| `tools/` | when selected | companion tools the AIs call: `codecalc/` and `obsidian-tc/` (install doc + MCP snippets each). See `tools/README.md` |

Agent definitions under `agents/claude-code/` and `agents/agy/` are written to the PROJECT root (`--project`), not `--dir`, because that is where those CLIs read them. A `README.md` at the root of a tier folder (like this one) documents the repo and is not installed. `common/README.md` is the exception: it is the user's start-here file. READMEs deeper in (`protocols/`, `vm/`, `vm/jobs/`) are installed as folder indexes.
