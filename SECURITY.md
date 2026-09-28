# Security policy

The installer writes files inside the folders you name (`--dir` and `--project`). It never installs third-party packages, runs vendor shell scripts or writes credentials. Companion tools are opt-in; their guides and launch snippets use the exact versions in `src/catalog.js`. You run any third-party installation yourself. Home-level agent configuration is outside the installer scope.

Existing documents stay by default. `--force` explicitly replaces them; `--update-docs` replaces only unchanged managed documents. Machine-owned manifests and lane configuration refresh on every run, and unchanged managed runtime files upgrade automatically. `--upgrade-runtime` explicitly replaces runtime files. Project activation merges supported rules, hooks and companion entries with backups; interactive confirmation enables it by default, while `--yes` requires `--apply-snippets`. See [installation and ownership rules](docs/install.md).

`bin/cli-run.mjs` spawns the agent CLI you name with your prompt in its own process group and kills that group on timeout, overrun or signal. Vendor CLIs and companion tools may access the network and local data under their own permissions. The separately invoked level 3 setup and weekly audit scripts have their own installation and network behavior; inspect their generated instructions before running them.

Completed reviews and current guarantees: [security review history](docs/security-review-history.md), [guarantees](docs/guarantees.md) and [changelog](CHANGELOG.md).

## Reporting a vulnerability

Use GitHub's private vulnerability reporting on this repository (Security tab, "Report a vulnerability"). That opens a private advisory only the maintainer can read. Please do not open a public issue for anything that could let the installer write outside the named folders, run code it should not, expose a key, or let `cli-run` exit 0 for a lane that produced nothing.

You will get an acknowledgement within 7 days and a fix or a reasoned "won't fix" within 30. Only the latest release receives fixes. Credit is given in the changelog unless you ask otherwise.

Findings are reproduced before they are acted on; `CLEAN` is an acceptable outcome for a report that does not reproduce. Non-sensitive bugs go in a regular issue with the bug form.

## Scope

In scope: `bin/`, `src/`, `scripts/`, the templates, and the files the installer writes from them (the weekly audit job, compose file, gateway config and setup script included). Out of scope: the agent CLIs, models and companion tools this package links to; report those to their own projects.
