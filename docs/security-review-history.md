# Security review history

This page summarizes completed reviews recorded in the [changelog](../CHANGELOG.md) and their regression checks. It records the releases reviewed, what failed and what changed. It carries no claim that a past review verifies a later release.

## Review rounds and fixes

| Release | Review recorded | What the review found | What changed and where it is checked |
|---|---|---|---|
| 1.0.2 | Independent review of 1.0.1 by a second model family, then an audit of its fix | A detached check descendant outlived the timeout while the notes said descendants stop; a symlinked-manifest refusal named no file or fix; refusal paths could carry terminal escapes; a directory got symlink advice | The protocol states the process-group limit; refusals name the path, escape control characters and give advice by file type; `test/security-messages.test.js` |
| 1.0.1 | Codex Security scan and regression-backed remediation | A metrics summary executed project code; manifest reads and check descendants needed bounds; weekly jobs inherited gateway credentials | Packaged metrics dispatch, bounded file readers, check process-tree cleanup, stdin-only gateway probe and separate audit environment; `test/security-cli.test.js`, `test/security-vm.test.js`, `test/security-pins.test.js` |
| 0.1.0 | Initial review and follow-up round, with a second model-family review | Paths could escape the write roots, partial writes could remain, malformed arguments could proceed, and empty results could appear successful | Containment preflight, exclusive writes with rollback, strict flag parsing and vendor-specific result checks; `test/install.test.js`, `test/cli.test.js`, `test/judges.test.js` |
| 0.1.1 | Follow-up on issues #1 through #10 | Child processes could survive timeouts; a failed scheduled run could replace a good report; logs could contain provider text | Process-group cleanup, temporary report plus rename, bounded probes and fixed log codes; `test/cli.test.js`, `test/install.test.js` |
| 0.1.2 | Follow-up on issues #12 through #15 | Interrupt cleanup, split UTF-8 output and stale existing files could produce misleading results | Interrupt handlers, streaming decoders and a pre-run snapshot for `--expect-file`; `test/cli.test.js` |
| 0.1.3 | Independent repository review | Version pins, runtime-upgrade reporting and setup documentation disagreed | Shared catalog rendering, explicit upgrade reports and catalog checks; `test/catalog.test.js`, `test/install.test.js` |
| 0.1.15 | Pre-release review of routing hooks | Open stdin and non-regular rules files could hang hooks; some review agents were described more restrictively than their tools enforced | Bounded asynchronous stdin, regular-file checks and bounded reads; tool-grant wording corrected; `test/hooks.test.js`, `test/install.test.js` |
| 0.1.16 | Permission-claim follow-up | Agents with Bash were described as read-only without qualifying the command permission | Every such claim now distinguishes prompt instructions from actual tool restrictions; `test/install.test.js` |
| 0.1.18 | Windows execution checks and CI follow-up | npm shims needed safe direct execution; watchdog ordering could hide a timeout | Resolve supported shims to Node, refuse unresolved batch targets for runner calls, preserve timeout markers; `test/judges.test.js`, `test/cli.test.js`, `test/install.test.js` |
| 0.1.20 | Pre-release plugin review | Fallback hook text could exceed the output cap; the safety test missed asynchronous writes and subprocesses | Bound emitted strings and expand the guard with failing examples; `test/hooks.test.js`, `test/plugin.test.js` |
| 0.1.23 | Pre-release review of failure classification | Redaction order, escaped strings, unbounded scans, transcript containment and clipped-error classification could fail | Redact before clipping, bound scans, resolve containment with path semantics, classify full trusted error fields; `test/classify.test.js` |
| 0.1.31 | Uninstall validation recorded with release | Managed removal needed full manifest validation and preservation of user edits | Validate paths, hashes and target roots before removing anything; retain edited and foreign files; `test/uninstall.test.js` |

The current suite prints its own counts when you run `npm test`. [Platform support](../README.md) documents the tests that require POSIX behavior and the Windows limitations.

## Incident: a successful exit with no new file

A worker could finish successfully while leaving an old output file untouched. A filesystem snapshot taken before the call made that observable: `--expect-file` now requires a new or changed file. The regression checks the old-file case as well as a real update. Source: [0.1.2 release record](../CHANGELOG.md#012---2026-09-05), `test/cli.test.js`.

## Incident: a hook waiting forever for input

A routing hook waited for stdin to close, and a non-regular rules path could block a file read. The hook now bounds its stdin wait, verifies that a target is a regular file and reads into a bounded buffer. The tests leave stdin open and place a FIFO at the rules path on supported platforms. Source: [0.1.15 release record](../CHANGELOG.md#0115---2026-09-10), `test/hooks.test.js`.

## Incident: clipping before redaction

A shortened error string could lose the delimiter needed to recognize a sensitive value. Redacting the complete bounded text before shortening it fixed the ordering problem. The regression covers escaped and unterminated values without publishing real credentials. Source: [0.1.23 release record](../CHANGELOG.md#0123---2026-09-15), `test/classify.test.js`.

## Verify your own installation

Run `npm test` for fixtures and stubs. Run `aunx cli-run --doctor --run` through your own sign-ins to check current vendor behavior (direct form from the installed rules folder: `node bin/cli-run.mjs --doctor --run`). Fixture checks establish the behavior they exercise; a live run adds evidence about your installed vendors, credentials and quota.

Review current guarantees in [guarantees.md](guarantees.md). Report a vulnerability through the private channel in [SECURITY.md](../SECURITY.md).
