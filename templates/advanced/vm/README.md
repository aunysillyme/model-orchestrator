# vm/: the box that runs it unattended

Level 3 = levels 1 and 2 plus a machine that is always on. A small Linux VM (any cloud's free ARM tier is enough) that holds the CLIs, a model gateway, and the scheduled jobs. Your laptop stays the interactive driver; the box owns the schedule.

Generated {{DATE}} for: `{{AI_IDS}}`. Installed at `{{INSTALL_DIR}}`; the systemd unit and the audit script carry that path.

## Keep provider credentials in the gateway

For metered API calls, inject provider credentials into the gateway and have jobs use its authenticated endpoint. Subscription CLIs keep their own vendor login state. Bind the gateway to loopback or the configured private network; never expose it publicly without explicit authorization and access controls.

## What runs where

| Surface | Role | Reaches models via |
|---|---|---|
| The orchestrator CLI ({{PRIMARY_NAME}}) | interactive driver when you SSH in; dispatch brain for jobs | its own subscription, off the gateway |
| `cli-run` lanes ({{CLI_RUN_LANES}}) | the other agent CLIs, headless | their own subscriptions (subscription lanes) |
| The gateway (`docker-compose.yml`) | one OpenAI-compatible endpoint fronting every metered provider | provider keys from the environment |
| A local model runtime (if selected) | the privacy lane | nothing leaves the box |
| Scheduled jobs (`jobs/`) | the weekly gap-analysis audit (lane: `{{AUDIT_LANE}}`), and anything else recurring | the gateway, or `cli-run` |
| codecalc (if selected) | the calculator, code runner and logic checker every agent here calls; stdio, offline, no key | nothing; it computes locally |
| context7 (if selected) | version-aware docs for the libraries the box's agents build against; paired with codecalc, docs then a run | the hosted endpoint over HTTPS (or a local `npx` server over stdio, still no cloud account required) |

## Setup, in order

The model-orchestrator installer writes these files only. When you separately invoke the generated `setup-vm.sh`, that manual deployment script installs the configured system dependencies and npm vendor CLIs. Review it before running it.

1. Provision a machine sized for your workload and put it on the configured private network.
2. `bash setup-vm.sh`. It installs system deps and the npm-installable CLIs, then **prints** the vendor shell installers for the rest. Read those scripts before running them.
3. Sign each CLI in, using the flow its vendor gives you. Run these inside `tmux` so a dropped SSH session does not kill the prompt. Headless Linux has no keyring by default; `setup-vm.sh` installs one so the CLIs stop re-prompting.
{{VM_SIGNIN}}
4. Put provider keys in your secrets manager and export the names listed in `ENVIRONMENT.md` into the gateway's environment at start time. Never write a value into a file in this folder. The gateway config was rendered from the API keys you said you hold, not from your CLI subscriptions: those are different entitlements.
5. `docker compose up -d`, then list the lanes without putting the key in argv (the key must be a single token, `^[A-Za-z0-9._-]+$`, because it is interpolated into curl's config grammar):
   ```bash
   printf 'header = "Authorization: Bearer %s"\n' "$GATEWAY_MASTER_KEY" | curl -s --config - http://127.0.0.1:4000/v1/models
   ```
6. Install the weekly audit: `jobs/README.md`.
7. Copy `box-CLAUDE.md` to `~/CLAUDE.md` on the box (or your agent's equivalent rules file) so a session there inherits the house rules without you present.

## The dispatch shape

1. When the task is obvious, use the routing table or `aunx route` suggestion to identify the candidate tier, then verify tools and scope.
2. When judgment is needed, apply `ROUTING.md` and `DELEGATION_MATRIX.md` and record the selected route with a reason.
3. When a cheaper eligible route can satisfy the checks, select it; when checks fail or required capability is absent, diagnose and choose an authorized fallback.
4. When an unattended action exceeds the existing mandate, preserve the result and return the needed approval through the configured channel.
5. When recording shared state, keep one writer and have other workers return proposed updates.

## The closed loop (name what watches it)

| Thing | Ran? | Watched by | On failure |
|---|---|---|---|
| gateway | `docker compose ps`, `/v1/models` | the weekly audit job | audit report names the dead lane |
| weekly audit | `systemctl --user list-timers` | **nothing** unless you wire a notifier | write "nothing" here until you do; that line is the useful one |
| each `cli-run` job | exit code + `~/.ai-orchestrator/cli-run.log.jsonl` | the job's own caller | rc 10/12/13 in the log |

"Nothing watches it" is a valid answer and usually the valuable one. Writing it down turns an invisible gap into a tracked one.

## Keep the server within its scope

- Read vendor scripts before executing them.
- Update pinned packages and images deliberately, with a verification plan.
- Keep provider secrets in the manager and out of argv, logs and generated files.
- Bind services to loopback or the approved private network.
- Apply the named data-processing permissions in `PRIVACY_GATES.md` before dispatch.
- Obtain authorization before adding a paid resource or a payment method.
- When optional companion tools are absent, use the local runtime, official documentation and project files specified by the protocols.
