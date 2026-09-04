# .agents/agents/

Antigravity CLI custom agents, one per tier, in the `.agents/agents/<name>.md` format (YAML frontmatter + system prompt). `model` is a tier (`flash`, `pro`) or `inherit`. `subagent: true` lets a coordinator call them through `invoke_subagent`, which takes an array and launches concurrently; `mainAgent: true` lets you launch them directly with `agy --agent <name>`.

`commandExecutionPolicy` is `auto` for `builder` (it has to run builds and tests; `auto` keeps deletes and other high-risk commands gated) and `off` for the read-only agents. `model` is a tier: `pro` for deep-planner, `flash` for the rest.
