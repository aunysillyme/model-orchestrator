# Antigravity project agents

When using Antigravity custom agents, load these definitions from `.agents/agents/<name>.md`. A coordinator can call them through `invoke_subagent`; `mainAgent: true` also supports `agy --agent <name>`.

Use `pro` for the planning model tier and `flash` for working and cheap model tiers as the starting configuration. Check the live roster and tool reach before assigning a build.

`builder` has `commandExecutionPolicy: auto` so standard builds and checks can run, while destructive operations remain subject to the vendor's permission policy. Review and reading agents use `commandExecutionPolicy: off`.

`code-reviewer`, `finding-verifier`, `done-verifier` and `reader` use read-only tools with command execution disabled. Their Claude Code counterparts carrying Bash have a prompt-enforced read-only boundary instead. When an Antigravity agent needs a shell probe, hand the exact probe to an authorized worker and report the unverified check until its evidence returns.

When optional companion software is absent, use available read, fetch and local-runtime capabilities through the authorized owner. `bulk-worker` owns classification and transformation; `reader` returns source facts and digests.
