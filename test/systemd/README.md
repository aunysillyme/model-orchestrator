# Running the generated audit job under real systemd

`npm test` runs on macOS and in CI, and neither has systemd. So the generated unit's two load-bearing lines, `TimeoutStartSec=900` and `KillMode=control-group`, were asserted as **text** for the life of this package: a test read the rendered file and checked the strings were present. Nothing ever started the unit.

[#11](https://github.com/aunysillyme/model-orchestrator/issues/11) asked for that gap to be closed: *"Exercise generated job failure behaviour on Ubuntu, including permissions, timeout cleanup, report preservation, and missing environment/configuration."*

`run-on-ubuntu.sh` does it. It is **not** part of `npm test`: it needs a Linux host with a systemd user manager, so it stays a deliberate, manual run.

## Running it

On a Linux box with systemd and `loginctl show-user <you> -p Linger` returning `Linger=yes`:

```bash
# from a machine that has this repo, generate a level 3 install and ship the job
node bin/cli.js --yes --level 3 --ais claude-code,codex,grok --primary claude-code \
  --dir /tmp/gen --project /tmp/proj --no-install --no-tools --no-apis
scp /tmp/gen/vm/jobs/weekly-audit.sh  <host>:~/orch-systemd-test/weekly-audit.src
scp test/systemd/run-on-ubuntu.sh     <host>:~/orch-systemd-test/run.sh

# on the box
export XDG_RUNTIME_DIR=/run/user/$(id -u)
bash ~/orch-systemd-test/run.sh        # exits non-zero if any assertion fails
```

It installs a **real** systemd user unit, runs the **real** generated script, and swaps in a stub lane runner so nothing calls a vendor and nothing costs money. It cleans its unit up afterwards.

## What it proves

| | Claim | How it is proved |
|---|---|---|
| A | The unit's deadline fires, and the cgroup kill reaches everything the lane spawned | The stub spawns a **detached grandchild** (`sleep 600`, `unref`'d) and records its pid, then hangs. After the timeout, the harness asserts `Result=timeout` and that the grandchild's pid is gone. A kill that only reached the direct child would leave it alive. |
| B | A failed rerun never truncates the previous report | Writes a known report, hashes it, runs the lane at rc 10, asserts the hash is unchanged, and that the partial output was kept as `failed-audit-<stamp>-rc10.md`. |
| C | A malformed gateway key is refused before anything is written | Runs with a key failing `^[A-Za-z0-9._-]+$`, asserts exit 2 and an unchanged report. |
| D | A clean run still does replace the dated report | Guards against a fix to B that breaks the happy path. |
| E | An orphaned temp file is swept, a possibly-live one is not | See below. |

**Last run: 11/11 passed**, Ubuntu 24.04.4 LTS, systemd 255 (255.4-1ubuntu8.17), 2026-09-07.

## What running it actually found

A defect that text assertions could not reach. **A run killed by `TimeoutStartSec` dies on SIGKILL**, so no trap and no cleanup line in the script gets to run, and its `reports/.audit-<stamp>-XXXXXX` temp file is orphaned. One per timeout, accumulating forever. The report-preservation guarantee still held; the tidiness one did not.

Fixed in 0.1.10 by sweeping `.audit-*` files older than a day at job start. A day is deliberately far outside the unit's own 900s deadline, so the sweep can never remove a temp belonging to a run that is still going. Test E pins both halves: the aged orphan is removed, a fresh one is left alone.

## Honest limits

- The lane is a stub. This exercises the **job's** control flow, not a vendor call.
- One distribution, one systemd version. Nothing here claims other init systems or older systemd behave the same.
- It runs as a **user** unit. A system unit adds its own permission surface that this does not cover.
