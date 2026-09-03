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

A timer that has never been seen to fire is not known to work. Run `systemctl --user start weekly-audit.service` once by hand and read the journal before trusting the schedule.
