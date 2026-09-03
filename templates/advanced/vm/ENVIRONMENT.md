# ENVIRONMENT.md: names the gateway expects

Generated {{DATE}} from your selection. These are variable **names**. The values live in a secrets manager and are injected at start time (for example `<manager> run -- docker compose up -d`, or a systemd `EnvironmentFile=` that lives outside this folder with mode 600).

{{ENV_NAMES}}

`GATEWAY_MASTER_KEY` is the bearer every client presents to the gateway. Generate it once (`openssl rand -hex 32`), store it in the manager, never paste it into a file here. It must be a single token matching `^[A-Za-z0-9._-]+$`: the audit job interpolates it into curl's config grammar and refuses anything else.

## Rules

- Never print a value in a terminal or a log. Verify by length or by a hash prefix.
- Never pass a value on a command line; argv is world-readable on Linux. Use `curl --config -` fed from `printf`, or a tool's own env-var option.
- Never commit a file that contains a value. Add a secret scanner as a pre-push hook.
- Subscription CLIs (`claude`, `codex`, `agy`, `grok`, `hermes`) keep their own sign-in state; they need none of these names.
