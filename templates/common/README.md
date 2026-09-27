# Your orchestrator (start here)

Installed {{DATE}} · level {{LEVEL_ID}}: **{{LEVEL_NAME}}**, {{LEVEL_TAGLINE}}
Main agent: **{{PRIMARY_NAME}}**

{{STACK_TABLE}}

{{STACK_FALLBACK_NOTE}}

{{STACK_GAPS}}

What each AI is:
{{AIS_LIST}}

Companion tools:
{{TOOLS_LIST}}

## The idea in one line

This folder gives your agent routing instructions and, at level 2+, a runner for explicitly selected CLI lanes. The agent reads the rules and chooses the tier or lane; `aunx route` supplies a keyword suggestion and `aunx cli-run` runs the lane the caller selects.

## Activate it

These are the same steps, in the same order, that the installer printed in your terminal.{{CHAT_UPLOAD_NOTE}}

{{ACTIVATION_STEPS}}

## Then prove it took

{{PROOF_STEPS}}

## What is in this folder

| File | Read it when |
|---|---|
| `{{ROUTING_FILE}}` | First. The routing rules your main agent follows: tiers, task classes, acceptance checks and resource selection. |
| `CONTEXT.md` | At the start of a run. Shared source facts, scope, decisions and measurements (`aunx context`). |
| `ACCEPTANCE_CHECKS.json` | When verifying the final artifact (`aunx checks run`). Replace the failing example first. |
| `DECISIONS.md` | When choosing an approach. Did / Why / Serves / Rejected with evidence. |
| `TASK_BRIEF.md` | Before you hand any work to a subagent, a second CLI, or a chat window. The brief template. |
| `protocols/build-protocol.md` | You are about to build, code, migrate or deploy something. |
| `protocols/propagate.md` | You are renaming or changing a term, path, slug, schema field or routing rule. |
| `protocols/gap-analysis.md` | You just finished something comprehensive and want the second pass that hunts for what is missing. |
| `protocols/deep-research.md` | The source set is unknown, several sources must be reconciled, and the answer will be cited later. |
| `protocols/numbers-and-logic.md` | You are about to state a number, a comparison, a complexity or an equivalence. Compute it. |
| `protocols/memory-and-record.md` | You are about to write anything durable. Search first, keep the index true, one writer. |
| `protocols/docs-then-prove.md` | You are about to write code against a library, SDK, API or CLI. Current docs first, then a run proves it. |
| `CODECALC.md` | Present when you selected codecalc: install, per-agent registration, the skill. |
| `OBSIDIAN-TC.md` | Present when you selected obsidian-tc: what you need first, install, per-agent registration, the security posture. |
| `CONTEXT7.md` | Present when you selected context7: what you need first, install, per-agent registration, the security posture. |

Level 2 adds `ROUTING.md`, `TIERS.md`, `DELEGATION_MATRIX.md`, `RESEARCH_TRIAGE.md`, `CLI-RUN.md` and `bin/cli-run.mjs`. Level 3 adds `vm/`. If those files are here, read `ROUTING.md` instead of `ORCHESTRATOR.md`: it is the multi-lane version, and the snippet your agent loads already points at it. `ORCHESTRATOR.md` stays as the single-agent fallback for a session where only one AI is available.

## Where the rules load from

{{LOAD_IT}}

## Route, check and verify

1. When selecting a tier, use a planning model for ambiguity, a working model for execution and review, and a cheap model for mechanical work. Check current capabilities before dispatch.
2. When introducing a gate, demonstrate its failing case before relying on a passing result.
3. When a tool reports success, verify the requested artifact and acceptance checks.

## Where things went

{{WHERE_THINGS_WENT}}

## Uninstall

When removing this installation, run the installer with `--uninstall` and the same `--dir` and `--project` paths. Use `--dry` first to inspect what would be removed. The manifest identifies managed files and their installed hashes; edited files are preserved and named. Never delete shared agent folders that may contain unrelated files. Review any rules or settings you merged by hand and remove only this installation's entries. The local log at `~/.ai-orchestrator/cli-run.log.jsonl` is shared across installations; preserve it while another installation uses it.
