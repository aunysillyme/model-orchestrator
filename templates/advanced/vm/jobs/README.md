# jobs/

Scheduled work on the box, as user-level systemd timers. Each job is a timer + service pair and gets one line in the table below. **Each line names what watches it.** "nothing" is an honest answer and the one that tells you where to look.

| Job | Schedule | Does | Lane | Watched by |
|---|---|---|---|---|
| `weekly-audit` | Monday 09:00 | collects live state (gateway lanes, timers, CLI versions), composes a brief with the protocol and `DELEGATION_MATRIX.md`, and asks a cli-run lane for the gap report | `{{AUDIT_LANE}}` (first enabled route at install time; edit `AUDIT_LANE` in the script to change it) | nothing yet: wire a notifier and update this line |

Paths in the service and the script were rendered for this install: `{{INSTALL_DIR}}`. If you move the folder, re-run the installer or edit both files.

## Install a job

Before copying the unit, run `command -v node` and `command -v <selected-cli>` in the account that will run the timer. The service sets `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`; add the absolute parent directories of your actual Node and vendor CLI executables to its `Environment="PATH=..."` line when needed. The script resolves `node` and vendor commands through that PATH. systemd does not expand `$PATH`, `$HOME` or `~` in this setting, so write complete directories and retain the system entries. Shell profile files and interactive version-manager initialization are not loaded.

```bash
mkdir -p ~/.config/systemd/user
cp weekly-audit.service weekly-audit.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now weekly-audit.timer
systemctl --user list-timers        # it should be listed with a next-run time
loginctl enable-linger "$USER"      # so user timers run without a login session
```

The service reads only `GATEWAY_MASTER_KEY` from `~/.config/ai-orchestrator/weekly-audit.env`, outside this folder with mode 600. Provision that audit-only file from your secrets manager and point `EnvironmentFile=` at it before installing. Keep the gateway's provider-key environment separate. Existing installs must replace or edit their copied service, then run `systemctl --user daemon-reload`; updating the source template alone does not update the installed unit. The key must be a single token matching `^[A-Za-z0-9._-]+$`; any embedded or trailing newline is refused.

Sign the selected vendor CLI in under the same user before enabling the timer. The job preserves `HOME`, `PATH`, stored sign-in state and unrelated authentication variables, but removes `GATEWAY_MASTER_KEY`, `LITELLM_MASTER_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, and `OPENROUTER_API_KEY` from all child environments. An API-only lane dependent on a removed variable needs vendor-supported stored authentication, such as `hermes auth add <provider>`, before scheduling it. Those provider keys belong in the gateway launch environment.

## Invocation, dependencies, reads and writes

The Monday timer starts the user service, which runs Bash on `vm/jobs/weekly-audit.sh`. The script queries the local gateway using curl, collects user timers and installed CLI versions, assembles a brief, and invokes `node bin/cli-run.mjs` with the selected audit lane. Dependencies are Bash, Node, curl, jq, pgrep, standard shell utilities, the systemd user session, and the selected signed-in CLI. The gateway probe may fail without preventing the report: that section becomes `UNVERIFIED`.

The script reads `protocols/gap-analysis.md`, `DELEGATION_MATRIX.md` (falling back to `ORCHESTRATOR.md`), and collected live state. It writes `reports/live-state-<stamp>.md`, the `live-state.md` symlink, `audit-brief-<stamp>.md`, and a dated report or retained failed output. Credential headers travel only through a pipe into curl's stdin. No gateway credential temp file is created.

## The closed loop

The timer schedules the job; the script records unknown probes in its brief; the worker returns a report; a clean, non-empty result replaces the dated report. The journal records its exit code and report path. **Watched by: nothing.** The operator must inspect the journal and report after a failed service or add a notifier, then update the table above. Automatic notification and remediation are not configured.

## Failure modes

- **Invalid key:** exit 2 before collection; correct the audit-only environment through the secrets manager.
- **Missing environment file:** systemd cannot start the service; provision the file and check its path and permissions.
- **Failed probe:** the live-state section says `UNVERIFIED`; check the named dependency and retry.
- **Missing lane or sign-in:** cli-run returns its failure code, retaining failed output and preserving the last good report. Configure that user's vendor sign-in and PATH.
- **Timeout:** the watchdog stops probe descendants, and the service's whole-job deadline kills its cgroup. A killed run can leave a non-secret report temp file; a later run sweeps report temps older than a day.

## Verify a job ran

```bash
systemctl --user status weekly-audit.service
journalctl --user -u weekly-audit.service -n 50
ls -la {{INSTALL_DIR}}/reports/
```

For a manual check, start `systemctl --user start weekly-audit.service`, then run the checks above. Confirm a new dated report contains the expected gap analysis and read any `UNVERIFIED` sections before treating the run as healthy. Verify the service uses the audit-only environment by inspecting its `EnvironmentFile=` path, never by printing environment values. Test coverage in the package's `test/security-vm.test.js` uses synthetic runtime credentials and stub CLIs to check stdin delivery, child environment isolation, invalid keys, and report preservation; it calls no vendor service.

## What the job guarantees

- **Bounded:** every probe (gateway, `systemctl`, each CLI `--version`) runs under a 10 s watchdog; the model call under 600 s; the unit under `TimeoutStartSec=900`, which kills the whole cgroup.
- **Previous report preserved:** output goes to a temp file and is renamed over `audit-<date>.md` only on a clean, non-empty run. A failed run leaves `failed-audit-<stamp>-rc<N>.md` beside it and the last good report untouched.
- **Boundary:** the lane runs with the strongest restriction it offers ({{AUDIT_LANE_BOUNDARY_NOTE}}). The brief's denied-actions list is an instruction, not an enforcement, for lanes without a sandbox flag.
- **Honest unknowns:** a probe that times out writes an `UNVERIFIED` line, which the brief tells the lane to treat as unknown, never clean.
- **Credential separation:** the gateway bearer is never written to a temp file or passed on argv, and gateway/provider keys are absent from version probes and the report worker's environment. Stored vendor sign-ins remain available.

A timer that has never been seen to fire is not known to work. Run `systemctl --user start weekly-audit.service` once by hand and read the journal before trusting the schedule.

## Source of truth

The installed `vm/jobs/weekly-audit.sh`, `weekly-audit.service`, and `weekly-audit.timer` define behavior; the copied unit in `~/.config/systemd/user/` is what systemd runs. This README describes that job end to end. Live scheduling and vendor authentication remain UNVERIFIED until the manual run succeeds on your VM.
