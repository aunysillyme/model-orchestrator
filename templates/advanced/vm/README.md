# vm/: the box that runs it unattended

Level 3 = levels 1 and 2 plus a machine that is always on. A small Linux VM (any cloud's free ARM tier is enough) that holds the CLIs, a model gateway, and the scheduled jobs. Your laptop stays the interactive driver; the box owns the schedule.

Generated {{DATE}} for: `{{AI_IDS}}`. Installed at `{{INSTALL_DIR}}`; the systemd unit and the audit script carry that path.

## The one architectural property

**Only the gateway holds provider credentials.** Nothing else on the box does: not the orchestrator, not the scheduler, not a job. Every surface reaches models through the gateway, so rotating a key is a change in exactly one place. The gateway is bound to loopback (or a private mesh network), never to `0.0.0.0`.

## What runs where

| Surface | Role | Reaches models via |
|---|---|---|
| The orchestrator CLI ({{PRIMARY_NAME}}) | interactive driver when you SSH in; dispatch brain for jobs | its own subscription, off the gateway |
| `cli-run` lanes ({{CLI_RUN_LANES}}) | the other agent CLIs, headless | their own subscriptions (Lane A) |
| The gateway (`docker-compose.yml`) | one OpenAI-compatible endpoint fronting every metered provider | provider keys from the environment |
| A local model runtime (if selected) | the privacy lane | nothing leaves the box |
| Scheduled jobs (`jobs/`) | the weekly gap-analysis audit (lane: `{{AUDIT_LANE}}`), and anything else recurring | the gateway, or `cli-run` |
| codecalc (if selected) | the calculator, code runner and logic checker every agent here calls; stdio, offline, no key | nothing; it computes locally |

## Setup, in order

1. Provision a box. Ubuntu, 2+ vCPU, 8 GB is comfortable. Put it on a private mesh network if you can; do not open ports to the internet.
2. `bash setup-vm.sh`. It installs system deps and the npm-installable CLIs, then **prints** the vendor shell installers for the rest. Read those scripts before running them.
3. Sign each CLI in with its device-code flow (`codex login --device-auth`, `grok login --device-auth`, `agy` on first run). Run these inside `tmux` so a dropped SSH session does not kill the prompt. Headless Linux has no keyring by default; `setup-vm.sh` installs one so the CLIs stop re-prompting.
4. Put provider keys in your secrets manager and export the names listed in `ENVIRONMENT.md` into the gateway's environment at start time. Never write a value into a file in this folder.
5. `docker compose up -d`, then list the lanes without putting the key in argv (the key must be a single token, `^[A-Za-z0-9._-]+$`, because it is interpolated into curl's config grammar):
   ```bash
   printf 'header = "Authorization: Bearer %s"\n' "$GATEWAY_MASTER_KEY" | curl -s --config - http://127.0.0.1:4000/v1/models
   ```
6. Install the weekly audit: `jobs/README.md`.
7. Copy `box-CLAUDE.md` to `~/CLAUDE.md` on the box (or your agent's equivalent rules file) so a session there inherits the house rules without you present.

## The dispatch shape

1. **Deterministic pre-triage, zero tokens:** a keyword table sends the obvious cases (bulk patterns → the cheap lane, URLs and current events → the live lane, "review this" → the reviewer, "write this up" → the orchestrator).
2. **Judgment dispatch:** everything else is routed by the orchestrator against `ROUTING.md` and `DELEGATION_MATRIX.md`, with a logged reason.
3. **Free lane first, escalate on signal.** Every job starts on its $0 lane and climbs only on failure, low confidence, or an explicit "expensive to get wrong".
4. **Unattended means no escalation to a human-gated tier.** An unresolved irreversible call is surfaced (a message, a ticket comment), never executed.
5. **Writes stay locked to one writer.** Every other engine proposes; one writer records.

## The closed loop (name what watches it)

| Thing | Ran? | Watched by | On failure |
|---|---|---|---|
| gateway | `docker compose ps`, `/v1/models` | the weekly audit job | audit report names the dead lane |
| weekly audit | `systemctl --user list-timers` | **nothing** unless you wire a notifier | write "nothing" here until you do; that line is the useful one |
| each `cli-run` job | exit code + `~/.ai-orchestrator/cli-run.log.jsonl` | the job's own caller | rc 10/12/13 in the log |

"Nothing watches it" is a valid answer and usually the valuable one. Writing it down turns an invisible gap into a tracked one.

## Never on this box

- Vendor scripts run blind. Read first.
- A provider key in a file in this folder, in shell history, in argv, or in a container image.
- A service bound to `0.0.0.0`.
- Private notes, client data, or personal records sent to a metered bulk lane. See `PRIVACY_GATES.md`.
- A payment card attached to a compute lane "to unlock a tier". Free credit only unless a human says otherwise.
