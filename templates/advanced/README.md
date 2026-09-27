# templates/advanced/

Written at level 3 only, on top of everything below it. Everything lands under `vm/` in the user's install. This tier is documentation and config templates for a Linux box; the installer never touches a remote machine.

| File | What it is |
|---|---|
| `vm/README.md` | start-here for the box: what runs where, the gateway-holds-the-keys rule, the closed loop |
| `vm/setup-vm.sh` | manual Ubuntu setup: dependencies and selected CLIs; prints vendor scripts for review. After sign-ins and secret injection, `--start-services` starts Compose and verifies the selected local lane |
| `vm/docker-compose.yml` | the gateway (and a local model runtime if selected), bound to loopback |
| `vm/gateway.config.yaml` | one lane per selected provider, keys referenced by environment variable NAME only |
| `vm/ENVIRONMENT.md` | which variable names the gateway expects, and where to keep the values (a secrets manager, never a file in the repo) |
| `vm/box-CLAUDE.md` | the rules a Claude Code session on the box inherits: cheapest tier that does the job, what never goes to the cheap tier, no public bind |
| `vm/PRIVACY_GATES.md` | configurable data classes, allowed and barred lanes, and the authorization check before dispatch |
| `vm/jobs/` | a systemd timer + service pair for the weekly gap-analysis audit, plus an index |
