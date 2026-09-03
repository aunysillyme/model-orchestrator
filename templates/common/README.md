# Your orchestrator (start here)

Installed {{DATE}} · level {{LEVEL_ID}}: **{{LEVEL_NAME}}**, {{LEVEL_TAGLINE}}
Primary agent: **{{PRIMARY_NAME}}**

You have access to:
{{AIS_LIST}}

Companion tools:
{{TOOLS_LIST}}

## The idea in one line

Every task goes to the cheapest AI that does it well, and every gate on the way is a question that can be answered wrong.

## What is in this folder

| File | Read it when |
|---|---|
| `ORCHESTRATOR.md` | First. The routing rules your primary agent follows: tiers, task classes, the two checkpoints. |
| `TASK_BUNDLE.md` | Before you hand any work to a subagent, a second CLI, or a chat window. The brief template. |
| `protocols/build-protocol.md` | You are about to build, code, migrate or deploy something. |
| `protocols/propagate.md` | You are renaming or changing a term, path, slug, schema field or routing rule. |
| `protocols/gap-analysis.md` | You just finished something comprehensive and want the second pass that hunts for what is missing. |
| `protocols/deep-research.md` | The source set is unknown, several sources must be reconciled, and the answer will be cited later. |
| `protocols/numbers-and-logic.md` | You are about to state a number, a comparison, a complexity or an equivalence. Compute it. |
| `CODECALC.md` | Present when you selected codecalc: install, per-agent registration, the skill. |

Level 2 adds `ROUTING.md`, `TIERS.md`, `DELEGATION_MATRIX.md`, `RESEARCH_TRIAGE.md`, `CLI-RUN.md` and `bin/cli-run.mjs`. Level 3 adds `vm/`. If those files are here, read `ROUTING.md` instead of `ORCHESTRATOR.md`: it is the multi-lane version.

## Load it into your agent

Your primary agent reads `{{PRIMARY_RULES_FILE}}` from a project root. The installer wrote a snippet file next to this README (`*.snippet.md`, or `PASTE-INTO-YOUR-AGENT.md` for a chat app). Copy its contents into that file, or paste it into the agent's custom instructions. Nothing was appended to a file you already had.

## The three rules that carry everything

1. **Route by capability tier, not by model name.** deep = ambiguous or expensive to get wrong · standard = well-specified execution and review · fast = bulk and mechanical. Default down, escalate on evidence.
2. **A gate you cannot fail is not a gate.** "Does it look good?" passes every time. "Name the single biggest risk and the flaw in the request" can come back empty, which is how you know it worked.
3. **Exit 0 is not a deliverable.** Any tool, CLI or subagent can report success and hand back nothing. Check for the artifact, not the status line.

## Uninstall

Delete this folder. The installer wrote nothing outside it.
