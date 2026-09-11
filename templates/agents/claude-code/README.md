# .claude/agents/

One per tier, plus two checks and two read-only specialists: `finding-verifier` sits between a review and a repair, `done-verifier` sits between a claim of "done" and a tracker close, and `reader` digests many files or notes without writing anything. Claude Code loads project-level agents from this folder automatically; the count is whatever this folder holds; `test/install.test.js` ties the claude-code snippet's agent list to the files actually shipped here, so this table cannot drift silently.

| Agent | Tier | Model alias | Effort | Job |
|---|---|---|---|---|
| deep-planner | deep | opus | xhigh | judges every build twice; never retrieves |
| builder | standard | sonnet | high | executes; the default for everything that changes files |
| code-reviewer | standard | sonnet | high | read-only findings |
| finding-verifier | standard | sonnet | high | tries to disprove a finding before it causes a repair |
| live-researcher | standard | sonnet | medium | fresh data through tools |
| bulk-worker | fast | haiku | low | mechanical volume, writes output |
| done-verifier | fast | haiku | low | probes a tracker item's stated done-signal; read-only |
| reader | fast | haiku | low | reads and digests many files or notes; read-only |

Aliases resolve to the newest model in each family, so a version bump needs no edit here. Each agent carries its own token-discipline rule; the `effort` field is the third cost lever. `done-verifier` and `reader` are read-only by design: neither carries `Write` or `Edit` in its `tools:` line.
