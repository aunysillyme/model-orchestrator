# .claude/agents/

Six subagents. Five are one per tier; `finding-verifier` is the check that sits between a review and a repair. Claude Code loads project-level agents from this folder automatically.

| Agent | Tier | Model alias | Effort | Job |
|---|---|---|---|---|
| deep-planner | deep | opus | xhigh | judges every build twice; never retrieves |
| builder | standard | sonnet | high | bounded sub-parts of a build |
| code-reviewer | standard | sonnet | high | read-only findings |
| finding-verifier | standard | sonnet | high | tries to disprove a finding before it causes a repair |
| live-researcher | standard | sonnet | medium | fresh data through tools |
| bulk-worker | fast | haiku | low | mechanical volume |

Aliases resolve to the newest model in each family, so a version bump needs no edit here. Each agent carries its own token-discipline rule; the `effort` field is the third cost lever.
