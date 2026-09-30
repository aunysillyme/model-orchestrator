# ENVIRONMENT.md: names the gateway expects

Generated {{DATE}} from the metered API keys you said you hold (asked separately from your subscription CLIs, because a Claude Code plan is not an Anthropic API key):

{{APIS_LIST}}

These are variable **names**. The values live in a secrets manager and are injected at start time (for example `<manager> run -- docker compose up -d`, or a systemd `EnvironmentFile=` that lives outside this folder with mode 600).

{{ENV_NAMES}}

`GATEWAY_MASTER_KEY` is the bearer every client presents to the gateway. Generate it once (`openssl rand -hex 32`), store it in the manager, never paste it into a file here. It must be a single token matching `^[A-Za-z0-9._-]+$`: the audit job interpolates it into curl's config grammar and refuses anything else.

## Gateway and scheduled audit environments

Inject the provider names above only into the environment used to launch the gateway with Compose. The weekly audit service instead reads `~/.config/ai-orchestrator/weekly-audit.env`, outside the installation and mode 600, containing `GATEWAY_MASTER_KEY` and optional documented runtime/location settings. Do not point that service at the gateway's provider-key file. Existing installations must update and reload their copied systemd unit when adopting this template.

The audit script builds an explicit allowed environment with shell builtins before its first external command. It supplies the gateway header to curl through stdin, without a credential temp file or an argv value. Newlines anywhere in the key are rejected before collection. All provider keys, unrelated exported names, token variables and exported shell functions are absent from child environments.

The allowed runtime names are `HOME`, `PATH`, `USER`, `LOGNAME`, `SHELL`; `LANG`, `LANGUAGE`, `TZ`; `LC_ALL`, `LC_CTYPE`, `LC_COLLATE`, `LC_MESSAGES`, `LC_MONETARY`, `LC_NUMERIC`, `LC_TIME`, `LC_ADDRESS`, `LC_IDENTIFICATION`, `LC_MEASUREMENT`, `LC_NAME`, `LC_PAPER`, `LC_TELEPHONE`; `TMPDIR`, `TMP`, `TEMP`; `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`, `XDG_RUNTIME_DIR`, `DBUS_SESSION_BUS_ADDRESS`; and the Windows shell runtime names `SystemRoot`, `SYSTEMROOT`, `WINDIR`. User-service access and stored sign-ins use those same locations.

Only the selected report worker additionally receives its location override: `CODEX_HOME` for `codex`, `HERMES_HOME` for `hermes`. These names are removed from collection/version probes. `claude`, `agy`, `grok` and `qwen` must use stored sign-ins in the common user/configuration locations, with no additional exported authentication name. Configure the selected vendor's sign-in in the systemd user's account, such as `hermes auth add <provider>` for Hermes. Setups that depend on exported provider keys or session tokens need vendor-supported stored authentication before this job can run. `CLAUDE_CODE_OAUTH_TOKEN` remains excluded by the same boundary as other token variables.

`PROBE_SECS` and `RUNNER_SECS` remain shell-only deadline overrides. Set documented runtime and location overrides in the service's `Environment=` settings or audit-only environment file. The key and any selected worker settings stay out of command arguments and logs. There is no arbitrary variable pass-through option.

When migrating, use `--update-docs` for unchanged managed documents, review preserved edited files, apply the new script and docs, update the copied service, then reload systemd. Reconfigure any sign-in that depended on an unrelated export and manually start the service. [The jobs README](jobs/README.md) owns the invocation chain, exact environment contract, migration and verification steps. The environment boundary preserves access to files under HOME/XDG; it does not isolate those files or undo Bash startup files. Real vendor sign-in and systemd behavior remain unverified until the manual run.

## Rules

- Never print a value in a terminal or a log. Verify by length or by a hash prefix.
- Never pass a value on a command line; argv is world-readable on Linux. Use `curl --config -` fed from `printf`, or a tool's own env-var option.
- Never commit a file that contains a value. Add a secret scanner as a pre-push hook.
- Subscription CLIs (`claude`, `codex`, `agy`, `grok`, `hermes`) keep their own sign-in state; they need none of these names.
