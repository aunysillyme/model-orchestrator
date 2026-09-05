# Your orchestrator (start here)

Installed {{DATE}} · level {{LEVEL_ID}}: **{{LEVEL_NAME}}**, {{LEVEL_TAGLINE}}
Primary agent: **{{PRIMARY_NAME}}**

You have access to:
{{AIS_LIST}}

Companion tools:
{{TOOLS_LIST}}

## The idea in one line

This folder gives your agent routing instructions and, at level 2+, a runner for explicitly selected CLI lanes. The agent chooses the tier or lane; the runner does not automatically compare prices or choose a model.

## Your first task

1. Activate the snippet using the instructions below. For a chat app, paste the block in `PASTE-INTO-YOUR-AGENT.md`; upload any full protocols you want it to read because local paths alone do not share files.
2. Start a fresh agent session and ask: "Read the orchestrator instructions. Quote the routing rule you will use, then sort pear, apple, banana alphabetically. Name the tier and whether you delegated."
3. Expect the fast tier and `apple, banana, pear`. If the agent cannot quote the routing rule, check the snippet location or chat instructions before continuing. This is a manual activation check, not proof that every future task follows the rules.
4. At level 2+, run `node bin/cli-run.mjs --doctor` from this folder. It checks binary presence, not authentication or loaded instructions. `--doctor --run` additionally uses a little quota to test live responses. No enabled lanes means delegation is inactive.
5. To test a real output contract, choose an enabled lane from `bin/lanes.json` and run `node bin/cli-run.mjs <lane> 'Return only {"sorted":["apple","banana","pear"]}' --expect-json`. This uses quota. Expect JSON and exit 0; inspect the array yourself. A non-JSON response exits 10, a missing binary exits 13, and an authentication failure reports the vendor error. The explicit lane tests execution; your primary agent still makes delegation decisions.

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
| `protocols/memory-and-record.md` | You are about to write anything durable. Search first, keep the index true, one writer. |
| `CODECALC.md` | Present when you selected codecalc: install, per-agent registration, the skill. |
| `OBSIDIAN-TC.md` | Present when you selected obsidian-tc: what you need first, install, per-agent registration, the security posture. |

Level 2 adds `ROUTING.md`, `TIERS.md`, `DELEGATION_MATRIX.md`, `RESEARCH_TRIAGE.md`, `CLI-RUN.md` and `bin/cli-run.mjs`. Level 3 adds `vm/`. If those files are here, read `ROUTING.md` instead of `ORCHESTRATOR.md`: it is the multi-lane version, and the snippet your agent loads already points at it. `ORCHESTRATOR.md` stays as the single-agent fallback for a session where only one AI is available.

## Load it into your agent

For a CLI primary, the project rules file is `{{PRIMARY_RULES_FILE}}`. Chat apps use pasted instructions instead. The installer wrote a snippet file next to this README (`*.snippet.md`, or `PASTE-INTO-YOUR-AGENT.md` for a chat app). Copy its contents into that file, or paste it into the agent's custom instructions. Nothing was appended to a file you already had.

## The three rules that carry everything

1. **Route by capability tier, not by model name.** deep = ambiguous or expensive to get wrong · standard = well-specified execution and review · fast = bulk and mechanical. Default down, escalate on evidence.
2. **A gate you cannot fail is not a gate.** "Does it look good?" passes every time. "Name the single biggest risk and the flaw in the request" can come back empty, which is how you know it worked.
3. **Exit 0 is not a deliverable.** Any tool, CLI or subagent can report success and hand back nothing. Check for the artifact, not the status line.

## Where things went

- This folder: `{{INSTALL_DIR}}`
- Project root (where your agent reads rules and subagents): `{{PROJECT_DIR}}`
- Subagent definitions: `{{AGENTS_DIR}}`
- The rules path your snippets use: `{{RULES_PATH}}`

## Uninstall

Before deleting anything, inspect `MANIFEST.json`: entries beginning with `[project] ` identify the subagent files managed by this installation. Review those individual files and remove only the ones you no longer want, preserving edited or pre-existing files. Never delete the shared `.claude/agents` or `.agents/agents` folder; it may contain unrelated agents. If the manifest is missing, inspect files individually rather than deleting a folder. Remove the orchestrator block you manually copied into your project rules file or chat instructions. Then delete this generated docs folder only after preserving any work you added to it. The optional log at `~/.ai-orchestrator/cli-run.log.jsonl` is shared across installations; remove it only if you no longer need that history.
