# Claude Code project agents

When using Claude Code, these project agents load from `.claude/agents/`. Choose the agent whose job and tool reach fit the task; verify the current vendor model roster before a build dispatch.

| Agent | Tier | Effort | Job |
|---|---|---|---|
| deep-planner | planning model | xhigh | Resolve architecture, ambiguity and unknown causes |
| builder | working model | high | Implement the assigned section and verify it |
| code-reviewer | working model | high | Review findings; Bash checks are bound by its prompt |
| finding-verifier | working model | high | Try to disprove findings; Bash checks are bound by its prompt |
| live-researcher | working model | medium | Retrieve and verify current primary sources |
| bulk-worker | cheap model | low | Classify and transform bounded volume |
| done-verifier | cheap model | low | Probe a definition of done; Bash checks are bound by its prompt |
| reader | cheap model | low | Read and digest scoped files with read-only tools |

The definitions omit the optional model field, so your invocation, `CLAUDE_CODE_SUBAGENT_MODEL` or main conversation chooses the model. To pin a model your plan serves, set that environment variable or add `model:` to a definition. Effort carries the starting routing intent. UNVERIFIED: whether every plan honors `xhigh` and `max`; check your plan before depending on either value.

`reader` has no Bash, Write or Edit tool. `code-reviewer`, `finding-verifier` and `done-verifier` have no Write or Edit tool, but their Bash read-only boundary is bound by the prompt, not by the tool grant. Never use those review sessions to change state.

`builder` carries Read, Write, Edit, Glob, Grep and Bash. `deep-planner` carries Read, Glob and Grep. `live-researcher` carries WebSearch and WebFetch. When a task needs a capability absent from its agent, hand that probe to an authorized worker and return the evidence.

When updating these definitions, regenerate the Claude Code plugin so `plugin/agents/` matches this source.
