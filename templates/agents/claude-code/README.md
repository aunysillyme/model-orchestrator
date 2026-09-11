# .claude/agents/

One per tier, plus two checks and two agents with no file-editing tools: `finding-verifier` sits between a review and a repair, `done-verifier` sits between a claim of "done" and a tracker close, and `reader` digests many files or notes without writing anything. Claude Code loads project-level agents from this folder automatically; the count is whatever this folder holds; `test/install.test.js` ties the claude-code snippet's agent list to the files actually shipped here, so this table cannot drift silently.

| Agent | Tier | Model alias | Effort | Job |
|---|---|---|---|---|
| deep-planner | deep | opus | xhigh | judges every build twice; never retrieves |
| builder | standard | sonnet | high | executes; the default for everything that changes files |
| code-reviewer | standard | sonnet | high | read-only findings |
| finding-verifier | standard | sonnet | high | tries to disprove a finding before it causes a repair |
| live-researcher | standard | sonnet | medium | fresh data through tools |
| bulk-worker | fast | haiku | low | mechanical volume, writes output |
| done-verifier | fast | haiku | low | probes a tracker item's stated done-signal; no file-editing tools, Bash for probes only |
| reader | fast | haiku | low | reads and digests many files or notes; read-only |

Aliases resolve to the newest model in each family, so a version bump needs no edit here. Each agent carries its own token-discipline rule; the `effort` field is the third cost lever. Neither `done-verifier` nor `reader` carries `Write` or `Edit` in its `tools:` line. `reader` is read-only by tool grant as well: it carries no `Bash`. `done-verifier` does carry `Bash`, for its probes (`git log`, `grep`, `wc -l`, `test -f`); nothing in that grant stops it from running a command that changes state, so staying read-only there is a rule in its prompt, not a restriction on the tool, and its own file says so.
