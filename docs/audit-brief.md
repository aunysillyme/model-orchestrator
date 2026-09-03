# AUDIT_BRIEF.md: adversarial audit of model-orchestrator (round 1)

Read-only audit. Report findings only; do not modify files. Rank by severity. For each finding: file, line, what breaks, a concrete reproduction. `CLEAN` is a valid answer for any area with no reproducible finding. Skip style.

## Task bundle

**Purpose.** Adversarial, read-only audit of this npm package before it is published, so that reproducible defects are fixed before strangers run it.
**Task class.** read_only

**Granted scope.**
- Every file under this repository root: `bin/`, `src/`, `templates/`, `test/`, `scripts/`, `docs/`, `package.json`, `README.md`.
- Anything outside this repository is out of scope. Do not widen it on your own judgment.

**Capabilities.** read files, run `npm test`, run `node bin/cli.js` with `--dry`, run `node bin/cli-run.mjs` with bad arguments, run scripts against a temp directory under /tmp.

**Denied actions.** Do not modify, create or delete any file in this repository. Do not run `npm install -g`. Do not run any vendor installer. Do not commit, push, or publish. Do not read files outside this repository except /tmp scratch you created. Do not call any network service.
- Anything absent from Capabilities is denied. Absence is not permission.

**Conventions you do not have.** Report in plain prose with a findings list. No style nitpicks. `CLEAN` is a valid verdict per area. Every finding needs a concrete reproduction (command + observed vs expected). Never print a value that looks like a credential.

**Report contract.** Return: a severity-ranked list of findings (file, line, what breaks, reproduction, suggested fix in one or two sentences), then a `CLEAN` line for each area in "Attack these" that had no reproducible finding, then a short "not covered" list naming anything you did not check or could not verify.

**Exit parameters.** Stop after 12 minutes of wall clock or after reading every file once and running at most 30 commands, whichever comes first. If you hit a bound, report what you have and name what you did not cover. Never return nothing.

## What this is
An npm package (`npx model-orchestrator`) that asks a user which level (1/2/3) and which AIs they have access to, then writes markdown + config templates into a folder, and optionally runs `npm install -g <pkg>` for known packages after an explicit per-package yes. It also ships `bin/cli-run.mjs`, a wrapper that runs one of five agent CLIs (grok, codex, agy, hermes, qwen) and exits non-zero unless the lane produced a deliverable.

## Runtime
Node >= 18, ESM, zero dependencies. Runs on a stranger's laptop (macOS/Linux) with their PATH and HOME. Level 3 writes shell/systemd/compose templates the user will run on a Linux box.

## Threat model
- The user is not an adversary but is careless: runs it in the wrong directory, passes odd flags, has files with the same names.
- Untrusted input reaches `cli-run.mjs` through CLI stdout (JSON from third-party binaries) and through `lanes.json` on disk.
- The installer must never: write a secret value anywhere, overwrite a user file without --force, run a remote shell script, escape the target dir (path traversal via template rel paths or --dir), or leave a placeholder unrendered.
- `cli-run.mjs` must never: throw on malformed CLI output (a throw is misreported as a usage error), pass a secret in argv, leave temp files, hang on stdin, or report success without a deliverable.
- Generated templates (`vm/setup-vm.sh`, `vm/jobs/weekly-audit.sh`, `docker-compose.yml`, `gateway.config.yaml`) must not put a key in argv, bind to 0.0.0.0, or pipe a remote script into bash.

## Already verified (do not repeat)
- 60 node --test cases pass, including every judge's failure shapes and a mutation check that turns one case red.
- Placeholders: every template renders for every level and primary without a leftover `{{KEY}}`.
- README inside `.claude/agents/` is not installed.

## Attack these
1. `bin/cli.js` argument parsing: `opt()` takes the next argv token; what happens with `--dir --force`, `--ais ""`, duplicate flags, `--level 2.5`, unicode, a `--dir` that is a file, a `--dir` of `/`?
2. `src/install.js` `writeFiles`: path traversal if a template rel path or the --dir resolves outside; symlink in the target dir; mode handling on Windows; partial writes.
3. `src/detect.js` `which`: PATH entries that are files, empty PATH, relative PATH entries, a directory named like the binary.
4. `bin/cli-run.mjs`: `jsonLines` on huge output; `maxBuffer`; `spawnSync` with `timeout` and `killSignal` behaviour; `enabledLanes()` with a malicious lanes.json; `--brief` pointing at a directory or a huge file; prompt containing newlines; the codex `-o` temp file when the CLI writes elsewhere; the `import.meta.url === pathToFileURL(argv[1])` main guard when invoked via a symlink; rc pass-through logic (`if (r.status !== 0 && code === OK) code = r.status`).
5. Templates: `vm/setup-vm.sh` (set -euo pipefail, the for loop over {{NPM_PACKAGES}} when empty), `vm/jobs/weekly-audit.sh` (curl --config - header injection if GATEWAY_MASTER_KEY contains a quote or newline), `docker-compose.yml` env pass-through, systemd unit paths.
6. Anything that could make the installer write outside `--dir` or read a file it should not.

## Design decisions to challenge, with reasoning
- Zero dependencies (no inquirer): smaller audit surface, but the prompt code is hand-rolled. Is the readline path safe with piped stdin and EOF?
- Vendor scripts are printed, never run: correct? Or does printing `curl | bash` still encourage the unsafe pattern?
- `npm install -g` is run after a per-package yes, with the package name from the catalog (never user input). Confirm user input cannot reach that argv.
- `writeFiles` refuses existing files unless --force but does not check that the target is inside cwd. Deliberate (users may want `~/project`). Is there a traversal risk from template names?

## How to run
`npm test` · `node bin/cli.js --help` · `node bin/cli.js --yes --level 3 --ais claude-code,codex,agy,grok,hermes,qwen,ollama --dir /tmp/x --dry`

## ROUND 2 (after round-1 fixes)

Re-audit the same scope. Every round-1 finding was reproduced before it was touched. What changed:

| # | Finding | Change |
|---|---|---|
| 1 | writeFiles escape / symlink follow | `preflight()` in `src/install.js`: containment under the resolved root, lstat every existing component (symlink or non-directory parent refused), exclusive `wx` create unless `--force`, rollback of files this run created if a later write fails. Tests: escape, symlinked component, conflicting parent leaves nothing behind. Mutation-checked. |
| 2 | prompt in argv + logged head | argv kept (each vendor's documented headless shape); DEFERRED as a vendor constraint, documented in `CLI-RUN.md` and the file header (no secrets in prompts, ARG_MAX, reference big briefs by path). Log now stores a 12-hex sha256 prefix and length, never text. Test: marker absent from log. |
| 3 | unknown flags / missing values | strict `parseArgs` in `bin/cli.js`: unknown flag, missing value, empty value, duplicate, positional → exit 2 before planning. Tests for each. |
| 4 | audit job hardcoded hermes | `auditLane()` picks the first ENABLED cli-run lane (hermes, qwen, codex, agy, grok); none → rendered guard exits 13. Tests. |
| 5 | audit never received live state | script composes `reports/audit-brief-<date>.md` = task bundle + protocol + DELEGATION_MATRIX + live-state, and passes THAT as `--brief`. Test. |
| 6 | `--dir` ignored by systemd paths | `INSTALL_DIR` rendered into the service and the script from the resolved `--dir`. Test. |
| 7 | curl config injection | script refuses a key not matching `^[A-Za-z0-9._-]+$` (exit 2) before any curl; documented in ENVIRONMENT.md and vm/README. Test executes the rendered script with an injecting key. |
| 8 | malformed lanes.json fail-open | `enabledLanes()` returns null on present-but-invalid; main refuses every lane (13) and says so. Test proves no spawn happens. |
| 9 | signal → exit 0 | `r.signal || r.status === null` → verdict killed, exit 10, partial output discarded. Test. |
| 10 | partial install | covered by preflight + rollback (finding 1). Test. |
| 11 | directory detected as binary | `isFile()` check in both `which()` implementations. Test. |
| 12 | `curl \| bash` printed | download / read / run form printed instead. |

Also new since round 1: the companion-tool path (`--tools codecalc`, `--no-tools`, `templates/tools/codecalc/`, `protocols/numbers-and-logic.md`, `resolveTools`). Attack it the same way: unknown tool ids, interaction with `--yes`, the extra interactive question, and whether any written snippet could be confused for a file the installer should not touch.

Report only what reproduces on the current tree. `CLEAN` per area is expected where the fix holds.
