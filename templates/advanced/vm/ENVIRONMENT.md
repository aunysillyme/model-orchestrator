# ENVIRONMENT.md: names the gateway expects

Generated {{DATE}} from the metered API keys you said you hold (asked separately from your subscription CLIs, because a Claude Code plan is not an Anthropic API key):

{{APIS_LIST}}

These are variable **names**. The values live in a secrets manager and are injected at start time (for example `<manager> run -- docker compose up -d`, or a systemd `EnvironmentFile=` that lives outside this folder with mode 600).

{{ENV_NAMES}}

`GATEWAY_MASTER_KEY` is the bearer every client presents to the gateway. Generate it once (`openssl rand -hex 32`), store it in the manager, never paste it into a file here. It must be a single token matching `^[A-Za-z0-9._-]+$`: the audit job interpolates it into curl's config grammar and refuses anything else.

## Gateway and scheduled audit environments

Inject the provider names above only into the environment used to launch the gateway with Compose. The weekly audit service instead reads `~/.config/ai-orchestrator/weekly-audit.env`, outside the installation and mode 600, containing only `GATEWAY_MASTER_KEY`. Do not point that service at the gateway's provider-key file. Existing installations must update and reload their copied systemd unit when adopting this template.

The audit script removes `GATEWAY_MASTER_KEY`, `LITELLM_MASTER_KEY`, and the gateway provider names `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, and `OPENROUTER_API_KEY` from child environments. It supplies the gateway header to curl through stdin, without a credential temp file or an argv value. Newlines anywhere in the key are rejected before collection.

Vendor version probes and the report worker retain `HOME`, `PATH`, stored vendor sign-ins, and unrelated authentication variables. Configure the selected lane's own sign-in in the systemd user's account, such as `hermes auth add <provider>` for Hermes. An API-only lane relying solely on one of the removed provider variables needs vendor-supported stored authentication before this scheduled job can run; gateway keys are not a substitute for that setup.

## Rules

- Never print a value in a terminal or a log. Verify by length or by a hash prefix.
- Never pass a value on a command line; argv is world-readable on Linux. Use `curl --config -` fed from `printf`, or a tool's own env-var option.
- Never commit a file that contains a value. Add a secret scanner as a pre-push hook.
- Subscription CLIs (`claude`, `codex`, `agy`, `grok`, `hermes`) keep their own sign-in state; they need none of these names.
