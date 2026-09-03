# .agents/agents/

Antigravity CLI custom agents, one per tier, in the `.agents/agents/<name>.md` format (YAML frontmatter + system prompt). `model` is a tier (`flash`, `pro`) or `inherit`. `subagent: true` lets a coordinator call them through `invoke_subagent`, which takes an array and launches concurrently; `mainAgent: true` lets you launch them directly with `agy --agent <name>`.

`commandExecutionPolicy: off` on purpose: turn it on per agent only after you have read what it grants.
