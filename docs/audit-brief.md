# AUDIT_BRIEF.md: adversarial audit of model-orchestrator (round 1)

> Historical document. Counts in it (tests, files) are as of the round they describe; `npm test` prints the current number.

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

## New in 0.1.15: two claude-code-only hooks

`route-gate.mjs` (`UserPromptSubmit`) and `subagent-context.mjs` (`SubagentStart`) ship to `.claude/hooks/` only when claude-code is the primary. Both are plain Node, zero deps, and installed with mode `0o755`.

- **Reads.** `route-gate.mjs` reads at most 64 KB from one file: the routing rules file (`ROUTING.md` or `ORCHESTRATOR.md`) at a path rendered in at install time relative to `CLAUDE_PROJECT_DIR`, never a hardcoded absolute path. Before opening it, it `statSync`s the resolved path (following a symlink to its target) and refuses anything that is not `isFile()`, a FIFO, socket, device or directory included, so the read never touches a path that could block on open. The read itself is one `openSync` + one bounded `readSync` into a fixed 64 KB buffer, closed in a `finally`, so neither the time nor the memory this hook uses depends on how large the file on disk actually is. It then extracts the text between `<!-- route-gate:start -->` and `<!-- route-gate:end -->` and nothing else. `subagent-context.mjs` reads nothing from disk; its context is static text plus the same two rendered paths. Neither parses or executes anything it reads; the extracted block is passed through as a string.
- **Stdin.** Neither hook uses a field from the JSON input Claude Code sends on stdin, but both must still consume the pipe rather than ignore it. Both drain stdin asynchronously against a 250ms hard cap: whichever comes first, the real `end` event or the timeout, the hook proceeds. Neither ever calls a blocking, synchronous read of stdin.
- **Writes.** Neither writes a file. Both write one JSON object to stdout: `{"hookSpecificOutput":{"hookEventName":"...","additionalContext":"..."}}`, and both exit only after that write's callback fires, so a buffered write to a pipe is not truncated by an exit racing ahead of it.
- **Fail-open, on purpose.** A missing `CLAUDE_PROJECT_DIR`, a missing rules file, a non-regular file at the rules path, or a missing block each produce a one-line fallback `additionalContext` naming what was found, and the script still exits 0. This is acceptable because a miss here is a stray context string reaching the model, not a security gate: nothing downstream trusts the hook's output for anything but a routing suggestion, and the settings snippet that wires it in is a document the user merges by hand, never written automatically over an existing `settings.json`.
- **Bounded.** `route-gate.mjs` caps the read at 64 KB regardless of the file's reported size and the injected string at 4000 characters, so a rules file bloated by a bad edit, or truncated to an arbitrary length, cannot balloon the context or the read time on every turn. Both hooks cap stdin drain at 250ms.
- **Not yet attacked.** Untested here: a rules file with a `route-gate:start` marker but no matching end marker very far into the file (bounded by `MAX_READ`, so the end marker past that point is treated as absent, which is the intended fail-open path, but worth a deliberate case); a `CLAUDE_PROJECT_DIR` pointing at a path with no read permission; behavior under the Windows exec-form `node` + `args` invocation named in the settings snippet; a `statSync` that itself hangs (a stalled network filesystem, for instance) rather than the FIFO-at-open case this round fixed.

### Round 1 (pre-release), fixed before shipping

Three findings reproduced against the 0.1.15 branch before it shipped, none of them ever released:

| # | Finding | Fix |
|---|---|---|
| 1 | HIGH. `readFileSync(0)` in both hooks blocked until stdin reached EOF (`sleep 3 \| ... node route-gate.mjs` still running past 1.5s); `route-gate.mjs` also read the whole rules file into memory before bounding it, so a FIFO planted at the rules path blocked forever on open. | Stdin is drained asynchronously against a 250ms hard cap in both hooks. `route-gate.mjs` refuses anything that is not `isFile()` via `statSync` before ever calling open, then reads through one fixed 64 KB buffer via `openSync`/`readSync`. Tests: an open, never-closed stdin pipe exits within 1s for both hooks; a FIFO at the rules path returns the fallback instead of hanging; a 200 MB sparse rules file completes in well under a second with output still capped. |
| 2 | MEDIUM. `done-verifier`'s description, both agent-folder READMEs, and the root README called it "read-only" without qualification, while its claude-code file carries an unrestricted `Bash` grant; nothing in that grant stops it from running a mutating command. | Every one of those surfaces now says plainly that `done-verifier` carries no file-editing tools and that its Bash use is bound by its own prompt, not by the tool grant; `reader` is named as the one that is read-only by tool grant (no Bash) on both formats. |
| 3 | MEDIUM. Three generated surfaces still stated the pre-0.1.15 premise on a claude-code install: `builder.md`'s description ("... or the main build itself"), `build-protocol.md`'s roles table and its "why the builder does not hand off" note, and `ROUTING.md`'s "Plan big, execute small" line ("the orchestrator executes"). | All three now render through `subagentsLoadRules(primary)`, the same gate the decision tree and "Who builds" already used; every other primary is unchanged. A semantic-regression test asserts a claude-code install contains none of the old phrasing and a codex install still does. |

## New in 0.1.16: a third hook, route-metrics.mjs

`route-metrics.mjs` ships to `.claude/hooks/` alongside `route-gate.mjs` and `subagent-context.mjs`, only when claude-code is the primary. Same shape as the other two: plain Node, zero deps, mode `0o755`. Unlike them, it is wired to five events at once (`UserPromptSubmit`, `PreToolUse` matched to `Agent|Task`, `SubagentStart`, `SubagentStop`, `Stop`), and it does write, deliberately: one JSON line per event, appended to `~/.ai-orchestrator/route-metrics.jsonl`.

- **Reads.** Only its own stdin (the JSON Claude Code sends per event) and, for `--summary`, its own log file. It never reads `transcript_path` even though that field is present on every event: the documented source for the route marker is `last_assistant_message`, and the docs say the transcript can lag, so a hook that read it instead could log a stale or absent marker as if it were current. It never reads the rules file, the task bundle, or any other project file.
- **Writes.** `~/.ai-orchestrator/route-metrics.jsonl` (append-only, rotated to `.jsonl.1` above 5 MB) and `~/.ai-orchestrator/route-metrics.state/<sha256(agent_id)>.json`, a small file recording a subagent's start time and type so `SubagentStop` can compute a duration; it is deleted on stop, and anything older than 24h is pruned on the next `SubagentStart`. Nothing outside `~/.ai-orchestrator/`. It never writes to stdout: on `UserPromptSubmit` and `SubagentStart`, stdout becomes model context, and this hook has nothing to say there, so it stays silent on every event, not just those two.
- **What it never logs.** Prompt text, tool descriptions, the full `tool_input`, `last_assistant_message` itself, or the "why" half of a route marker. Only six named fields ever reach a record: `session_id`, `subagent_type`, `agent_type`, and the parsed `lane`, each stripped to `[A-Za-z0-9_.+-]` and capped at 64 characters (128 for `session_id`) before being written, plus the event name and a `duration_s` number it computed itself. This mirrors `bin/cli-run.mjs`'s own log, which stores a fixed reason code and never a provider-supplied string.
- **Fail-open, on purpose.** Every code path that can fail (a malformed state file, a full disk, a rotation race, invalid JSON on stdin, an unrecognized event) is caught and produces no record rather than a thrown error or a non-zero exit; the process always exits 0. A miss here is a missing line in a telemetry log, never a blocked turn, so there is nothing to gate.
- **Bounded.** Stdin is drained asynchronously against a combined 1s time cap and 8 MB size cap; a payload that exceeds either is treated as truncated and parsed as nothing, never partially. `--summary` reads the log directly (never spawns anything, never executes a line in it).
- **Not yet attacked.** Untested here: two processes racing the same rotation at once (a rename plus an append landing on the same file); a state directory with thousands of leaked files from a long-lived session with a crashed hook (pruning runs, but only on `SubagentStart`, so an install that never starts a subagent again would never prune); behavior if `agent_id` collides across two concurrent subagents (sha256 makes this astronomically unlikely, not impossible).

## New in 0.1.18: the Windows spawn path

`bin/cli-run.mjs` runs a lane's binary through `windowsSpawnPlan()` before every `spawn()` call. On POSIX, and for a plain `.exe` or extensionless binary on Windows, this is a no-op: the same argv reaches `spawn()` with no shell, exactly as before. What changed is the two shapes Windows can hand it that used to reach `spawn()` unchanged and throw `EINVAL` (Node's fix for CVE-2024-27980: a `.bat`/`.cmd` target without `shell: true` is refused rather than run through an unsafely-escaped `cmd.exe`).

- **What runs, in order.** `resolveCmdShim(cmdPath)` reads the `.cmd` file and looks for the exact line npm's `cmd-shim` package writes: `"%_prog%" ... "<path>" %*`, where `<path>` is `%dp0%`-relative (verified against the real, byte-for-byte output of `cmd-shim@9.0.2`, the package npm itself uses to write a shim from a package.json `bin` entry with a `#!/usr/bin/env node` shebang; `test/judges.test.js` pins that exact fixture). If it matches, the `%dp0%`-relative path is resolved against the `.cmd` file's own directory and checked with `statSync` (must exist, must be a file, must end in `.js`/`.mjs`/`.cjs`); on success, `windowsSpawnPlan()` returns `{ command: process.execPath, args: [scriptPath, ...args] }`, and `spawn()` runs `node <script> <args>` directly. A lane's prompt (argv[1] and on) is text this tool does not control the contents of; this path never puts it anywhere a shell parses it.
- **Why no shell in the common case.** Every real lane (grok, codex, agy, hermes, qwen) is an npm-installed Node CLI, so on a real Windows install this branch is the one every run takes; the fallback below exists for a shim this parser does not recognize, not for the common path.
- **The fallback, and how its shell arguments are escaped.** If `resolveCmdShim` returns nothing (an old cmd-shim layout, a hand-written `.cmd`, or a `.bat`), `windowsSpawnPlan()` builds one command-line string with `escapeCmdArg`/`buildCmdExeCommand` and returns `{ command: <ComSpec>, args: ['/d', '/s', '/c', <built string>], options: { windowsVerbatimArguments: true } }`. The algorithm is the one documented at [qntm.org/cmd](https://qntm.org/cmd) (the reference writeup of `cmd.exe`'s quoting behavior) and used by the widely-deployed `cross-spawn` package: each argument is quoted the way `CommandLineToArgvW` expects (backslash-doubling before an embedded quote or at the end of the string, then wrapped in `"`), and THEN every `cmd.exe` metacharacter in that quoted text (`( ) % ! ^ " < > & | ; ,` and space) is caret-escaped, because `cmd.exe`'s own line scanner reads those characters off the raw command line before the quoting is honored, quote or no quote. `windowsVerbatimArguments: true` tells Node not to re-quote the string a second, conflicting way. `test/judges.test.js` pins exact expected output for `&`, `|`, `^`, `%`, a literal `"`, a trailing backslash and a literal newline (the last one deliberately unescaped: it is not a `cmd.exe` metacharacter).
- **`killTree` needs no change for either path.** `taskkill /pid <pid> /T /F` walks the whole descendant tree regardless of whether the direct child is `node` (the resolved-shim path) or `cmd.exe` (the fallback); there is no intermediate shell layer to lose track of in the common case, since there is no shell there at all.
- **Not yet attacked for real.** `windowsSpawnPlan`, `resolveCmdShim` and the escaping functions are unit-tested (pure string logic, runs on every CI host) and the resolved-shim path is exercised end to end on `windows-latest` through the fake-lane fixtures in `test/cli.test.js` (installed as a real npm-style `.cmd` shim). The `cmd.exe` fallback branch is not exercised end to end through a live Windows process anywhere in this suite, since no fixture here produces an unresolvable shim on purpose; its escaping is proven by exact-string unit tests only.
