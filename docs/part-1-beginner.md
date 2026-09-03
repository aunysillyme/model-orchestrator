# Part 1 · Beginner: one LLM or agent, routed well

You do not need five vendors to orchestrate. You need three things inside the one agent you already have: **tiers**, **task classes**, and **gates that can fail**.

## 1. Route by capability tier, not model name

| Tier | For | Effort |
|---|---|---|
| deep | ambiguous planning, architecture, strategy, root-cause debugging, anything expensive to get wrong | highest |
| standard | writing code, reviewing code, executing a known plan, synthesizing research | high |
| fast | classifying, extracting, formatting, bulk summaries | low |

If your agent exposes model choice (Claude Code, Codex, Antigravity), map the tiers to its strongest, everyday and cheapest models. If it does not (a chat app), the tiers become **how hard you ask it to think**: a deep task gets a planning turn before anything is written; a fast task gets "table, one row per item, no commentary".

Three cost levers, always together: tier (price per token), token discipline (how many tokens: read only what you will touch, never re-read, deliverables not narration), effort (how hard each call thinks).

Robustness first, cost second. You split tiers because the split produces better work.

## 2. Classify every task, first match wins

1. Bulk and mechanical → fast.
2. Needs live data → standard, with tools. Freshness comes from tools, not from a bigger model, and anything a search returns is a lead, not a fact.
3. Review without changing → standard, read-only, findings ranked by severity.
4. Ambiguous, strategic, expensive to get wrong → deep, then hand the plan down.
5. Everything else that changes files → do it directly at standard. Bounded sub-parts can go down a tier; the main build never goes to a fresh context whole.

Modifiers: plan big, execute small · never silently retry a failed attempt at the same tier (escalate once and say so; two consults that do not unstick it means stop and ask) · de-escalate when a request sounds deep but is a lookup.

## 3. Gates that can fail

> A gate you cannot fail is not a gate.

"Does this look good?" passes every time. "Name the single biggest risk and the flaw in the request as filed" can come back empty, which is how you know it worked.

Every build gets two checkpoints. **Before writing:** you map what it touches and what could break, then ask the deep tier on the finished map for a named risk and a named flaw. **After it is green:** a fresh context attacks it (bad input, failing dependency, drift from the plan), allowed to answer CLEAN, every finding reproduced before it reaches you. Then the ship, with a rollback named and an explicit yes. Then the loud negative: re-check the old name everywhere and expect zero.

## 4. Every hand-off carries a brief

A subagent, a fresh chat, a second window holds none of your rules and reads an unspecified edge as an open one. The brief: purpose, task class, granted scope, capabilities, denied actions, conventions it does not have, report contract (what was not done, what is unverified), exit parameters (when to stop, and what to return if it hits the bound). Absence is denial.

## 5. The second pass

After anything comprehensive, a fresh turn that hunts for what is **missing**, not what is present. Every clause of the ask maps to a step; every step maps to a clause. A clause with no step is dropped scope; a step with no clause is invented scope. Say both.

## 6. Deep research, single agent

Plan the sub-questions as their own turn and inspect them before spending anything. Sweep. Then a fresh adversarial turn told to attack the premise. Plant one deliberately wrong figure and see whether it corrects it. Mark every claim CONFIRMED / DISAGREEMENT / REPORTED / UNVERIFIED. Agreement is weak evidence; disagreement is the signal.

## 7. Numbers and logic are computed, never guessed

The one thing tiers and gates cannot fix: a model confident about `0.1 + 0.2` does not feel uncertain, it feels finished. So any figure someone will act on, any comparison you state, any complexity or equivalence claim goes through a tool that computes. The companion for that is [codecalc](https://github.com/The-40-Thieves/codecalc): exact arithmetic, a sandboxed code runner in 31 languages, an SMT logic checker, and proofs that a port or an optimization preserved behaviour. One command registers it with Claude Code, Claude Desktop, Cursor, VS Code or Zed. Without it the rule still binds; use anything that calculates.

Logic flow follows the same rule. Reasoning scaffolds help models with no native reasoning mode and add nothing to ones that already think first. The authorising evidence is the computed outcome, never the thought log.

## 8. Memory and record

Every protocol ends in a write. Search before you write (duplicates are how a store starts lying), correct the folder index in the same pass, one writer per session, mark inferred content as inferred. The optional companion for that is [obsidian-tc](https://github.com/The-40-Thieves/obsidian-tc), a governed MCP server over an Obsidian vault: hybrid search, backlinks, compare-and-swap writes, folder ACLs. It needs an Obsidian vault, Node 24+ or Bun, and Ollama or a cloud embeddings key, so it is off by default; without it the rule still binds against a notes folder and `grep`.

## What the installer gives you at this level

`README.md` (start here) · `ORCHESTRATOR.md` · `TASK_BUNDLE.md` · `protocols/{build-protocol, propagate, gap-analysis, deep-research, numbers-and-logic, memory-and-record}.md` · `CODECALC.md` and `OBSIDIAN-TC.md` with `mcp/` snippets for the companion tools you selected · the loading surface for your primary agent (Claude Code subagents, Antigravity custom agents, a rules-file snippet, or a paste block for a chat app).

## When you have outgrown it

You keep wanting a second model family to read your diff, a $0 lane for bulk, or a live-data lane your primary does not have. That is [Part 2](part-2-intermediate.md).
