# jobs/

Scheduled work on the box, as user-level systemd timers. Each job is a timer + service pair and gets one line in the table below. **Each line names what watches it.** "nothing" is an honest answer and the one that tells you where to look.

| Job | Schedule | Does | Lane | Watched by |
|---|---|---|---|---|
| `weekly-audit` | Monday 09:00 | collects live state (gateway lanes, timers, CLI versions), composes a brief with the protocol and `DELEGATION_MATRIX.md`, and asks a cli-run lane for the gap report | `{{AUDIT_LANE}}` (first enabled lane at install time; edit `AUDIT_LANE` in the script to change it) | nothing yet: wire a notifier and update this line |

Paths in the service and the script were rendered for this install: `{{INSTALL_DIR}}`. If you move the folder, re-run the installer or edit both files.

## Install a job

```bash
mkdir -p ~/.config/systemd/user
cp weekly-audit.service weekly-audit.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now weekly-audit.timer
systemctl --user list-timers        # it should be listed with a next-run time
loginctl enable-linger "$USER"      # so user timers run without a login session
```

The service reads `GATEWAY_MASTER_KEY` from an `EnvironmentFile` that lives outside this folder (mode 600). Point the `EnvironmentFile=` line at yours before installing. The key must be a single token matching `^[A-Za-z0-9._-]+$`; the script refuses anything else.

## Verify a job ran

```bash
systemctl --user status weekly-audit.service
journalctl --user -u weekly-audit.service -n 50
ls -la {{INSTALL_DIR}}/reports/
```

## What the job guarantees

- **Bounded:** every probe (gateway, `systemctl`, each CLI `--version`) runs under a 10 s watchdog; the model call under 600 s; the unit under `TimeoutStartSec=900`, which kills the whole cgroup.
- **Previous report preserved:** output goes to a temp file and is renamed over `audit-<date>.md` only on a clean, non-empty run. A failed run leaves `failed-audit-<stamp>-rc<N>.md` beside it and the last good report untouched.
- **Boundary:** the lane runs with the strongest restriction it offers ({{AUDIT_LANE_BOUNDARY_NOTE}}). The brief's denied-actions list is an instruction, not an enforcement, for lanes without a sandbox flag.
- **Honest unknowns:** a probe that times out writes an `UNVERIFIED` line, which the brief tells the lane to treat as unknown, never clean.

A timer that has never been seen to fire is not known to work. Run `systemctl --user start weekly-audit.service` once by hand and read the journal before trusting the schedule.
