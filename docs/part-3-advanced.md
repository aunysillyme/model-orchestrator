# Part 3 · Advanced: everything above, plus a virtual machine

A small always-on Linux box owns the schedule. Your laptop stays the interactive driver.

## 1. Only the gateway holds keys

One OpenAI-compatible gateway (LiteLLM) fronts every metered provider. Nothing else on the box holds a credential: not the orchestrator, not a job, not a container. Rotating a key is a change in one place. The gateway binds to loopback or a private mesh, never to the public interface.

Subscription CLIs keep their own sign-in state and stay off the gateway; they are already $0.

## 2. Bind to aliases, pin the cheapest lane

Each gateway lane is an alias (`bulk-cheap`, `standard`, `deep`, `long-context`, `live-fast`, `local-small`), so a vendor rename is a one-line repoint. Each job is pinned to the cheapest lane that does its work, with a token cap, and climbs the ladder (local → free → cheap → standard → deep) only on failure, low confidence, or an explicit "expensive to get wrong".

## 3. Dispatch on the box

1. Deterministic pre-triage at zero tokens: a keyword table routes the obvious cases.
2. Judgment dispatch for the rest, by the orchestrator, with a logged reason.
3. Free lane first.
4. **Unattended means no human-gated escalation.** An unresolved irreversible call is surfaced and stopped, never executed on a model's confidence.
5. One writer. Every other engine proposes.

## 4. The weekly gap analysis becomes a job

A timer enumerates live state (gateway lanes, timers, CLI versions), diffs it against the delegation matrix, and lets the free lane draft the report. It catches the dead lane and the silently renamed model. Its "watched by" line starts as `nothing`, and that line is the one that tells you what to build next.

## 5. What runs where

| Surface | Role |
|---|---|
| the orchestrator CLI | interactive driver over SSH; dispatch brain for jobs |
| `cli-run` lanes | the other agent CLIs, headless, signed in by device code |
| the gateway | every metered provider behind one endpoint |
| a local runtime | the privacy lane |
| user-level systemd timers | the schedule |

Headless Linux gotchas the setup script handles: install a keyring or the CLIs re-prompt for auth on every launch; run device-code sign-ins inside `tmux`; invoke CLIs by absolute path from non-login shells.

## 6. Rules that do not bend on a box

- No payment card on any compute lane without a human saying so. Free credit only.
- Local first; cloud only when local genuinely cannot.
- Private notes, client data and personal records never go to a third-party bulk lane. Name the barred lanes.
- Nothing binds to `0.0.0.0`.
- A secret is never printed, never in argv, never in a file in the repo.

## 7. Every self-running thing gets one document

What and why · trigger · invocation chain · dependencies · reads · writes · **the closed loop (what watches it)** · failure modes · run-and-verify by hand · source of truth. A cold reader must be able to run it, verify it ran, and know who to tell when it breaks, from that one file. An unverified section says UNVERIFIED, never nothing.

## 8. codecalc on the box

Runs as a stdio MCP server next to the orchestrator CLI: offline, no key, nothing to bind. The weekly audit's figures (lane counts, version deltas, spend) are computed there, not estimated by the free lane that drafts the report. See [codecalc](https://github.com/The-40-Thieves/codecalc).

## What the installer gives you at this level

Everything from Parts 1 and 2, plus `vm/README.md` · `vm/setup-vm.sh` · `vm/docker-compose.yml` · `vm/gateway.config.yaml` (one lane per provider you selected, keys by name only) · `vm/ENVIRONMENT.md` · `vm/box-CLAUDE.md` · `vm/PRIVACY_GATES.md` · `vm/jobs/` (a weekly audit timer + service, and an index that names what watches each job).
