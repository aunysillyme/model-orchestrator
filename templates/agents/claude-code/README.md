# Claude Code project agents

When using Claude Code, these project agents load from `.claude/agents/`. Choose the agent whose job and tool reach fit the task; verify the current vendor model roster before a build dispatch.

| Agent | Tier | Model alias | Effort | Job |
|---|---|---|---|---|
| deep-planner | planning model | opus | xhigh | Resolve architecture, ambiguity and unknown causes |
| builder | working model | sonnet | high | Implement the assigned section and verify it |
| code-reviewer | working model | sonnet | high | Review findings; Bash checks are bound by its prompt |
| finding-verifier | working model | sonnet | high | Try to disprove findings; Bash checks are bound by its prompt |
| live-researcher | working model | sonnet | medium | Retrieve and verify current primary sources |
| bulk-worker | cheap model | haiku | low | Classify and transform bounded volume |
| done-verifier | cheap model | haiku | low | Probe a definition of done; Bash checks are bound by its prompt |
| reader | cheap model | haiku | low | Read and digest scoped files with read-only tools |

Family aliases follow the vendor's alias mapping. Treat the table as a starting assignment and choose model and effort together for the actual job.

`reader` has no Bash, Write or Edit tool. `code-reviewer`, `finding-verifier` and `done-verifier` have no Write or Edit tool, but their Bash read-only boundary is bound by the prompt, not by the tool grant. Never use those review sessions to change state.

`builder` carries Read, Write, Edit, Glob, Grep and Bash. `deep-planner` carries Read, Glob and Grep. `live-researcher` carries WebSearch and WebFetch. When a task needs a capability absent from its agent, hand that probe to an authorized worker and return the evidence.

When updating these definitions, regenerate the Claude Code plugin so `plugin/agents/` matches this source.
