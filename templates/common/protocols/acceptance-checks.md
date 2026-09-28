# Acceptance checks (`aunx checks`)

- When a requirement determines acceptance, quote it and turn it into an observable property of the final artifact.
- Scaffold a checks file with `aunx checks`. Replace the intentionally failing example with a real verifier before using the file.
- Prefer an argv array for `command`, for example `["node", "--test", "test/example.test.js"]`. String commands run through the local shell, so review them as executable code before running a checks file.
- Set `cwd` relative to the checks file. Keep checks inside the task's authorized scope.
- Checks run sequentially with inherited terminal output. A timeout stops the command and its ordinary descendants; interrupts stop the run. A finished check must not leave a background service running. This lifecycle cleanup is not a sandbox for hostile programs that escape their process group.
- Demonstrate a failing case for each new gate before trusting a passing result.
- Include availability facts when later work depends on a tool, permission or service remaining accessible.
- Run `aunx checks run ACCEPTANCE_CHECKS.json` against the final artifact. A failed command gives the gate exit code 1.
- When a check needs human judgment, record `manual: true` and its procedure in `description`. A manual or unverified check blocks the automated gate until replaced by a verifiable result; it is never silently counted as PASS.
- When packaging, rendering or deployment can change the property, replay the check against that materialized output too.
- When scope changes, preserve the original check and the decision that replaces it in the decision log.

When the command runner is unavailable, run each verifier with the project's local runtime and record its exit code. Optional companion tools can supply a verifier; their absence calls for an equivalent local check or an explicit UNVERIFIED result.
