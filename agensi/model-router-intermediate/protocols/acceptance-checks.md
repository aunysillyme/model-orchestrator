# Acceptance checks

- When a requirement determines acceptance, quote it and turn it into an observable property of the final artifact.
- Copy briefs/ACCEPTANCE_CHECKS.json to the run's checks file. Replace the intentionally failing example with a real verifier before using the file.
- Prefer an argv array for `command`, for example `["node", "--test", "test/example.test.js"]`. String commands run through the local shell, so review them as executable code before running a checks file.
- Set `cwd` relative to the checks file. Keep checks inside the task's authorized scope.
- Run approved checks sequentially and record their exit codes. Bound long runs with the project's supported timeout or supervisor; stop descendants on timeout or interruption and verify cleanup. Manual execution provides no automatic process cleanup or sandbox.
- Demonstrate a failing case for each new gate before trusting a passing result.
- Include availability facts when later work depends on a tool, permission or service remaining accessible.
- Run each approved command from ACCEPTANCE_CHECKS.json with the local runtime against the final artifact, using its cwd relative to the checks file. Record each exit code; any failed or unverified check leaves acceptance pending.
- When a check needs human judgment, record `manual: true` and its procedure in `description`. A manual or unverified check leaves acceptance pending until verified; it is never silently counted as PASS.
- When packaging, rendering or deployment can change the property, replay the check against that materialized output too.
- When scope changes, preserve the original check and the decision that replaces it in the decision log.

When the command runner is unavailable, run each verifier with the project's local runtime and record its exit code. Optional companion tools can supply a verifier; their absence calls for an equivalent local check or an explicit UNVERIFIED result.
