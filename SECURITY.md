# Security policy

This tool writes files into folders you name (`--dir` and `--project`) and, only after you say yes per package, runs `npm install -g <package>` for packages pinned in `src/catalog.js`. It never runs a vendor shell script, never writes a credential, and never overwrites a document without `--force`; the two stated exceptions (machine-owned config, hash-verified runtime files) are in the README. `bin/cli-run.mjs` spawns the agent CLI you name with the prompt you give it, in its own process group, and kills that group on timeout, overrun or signal. Nothing here makes a network call of its own; the vendor CLIs and `npm install` do.

Threat model and the audit rounds that shipped with each release: `docs/audit-brief.md` and `CHANGELOG.md`.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). That opens a private advisory only the maintainer can read. Please do not open a public issue for anything that could let the installer write outside the named folders, run code it should not, expose a key, or let `cli-run` exit 0 for a lane that produced nothing.

You will get an acknowledgement within 7 days and a fix or a reasoned "won't fix" within 30. Only the latest release receives fixes. Credit is given in the changelog unless you ask otherwise.

Findings are reproduced before they are acted on; `CLEAN` is an acceptable outcome for a report that does not reproduce. Non-sensitive bugs go in a regular issue with the bug form.

## Scope

In scope: `bin/`, `src/`, `scripts/`, the templates, and the files the installer writes from them (the weekly audit job, compose file, gateway config and setup script included). Out of scope: the agent CLIs, models and companion tools this package installs or links to; report those to their own projects.
