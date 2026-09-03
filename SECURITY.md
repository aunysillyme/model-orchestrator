# Security

This tool writes files into a folder you name and, only after you say yes per package, runs `npm install -g <package>` for packages listed in `src/catalog.js`. It never runs a vendor shell script, never writes a credential, and never overwrites an existing file without `--force`. `bin/cli-run.mjs` spawns the agent CLI you name with the prompt you give it.

Threat model and the adversarial audit that shipped with the first release: `docs/audit-brief.md`.

## Reporting

Open a private vulnerability report on GitHub (Security tab, "Report a vulnerability") or a regular issue if the finding is not sensitive. Include a reproduction. Findings are reproduced before they are acted on, and `CLEAN` is an acceptable outcome for a report that does not reproduce.
