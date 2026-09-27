# Antigravity project agents

When using Antigravity custom agents, load these definitions from `.agents/agents/<name>.md`. A coordinator can call them through `invoke_subagent`; `mainAgent: true` also supports `agy --agent <name>`.

The definitions omit the optional model field and inherit your configuration. To pin an available alias, add `model:` to a definition: Antigravity exposes `pro` for planning and `flash` for working and cheap tiers. Check your access, the live roster and tool reach before assigning a build.

| Agent | Tier | Effort guidance |
|---|---|---|
| deep-planner | planning model | xhigh where supported |
| builder | working model | high |
| code-reviewer | working model | high |
| finding-verifier | working model | high |
| live-researcher | working model | medium |
| bulk-worker | cheap model | low |
| done-verifier | cheap model | low |
| reader | cheap model | low |

`builder` has `commandExecutionPolicy: auto` so standard builds and checks can run, while destructive operations remain subject to the vendor's permission policy. Review and reading agents use `commandExecutionPolicy: off`.

`code-reviewer`, `finding-verifier`, `done-verifier` and `reader` use read-only tools with command execution disabled. Their Claude Code counterparts carrying Bash have a prompt-enforced read-only boundary instead. When an Antigravity agent needs a shell probe, hand the exact probe to an authorized worker and report the unverified check until its evidence returns.

When optional companion software is absent, use available read, fetch and local-runtime capabilities through the authorized owner. `bulk-worker` owns classification and transformation; `reader` returns source facts and digests.
