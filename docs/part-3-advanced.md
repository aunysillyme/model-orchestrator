# Part 3 · Advanced: templates for your always-on Linux machine

Level 3 gives configuration and setup scripts for a Linux machine you provision. The box owns the schedule; your laptop stays the interactive driver.

## 1. Keep provider keys in the gateway

One OpenAI-compatible gateway (LiteLLM) fronts your selected pay-per-token providers. Inject provider keys into the gateway and have jobs use its authenticated endpoint. Keep the gateway's access key in your secrets manager and supply it to authorized jobs. The supplied Compose ports bind to loopback; keep any private-network access within your authorized boundary.

Subscription CLIs keep their own sign-in state and use the access and quota included in your plan.

## 1b. Configure subscription access and API access separately

The installer asks which metered API keys you hold separately from which CLIs you use. A Claude Code plan gives you `claude`; it does not give you an Anthropic API key. API-backed gateway lanes and their variable names in `vm/ENVIRONMENT.md` come from the selected API providers. Selecting Ollama adds the local alias separately.

## 2. Bind to aliases and configure job policies

Selected providers and the optional local runtime get gateway aliases such as `bulk-cheap`, `standard`, `deep` and `local-small`. Update an alias's configured model when changing providers or models.

For jobs you add, configure an eligible lane, token limits, spending limits and any escalation policy. Define the checks that justify a retry or a stronger model and the authorization each step needs.

The supplied weekly audit uses one fixed CLI lane selected at installation, in this preference order: Hermes, Qwen Code, Codex, Antigravity, Grok. Each run calls that lane through `cli-run` with a timeout. Its behavior is a single report request to that selected lane; token caps and escalation require your own job configuration.

## 3. Dispatch on the box

Use `vm/box-CLAUDE.md` as the starting policy for your main agent:

1. When the task is obvious, use the routing table or `aunx route` suggestion, then verify tools and scope.
2. When judgment is needed, apply `ROUTING.md` and `DELEGATION_MATRIX.md` and record the choice with a reason.
3. When a cheaper eligible lane can satisfy the acceptance checks, select it. When checks fail, diagnose and choose an authorized fallback.
4. When an unattended action exceeds the existing authorization, preserve the result and request approval through your configured channel.
5. When recording shared state, keep one writer and have other workers propose updates.

## 4. The weekly gap analysis becomes a job

The timer runs a script that collects gateway alias IDs, the user timer listing and version strings for CLIs found on its `PATH`. It passes those observations, `DELEGATION_MATRIX.md` and the gap-analysis protocol to the fixed CLI lane. The lane drafts a report comparing the supplied observations with the intended configuration and names what it could not assess. Failed probes are marked `UNVERIFIED`.

Successful output replaces the dated report; a failed run preserves the previous report and keeps partial output separately. Nothing watches the weekly job until you configure a notifier and record it in `vm/jobs/README.md`.

## 5. What runs where

| Surface | Role |
|---|---|
| the orchestrator CLI | interactive driver over SSH; dispatch brain for jobs |
| `cli-run` lanes | supported agent CLIs, headless, using their vendor sign-ins |
| the gateway | selected pay-per-token providers behind one endpoint |
| a local runtime | the privacy lane |
| user-level systemd timers | the schedule |

Review `vm/setup-vm.sh` before running it: that separately invoked deployment script installs system dependencies, including a keyring, and selected npm vendor CLIs. Complete vendor sign-ins inside `tmux` and inject the names in `vm/ENVIRONMENT.md`. Then, from `vm/`, run `bash setup-vm.sh --start-services`. It starts Compose; when Ollama is selected, it pulls the configured model inside that service and verifies a completion through `local-small`.

Before enabling the timer, check `command -v node` and the selected CLI on the box. The service supplies `Environment="PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"`; add their actual absolute directories there when needed. The script resolves `node` and vendor CLIs through that `PATH`. systemd does not expand `$PATH`, `$HOME` or `~` in this setting. Follow `vm/jobs/README.md` to configure the unit and verify a manual run.

## 6. Set spending and privacy boundaries

- Configure spending and token limits before scheduling a compute job. Include a check that stops for approval when a job would exceed its approved budget.
- Choose local or hosted execution from capacity, privacy and the approved budget.
- Fill in `vm/PRIVACY_GATES.md`: classify the data and name the allowed and barred lanes. Confidential data needs explicitly approved processors or a local runtime; personal data needs explicitly authorized processing with the required privacy boundary. Keep protected data out of unapproved bulk lanes.
- Nothing binds to `0.0.0.0`.
- A secret is never printed, never in argv, never in a file in the repo.

## 7. Every self-running thing gets one document

What and why · trigger · invocation chain · dependencies · reads · writes · **the closed loop (what watches it)** · failure modes · run-and-verify by hand · source of truth. A cold reader must be able to run it, verify it ran, and know who to tell when it breaks, from that one file. An unverified section says UNVERIFIED, never nothing.

## 8. codecalc on the box

If selected and separately installed, codecalc runs as a stdio MCP server next to the orchestrator CLI: offline, no key, nothing to bind. For jobs that need arithmetic, configure calculation through codecalc or an available calculator or runtime and supply the inputs to verify. The weekly audit collects the observations listed above and asks its selected lane to compare them with the delegation matrix. See [codecalc](https://github.com/The-40-Thieves/codecalc).

## 9. obsidian-tc on the box

If selected, use stdio next to the orchestrator, or the upstream Docker service against a bind-mounted vault. Without it, use a searchable notes folder with one writer. Embeddings on the box's Ollama, so nothing leaves the machine. HTTP transport stays off unless every caller is on the private mesh and auth is on.

## 10. Context7 on the box

If selected, Context7 retrieves documentation over the network, including when its MCP server runs locally. Keep private source and secrets out of query text. Without it, read current official docs or upstream source. Then test the API shape with your local runtime before release.

## What the installer gives you at this level

Everything from Parts 1 and 2, plus `vm/README.md` · `vm/setup-vm.sh` · `vm/docker-compose.yml` · `vm/gateway.config.yaml` (one lane per provider you selected, keys by name only) · `vm/ENVIRONMENT.md` · `vm/box-CLAUDE.md` · `vm/PRIVACY_GATES.md` · `vm/jobs/` (a weekly audit timer + service, and an index that names what watches each job).
