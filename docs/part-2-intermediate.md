# Part 2 · Intermediate: many AIs, called through their CLIs

Everything in Part 1, plus lanes. One agent stays the orchestrator; every other AI becomes a lane it calls from the terminal.

## 1. Two kinds of lane

**Lane A, subscription CLIs.** Claude Code, Codex, Antigravity, Grok, Hermes. Already paid for, $0 per call, used for interactive and agentic work. **Lane B, metered APIs.** Per token, used for programmatic bulk where a subscription CLI cannot serve. **Local.** A privacy lane, never a cost lane.

Rule: never spend a frontier token on a task a cheap tier finishes correctly. Escalate on signal, not by default. And an external lane must earn the hop with a real strength; when in doubt, stay in-house.

## 2. One job per lane

| Lane | Wins at |
|---|---|
| the orchestrator (Claude Code, or whichever you chose) | routes, maps, builds, verifies, records; drives the others as CLIs |
| Codex | second coder and adversarial auditor: a different model family reading your diff |
| Antigravity `agy` | deep research sweeps; concurrent fan-out (its subagent call takes an array) |
| Grok CLI | X and live web reads at $0 (the same search on the API bills per call) |
| Hermes | the free tier: rough drafts, first-pass summaries, divergent reads, cron jobs |
| Qwen Code + a cheap metered model | structured bulk output; never anything that cites a line, number or source |
| Ollama | anything that must not leave the machine |

One driver, no second AI in the mix: the orchestrator invokes the CLIs; it never hands control to another agent.

## 3. Exit 0 is a lie on every lane

Every agent CLI can report success and deliver nothing. `bin/cli-run.mjs` builds the right invocation per lane, reads that lane's **native** terminal event, and exits `10` when a run produced no deliverable, `12` on timeout, `13` when the lane is missing. Byte count is not a check either; a run can emit hundreds of kilobytes and no conclusion. One lane's own success flags lie outright (an upstream 400 reported as success), so its judge reads the two honest signals instead.

Every call goes through it. "This lane is flaky" becomes a query over its log instead of an argument.

## 4. Every delegation carries a task bundle, on both surfaces

Subagents and CLI lanes are the same problem: something with none of your rules and broad tool access. The brief (purpose, task class, scope, capabilities, denied actions, conventions, report contract, exit parameters) goes in the prompt or in the file passed to `--brief`. If you can, gate it mechanically: a pre-dispatch hook that refuses a brief missing purpose, denied actions or a report contract.

## 5. Research: three engines, one triager

Fan the same plan to three model families (web sweep, adversarial read, live data), each as one `cli-run` call. The orchestrator opens the primary sources itself, marks every claim, and writes the only durable record. Expect one engine to return confident unsourced numerics; downgrade it. Weight the engines that report their own gaps. Count dispositions, not briefs.

## 6. Gap analysis gets a second family

The second pass is now a different model reading the same artifact, in read-only audit mode. Disagreement between families is the cheapest signal that something is soft.

## 7. The build protocol, bound to lanes

Stage 1 Map: the orchestrator sweeps; CLI lanes critique the map at $0. Stage 2: deep tier, a named risk and a named flaw. Stage 4: scanners on the added lines, fail closed. Stage 5: security-shaped diff → the second coder in read-only audit mode; architecture-shaped → deep tier reviewing build against plan; never both. Two deep checkpoints per build; CLI lanes are uncapped.

## 8. Privacy gate

Name the lanes that never see private notes, client data or personal records. An unnamed bar is not enforced.

## 9. Re-derive every figure a cheap lane returns

Measured on the cheapest metered lane: conclusions right, 0 of 11 line citations correct, fabricated arithmetic attached to true observations. That survives a skim. So a number from a lane is a lead until a tool computes it: [codecalc](https://github.com/The-40-Thieves/codecalc) on the orchestrator's side, registered for Codex, Antigravity and Qwen Code with the snippets in `CODECALC.md`.

## What the installer gives you at this level

Everything from Part 1, plus `ROUTING.md` · `TIERS.md` · `DELEGATION_MATRIX.md` (generated from your selection) · `RESEARCH_TRIAGE.md` · `CLI-RUN.md` · `bin/cli-run.mjs` · `bin/lanes.json`.

## When you have outgrown it

You want the audit to run on a Monday without you, a gateway so nothing but one process holds a key, and a machine that is always on. That is [Part 3](part-3-advanced.md).
