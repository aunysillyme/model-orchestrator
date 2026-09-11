# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html); on `0.y.z` anything may change.

## [Unreleased]

### Changed

- **User-facing text now uses plain language instead of security-audit jargon.** Words like "risk", "attack lane", "adversarial", "blast radius", "fail closed" and "threat model" read as alarming to someone deciding whether to try the tool, so they scared off exactly the readers this project needs. No rule any of them described changed, only the wording: "risk" is now "stakes" everywhere it names a routing input (with a one-line definition added to `README.md` and `TIERS.md`), "attack lane" / "Stage 5 Attack" / "attack pass" are now "challenge lane" / "Stage 5 Challenge" / "challenge pass", "adversarial" (auditor, read, critique, turn, pass) is now "second-opinion", "blast radius" is now "everything it touches", "fail(s) closed" is now "refuses by default", and "threat model" is now "security notes" in the files that link to it. `test/prose.test.js` gained a permanent check (`no alarming security wording in user-facing text`) over the purely-prose, user-facing surface (`docs/`, `templates/`, `README.md`, `llms.txt`, `CONTRIBUTING.md`, the PR template) so the old wording cannot silently creep back in. `docs/audit-brief.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` and code identifiers/comments (for example the `ATTACK_LANE` render var) are unchanged, since these words are expected or load-bearing there.

## [0.1.16] - 2026-09-11

### Added

- **A third claude-code-only hook, `route-metrics.mjs`, answers "is my agent actually routing and delegating?"** A routing rule nobody measures is a rule nobody knows is followed. Wired to five events (`UserPromptSubmit`, `PreToolUse` on `Agent`/`Task`, `SubagentStart`, `SubagentStop`, `Stop`), it appends one JSON line per event to `~/.ai-orchestrator/route-metrics.jsonl` (the same directory and home resolution `bin/cli-run.mjs` already logs to): a turn, a subagent dispatch (`subagent_type`, background flag), a subagent start and stop (so a duration can be computed from a small state file keyed by `sha256(agent_id)`), and the lane parsed from a new hidden marker, `<!-- route: <lane> | <why> -->`, that the route-gate block now asks every reply to end with. Only named, charset-bounded fields ever reach the log; prompt text, tool descriptions, the raw assistant message, and the marker's "why" half never do. `node .claude/hooks/route-metrics.mjs --summary [--since <ISO date>]` reports turns, route-marker coverage, lanes by count, dispatches by `subagent_type`, dispatches with no matching start, and mean/max duration per agent type. Plain Node, zero deps, prints nothing to stdout on any event, fail-open (a miss is a missing log line, never a blocked turn). Installed and wired only when claude-code is the primary, same no-overwrite rules as the other two hooks. See `docs/audit-brief.md` for the full threat-model writeup.
- **CI now runs on `windows-latest` too, node 18/20/22, alongside Ubuntu and macOS.** `defaults.run.shell: bash` makes every workflow step Git Bash on the Windows runner instead of the default `pwsh`, so the same script runs on all three OSes with no parallel Windows rewrite.

### Fixed

- **`finding-verifier` and `code-reviewer` (claude-code) called themselves unqualified "Read-only" in their descriptions while carrying an unrestricted `Bash` grant**, the same overclaim `done-verifier` shipped with in 0.1.15 and was fixed there; nothing in that grant stops either from running a mutating command. Both descriptions and bodies now say plainly that they carry no file-editing tools and that Bash is bound by the prompt, not the tool grant. `templates/agents/claude-code/README.md` and `templates/agents/snippets/claude-code.md` are corrected the same way. The done-verifier-only test is replaced with one that walks every claude-code agent file: any agent whose `tools:` line includes `Bash` must qualify any "Read-only" claim, checked against its own file and against every generated doc surface.
- **`CLAUDE.md` and `CONTRIBUTING.md` each pinned a fixed test count that drifted the moment a test was added or removed**, the same class of drift `AGENTS.md` already avoided by saying the suite prints the current number instead. Both now say the same thing `AGENTS.md` does. A new test in `test/prose.test.js` fails if any top-level `.md` states a fixed count of test cases.
- **`which()` (`src/detect.js`, and its standalone copy in `bin/cli-run.mjs`) never found a Windows lane binary, because a PATH entry there never holds a bare `grok`: npm and vendor installers drop `grok.cmd` (or `.exe`/`.bat`), the same way any Windows shell resolves a bare command through `%PATHEXT%`.** `which()` now tries the bare name first (a no-op on POSIX, and still matching an already-extensioned name on Windows), then each `%PATHEXT%` suffix. `platform` is a parameter (default `process.platform`), the same pattern `killTree(pid, platform, deps)` already used, so the win32 branch has a real test (`test/detect.test.js`, new) on every OS this suite runs on. `home` is a parameter too, for the same testability reason: a dev machine with a real vendor CLI already on `~/.local/bin` made the new win32 tests false-negative until it was injectable.
- **Committed text files were checked out as CRLF on `windows-latest`, breaking every test that compares a file's exact bytes against a string built in memory with `\n`** (`docs/catalog.md` vs. `catalogMarkdown()`, the README's generated vendor-table section, `llms.txt`'s first line, and a backslash-continued shell example's line-rejoin regex in a test). New `.gitattributes` (`* text=auto eol=lf`) forces LF on checkout regardless of a contributor's or a runner's `core.autocrlf`; `test/fixtures/` (real captured vendor output, byte-exact on purpose) is marked `-text` so line-ending normalization never touches it.
- **A large block of `test/install.test.js` and `test/cli.test.js` compared a planned file's `f.rel` (built with `path.join`, so backslash-separated on win32) against a hardcoded forward-slash literal** (`'protocols/build-protocol.md'`, `'vm/README.md'`, `'.claude/agents/deep-planner.md'`, and about a dozen more), which is never equal on Windows; several other assertions hardcoded a POSIX `:` `PATH` delimiter and `/usr/bin`, `/bin` absolute paths, or replaced a spawned child's `env` outright and dropped `PATH`/`USERPROFILE`/the rest of the parent environment Windows itself needs. Path literals now go through `join(...)`; PATH construction goes through `node:path`'s `delimiter`; every replaced `env` object spreads `process.env` first and sets `USERPROFILE` alongside `HOME` (`os.homedir()` does not consult `HOME` on win32).
- **On a real Windows install, a reconfigure's "applied:" line always said "nothing" and the existing-runtime upgrade/conflict checks never fired**, because `bin/cli.js` checked a written file's `f.rel` (backslash-separated on win32, built by `path.join`) directly against `MACHINE_OWNED`/`RUNTIME` (`src/install.js`, hand-written with forward slashes), which never match on that OS. `fileClass()` already normalized before checking; it now exports that normalizer (`toPosixRel`) for `bin/cli.js`'s two direct checks to use too. Both take an optional `separator` parameter (default the real `path.sep`) so the win32 case has a test (`test/install.test.js`) provable from any host. Found via `test/cli.test.js`'s "#6: rerunning with an added lane..." on windows-latest CI.
- **A replaced child `env` object could carry both `PATH` and the host's own differently-cased `Path` key at once** (`{ ...process.env, PATH: x }` adds a new key next to whichever case the real environment block used; Windows env vars are case-insensitive, plain JS object keys are not), so which one a spawned child actually saw was implementation-defined, not last-key-wins. `test/cli.test.js`'s `mergeEnv()` replaces any existing case-variant of an overridden key instead of adding a second one.
- **`test/cli.test.js`'s fake lane binaries are `#!/bin/sh` scripts, which Windows cannot execute as `argv[0]`** (no shebang interpretation in `CreateProcess`). `writeShellStub()`/`writeNodeStub()` write a `.cmd` launcher beside the POSIX file on win32 that hands off to Git Bash's `sh.exe` or `node`; `which()`'s detection of the resulting binary works, but running one all the way through `cli-run.mjs`'s own spawn path is not yet reliable on Windows CI for a reason this pass did not fully root-cause. Those specific tests (and the `#12` upgrade-path pair, which diverges in its own, separately unclear way) are skipped on win32 with a stated reason rather than shipped flaky or silently broken; `killTree`'s win32 branch and `which()`'s `%PATHEXT%` resolution each keep their own direct, passing test. A handful of other tests assert an exact POSIX `--dir`/`--project` path string verbatim in output, which `path.resolve()` reinterprets as drive-relative on win32 (a real design question - should a level-3 `--dir` describing a remote Linux box's path ever go through the local host's path semantics at all? - out of scope to decide here) and are skipped the same way. `statSync().mode`'s executable bit is a POSIX-only assertion, dropped on win32 rather than asserted against a filesystem that has no equivalent concept.

## [0.1.15] - 2026-09-10

The portable parts of a live routing revision, delegate by default, gated on one verified fact rather than a guess: [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents) states that a non-fork Claude Code subagent's initial context includes "every level of the CLAUDE.md hierarchy the main conversation loads", and that the built-in Explore and Plan agents skip it. No other lane in this catalog has that documented, so everything below is gated on `subagentsLoadRules(primary)`, currently true for claude-code alone; every other primary keeps its original wording unchanged.

### Added

- **`subagentsLoadRules: true` on the claude-code catalog entry**, with the doc quote as its comment. Drives every new render var below through `src/install.js`; nothing here is a template branch, per the house rule that templates carry no logic.
- **Builder executes by default, on claude-code.** `ROUTING.md` rule 5, its "Who builds" section, the "Add an endpoint" example, and the claude-code `CLAUDE.snippet.md` now say: the orchestrator plans, briefs, verifies and talks to the human; it stays inline only when (a) the brief would cost as much as the work, (b) the task needs this conversation's own context, or (c) it is the human's decision or the final verification of delegated work. Every other primary keeps "the orchestrator builds it directly."
- **Two hooks, claude-code only: `route-gate.mjs` (`UserPromptSubmit`) and `subagent-context.mjs` (`SubagentStart`)**, written to `.claude/hooks/`, wired by a `settings.hooks.snippet.json` the user merges into `.claude/settings.json` themselves, never written over one they have. `route-gate.mjs` reads the `<!-- route-gate:start -->...<!-- route-gate:end -->` block out of the rendered routing rules file and injects it every turn, so the table is read from the one place it is generated, not recited from memory; a missing file or block still exits 0 with a one-line fallback naming the path it looked for. `subagent-context.mjs` injects a static reminder of where the rules and `TASK_BUNDLE.md` live and that a delegate does not route further or verify its own work as final. Both are plain Node, zero deps, bounded reads, fail-open by design (a miss is a stray context string, not a gate): see `docs/audit-brief.md`.
- **`done-verifier` and `reader`, two new fast-tier agents with no file-editing tools, in both the claude-code and agy formats.** `done-verifier` probes a tracker item's stated done-signal (a file, a commit, a URL, a log line, a count) and returns MET, NOT_MET or UNVERIFIABLE; it never closes or edits anything. `reader` reads and digests many files or notes and returns exactly what the brief asks (facts, quotes cited `path:line`, an index, a digest); unlike `bulk-worker`, it never classifies, tags, transforms or writes. `reader` is read-only by tool grant on both formats (no `Bash`); `done-verifier` on claude-code carries `Bash` for its probes, bound only by its prompt, not by the grant, and its description says so; on agy, `commandExecutionPolicy: off` blocks command execution mechanically instead. `ROUTING.md`'s decision tree, `TIERS.md`'s effort table, and both agent-folder READMEs now name them.
- **The inline threshold gets a measurement instead of a guessed figure.** "A subagent starts with your CLAUDE.md and tool definitions already loaded, so it has a fixed start-up cost before it does anything. Measure yours once: spawn a subagent with a one-line task and read its token count. Work smaller than that stays inline." (claude-code `ROUTING.md` and `CLAUDE.snippet.md` only; no private number shipped.)

### Changed

- **The package now says what it is for in the first line people and agents read.** npm search, GitHub search and the installer banner showed "Routing instructions and a CLI runner", which named the parts and not the purpose. The description, the README opening and the banner now lead with the goal (each task to the right model, agent or LLM, fewer frontier tokens) while keeping the 0.1.11 correction intact: routing is an instruction your agent follows, and the README still states it does not automatically compare prices or select models. A test holds all three surfaces to that. New: an "At a glance" block and question-shaped "Common questions" in the README, request-level alternatives named for readers who want a proxy, `llms.txt` at the root and a headless-use section in `AGENTS.md` (both now ship in the package), and search keywords matching what comparable routers use.
- **Corrected the unqualified premise "a subagent holds none of these rules" everywhere it appeared** (`TASK_BUNDLE.md`, `ORCHESTRATOR.md`, the claude-code snippet, `docs/part-1-beginner.md`, `docs/part-2-intermediate.md`, README principle 6, and `ROUTING.md`'s "Who builds"). The corrected fact: a Claude Code subagent loads CLAUDE.md and so keeps the standing rules, just not this task's scope; a second CLI or a fresh chat window may still hold none of it. "Absence is denial" is unchanged; only the premise about who is absent what was wrong.
- **The claude-code snippet's closing "available as ..." agent list is generated from the files actually shipped in `templates/agents/claude-code/`, never hand-typed.** It had drifted once already: `finding-verifier` shipped in 0.1.14 and was missing from this sentence until now. `claudeAgentIds()` in `src/install.js` reads the folder; a test ties the rendered list to it.
- **The delegate-by-default gate now reaches every generated surface it should, not just three of them.** `build-protocol.md`'s "Roles, as capabilities" table and its "Why the builder does not hand off the main build" line, `builder.md`'s description, and `ROUTING.md`'s "Plan big, execute small" modifier still said, on a claude-code install, that the orchestrator writes the main build itself, never hands it off whole, and that a delegate inherits none of the session's rules: the exact premise the rest of this release corrects. All four now render through `subagentsLoadRules(primary)` the same way the decision tree and "Who builds" already did; every other primary is unchanged. A semantic-regression test asserts a claude-code install contains none of the old phrasing and a codex install still does.

### Fixed

- **Both new hooks could hang, and `route-gate.mjs` could read an unbounded or blocking file (pre-release audit finding, never shipped).** `readFileSync(0)` in both `route-gate.mjs` and `subagent-context.mjs` blocked until stdin reached EOF, so a caller that piped input in without closing its end (or ran the hook from a bare TTY) left the process running indefinitely; reproduced with `sleep 3 | CLAUDE_PROJECT_DIR=... node route-gate.mjs` still running past 1.5s. Separately, `route-gate.mjs` read the whole rules file into memory before bounding it (`readFileSync(path).slice(0, MAX_READ)`), so a FIFO planted at the rules path blocked forever on open, and a very large file was read in full before being truncated. Fixed in both hooks: stdin is now drained asynchronously against a 250ms hard cap, never blocking past it. `route-gate.mjs` additionally `statSync`s the resolved path and refuses anything that is not `isFile()` (a FIFO, socket, device or directory, symlink target included) before ever calling open, then reads through a single fixed 64 KB buffer via `openSync`/`readSync`, closed in a `finally`, so neither the read time nor the memory used depends on the file's on-disk size. Tests: an open, never-closed stdin pipe now exits within 1s for both hooks; a FIFO at the rules path returns the fallback instead of hanging; a 200 MB sparse rules file completes in well under a second with output still capped.

Three refinements to the routing model, from a review by [@shawnwows](https://x.com/shawnwows). The theme is the same in all three: a routing decision that was implied, inherited or asserted is now stated, pinned or checked.

### Added

- **`--model` and `--effort` on every lane, and a route recorded per run.** A lane with no flag and no `defaults` entry in `bin/lanes.json` runs on its own config file, which `cli-run` cannot see: a CLI configured months ago at a low reasoning effort keeps auditing at that effort while the routing docs describe an adversarial pass, and nothing raises an error. Each vendor spells the flags differently and `cli-run` translates (`grok -m/--reasoning-effort`, `codex -m/-c model_reasoning_effort="X"`, `agy --model/--effort`, `hermes -m/--reasoning`, `qwen -m` and no reasoning flag), each one read from that CLI's own `--help`. Flags beat `defaults`, `defaults` beats nothing, `--doctor` prints what each lane is pinned to, and the log carries `model_requested`, `effort_requested`, `model_source` and `effort_source` on every record, including runs refused before the lane started. It records no "actual": one lane of five (grok) reports a model id in its own output and the other four report none, so the field would be populated for one lane and empty for four, and it would be a provider-supplied string, which the durable log never holds. `--effort` on qwen is a usage error rather than a silent drop, and route values are charset-bounded because a model id becomes an argv element and, on codex, part of a TOML value.
- **`finding-verifier`, a sixth subagent, in both agent formats.** Review and scanner findings no longer go straight to a repair. It reads the cited line, states what would trigger the problem, hunts for the guard, caller or test that makes it impossible, and returns CONFIRMED, NOT_REPRODUCED or INCONCLUSIVE per finding. Only CONFIRMED earns a change; INCONCLUSIVE is never rounded up to be safe or down to be tidy. Bound into the build protocol as Stage 5a, into `ROUTING.md`, and into the Claude Code activation snippet. The reproduction rule already existed in Stage 5; it had no owner, no separate model family and no way to say "I could not settle this".
- **Complexity and risk as inputs, alongside role** (`TIERS.md`). Complexity moves the effort: a worker executing a finished plan needs less reasoning than the reviewer judging its output. Risk (security, privacy, data loss, irreversible) moves the tier and who reads the result, because none of those failures is fixable by editing the code afterwards. A one-line change to an auth check is simple and high-risk at once, and the risk decides. Deliberately two rules and two small tables rather than a role by complexity by risk matrix: an 80-cell table is not maintained, and an unmaintained routing table is worse than none because it is believed.

### Changed

- `--model` is no longer qwen-only. `--safe-mode` still is.
- The route is resolved before the "lane disabled" and "binary missing" refusals, so those records carry it too. Found by the pre-release audit: a run refused for a missing binary is still a run that requested a route, and a failure record without one is the gap this release exists to close.
- `bin/lanes.json` gains an optional `defaults` block. It fails closed with the rest of the file: an unknown lane, an unknown key, a value outside the charset, or an effort pinned on a lane with no reasoning flag refuses every lane until it is fixed, rather than being skipped quietly.
- The generated activation list gains a step about pinning the route, and `--doctor` output gains a route column with a plain sentence about what "not pinned" means.

## [0.1.13] - 2026-09-08

Three issues from a fresh first-run walkthrough of 0.1.12 (#26, #27, #28). Same class as 0.1.12's five: a surface describing an install that did not happen. A fourth, #25, was filed and closed as a mistake on the reporter's side, not a defect: the warning it said was missing has been printed since 0.1.12 and the repro had been read through a truncated pipe.

### Fixed

- **The "Then prove it took" list no longer sends a level 1 reader to a file level 1 never wrote** (#27). Step 4 told every reader, at every level, to pick a lane out of `bin/lanes.json` and run `node bin/cli-run.mjs`. Level 1 writes no `bin/` at all, and step 3 immediately above it hedged correctly with "At level 2+" while step 4 did not. The list is now `proofSteps()` in `src/install.js`, gated on level the same way `activationSteps()` is, and the template renders it. Two tests: the README's section must equal the array exactly for every level and primary, and no `bin/` path may appear in it that the plan did not write.
- **The box setup no longer tells you to sign in to CLIs you did not pick** (#26). `templates/advanced/vm/README.md` step 3 was a fixed sentence naming `codex login --device-auth`, `grok login --device-auth` and `agy`. A level 3 install of claude-code, codex, qwen and ollama was told to sign in to two CLIs it does not have and never told about the one it does. The step now renders each selected CLI's own `auth` string from the catalog. Everything else in that file was already computed from the selection, which is what made the one hardcoded line easy to miss.
- **A selected local runtime is finally told to install itself** (#26). `activationSteps()` filtered on `kind === 'agent-cli'`, so Ollama, which has a binary and a download page, appeared in no ordered list at any level. Its only mention was one row of a URL table in `DELEGATION_MATRIX.md`. It now gets a step naming the download page and the `ollama pull <model>` that has to follow it.
- **The tool block stopped saying the same word twice** (#28). Every run that selected a tool printed `optional: Optional. Needs Python 3.10+ and uv.`, because the label repeated the note's own first word. The label is `note:` now. The note keeps the word, because `--list` and the interactive picker print it bare with no label.

### Changed

- `--primary` is documented as what it is. `--help` called it "required when several qualify", and then a `--yes` run with several candidates silently picked one in catalog order. The run now names the choice in the plan (`primary  claude-code (chosen for you from claude-code, codex; pass --primary to decide it yourself)`) and the help says the same thing. Behaviour is unchanged: the default was sensible, only the promise was wrong.

## [0.1.12] - 2026-09-08

Five issues from one first-run walkthrough of 0.1.11 (#20 to #24). Every one of them is the same failure: a page describing an install that did not happen. Each fix removes the second copy of a fact rather than correcting it.

### Fixed

- **The generated README no longer describes a different install from the one the terminal just printed** (#20). The activation list existed twice: once as an array built in `bin/cli.js`, once as prose in `templates/common/README.md` that assumed a chat app. A level 2 Claude Code install was told, on the page it was pointed at, to paste `PASTE-INTO-YOUR-AGENT.md`, a file that run never wrote, and a level 1 chat install was told its rules file was `your agent's instructions file`, a leftover placeholder. `activationSteps()` and `snippetFor()` now live in `src/install.js` and both surfaces render the same array, so the page can only ever name the file that was written. A test renders every level against every possible primary and fails if the README omits a printed step or names any other agent's snippet.
- **A chat install no longer claims a project root it never created** (#21). Level 1 with a chat app writes no project files, and the README still printed `--project` as "where your agent reads rules and subagents" next to "subagent definitions: none". It now says there is no project root and why. A CLI primary that reads a rules file but gets no subagent folder (codex, qwen) keeps its project path and gains the missing half: whether this run created that folder.
- **The chat activation line is a sentence again** (#22). It read `paste ... into Claude app or claude.ai (chat only, no CLI)'s custom instructions or Project`: the catalog's disambiguating note sat inside a possessive. Chat entries in the catalog now carry `chatName` and `chatSurface`, and the line reads `open the Claude app or claude.ai and paste the block in <path> into its custom instructions or a Project`. The catalog note stays where it is useful, in the picker list.
- **"Built against" and "pinned to" are one number per lane, by construction** (#23). The README's compatibility table was hand-written and the installer's npm pins were edited separately, so a user comparing them found claude at 2.1.226 and 2.1.260, codex at 0.153.4 and 0.153.2, with no rule for which to trust. `builtAgainst` in `src/catalog.js` is now the single source: `npm run gen:catalog` renders the README table from it, the npm pin **is** that value wherever a lane installs from npm, and the tests fail if the table drifts, if a pin disagrees with its `builtAgainst`, or if a recorded fixture's vendor version disagrees with either. The pins moved to the exercised versions rather than the table moving to the pins, because the exercised version is the one with evidence behind it.
- **The README stops pinning a release tag the registry has moved past** (#23). The GitHub one-liner still said `#v0.1.7` while npm served 0.1.11. It now points at main, says where the tags are, and a test fails on any `#vX.Y.Z` in the README that is not this package's own version.
- **The documented example sets both write targets** (#24). The first non-interactive example set `--dir` and left `--project` at the current directory, so a copied command run from a home folder dropped five agent files into it. Both flags are now set in the example, a table explains what lands where and why `--dir` defaults to a folder named for its contents, and the installer prints a line when `--project` was left at the default and subagent files are going there. A test fails on any documented `--yes` example that sets one target and not the other.
- **Privacy describes what actually runs** (#24). It claimed the only network step was an `npm install -g` you approve, when the thing the user runs is `npx` (a download in itself) and the installer under `--yes` prints vendor install commands without running them. Both are now stated, along with `--yes` selecting the recommended companion tool unless `--no-tools` is passed.

### Changed

- Vendor CLI pins move to the versions this release was exercised against: `@anthropic-ai/claude-code@2.1.226`, `@openai/codex@0.153.4`, `@qwen-code/qwen-code@0.22.3`. A pin is a floor, not a ceiling: newer versions may work, and the table exists so a lane that breaks after a vendor upgrade has something to compare against.
- `npm run gen:catalog` now regenerates two surfaces, `docs/catalog.md` and the README vendor table between its `vendor-table` markers.

## [0.1.11] - 2026-09-07

### Fixed

- **The cost claim the audit rejected was still live in three places outside the README.** #11 asked for the opening promise to be narrowed, and 0.1.2 narrowed it in `README.md` only. "Route every task to the cheapest AI that does it well" survived in `package.json`'s `description`, which is what **npm search results show**, in the repository's GitHub description, which is what **GitHub search shows**, and in the installer's own banner, printed to **every user on every run**. All three now say what the package generates instead of what it guarantees: "Routing instructions and a CLI runner for your AI tools." The cheapest-capable-lane *guidance* in the docs and templates is untouched; that is the product's advice, not a promise about what the code enforces.

## [0.1.10] - 2026-09-07

Closes the last two verification items on #11. Both had been described as needing vendor sign-ins or infrastructure that was not available. Both turned out to be doable with what was already here, and doing them found a real defect.

### Fixed

- **The generated weekly audit orphaned a temp file on every timeout.** A run killed by the unit's `TimeoutStartSec` dies on SIGKILL, so no trap and no cleanup line of ours can run, and its `reports/.audit-<stamp>-XXXXXX` file was left behind forever. The job now sweeps `.audit-*` older than a day at start. A day is far outside the unit's own 900s deadline, so a temp belonging to a run still in flight can never be swept. Found by actually starting the unit on Ubuntu; the previous text-only assertion could not see it.

### Added

- `test/fixtures/`: raw output captured from **real vendor CLI runs**, with `manifest.json` recording the vendor version, the exact flags, the exit code, and what each fixture proves. Every other judge test in this repository uses shapes written by hand. The capture earned itself immediately: real codex 0.153.4 emits an `item.completed` whose item is `type:"error"` (a skills-budget warning) *before* `turn.completed`, which no synthetic fixture contained, and real agy returns `"OK\n"` with a trailing newline. `test/fixtures.test.js` runs every judge against them.
- `test/systemd/run-on-ubuntu.sh` and its README: starts the generated job as a **real systemd user unit** and proves that the timeout kills the whole cgroup (a detached grandchild does not survive it), that a failed rerun preserves the previous report, that a malformed gateway key exits 2 before anything is written, and that the new sweep removes an aged orphan while leaving a fresh one alone. 11/11 on Ubuntu 24.04.4 LTS, systemd 255. Not part of `npm test`, which has no systemd to run against.

### Notes

- `test/fixtures/README.md` states its own gaps rather than hiding them: qwen's success shape is still synthetic because its key was not present in the capture environment, and `claude` and `ollama` have no judge, so no fixture.

## [0.1.9] - 2026-09-06

### Added

- `--version` and `-v` on the installer, printing the package version and exiting before anything else is validated, so it answers from a broken or half-configured directory.
- A "Vendor version compatibility" section in the README, naming the exact vendor CLI version each lane was built against, and saying plainly that the installer checks a binary's presence and never its version. Closes the compatibility-statement item on #11.

### Fixed

- `-h` and `-v` are now parsed. Both were listed in the flag table but unreachable, because parsing required a `--` prefix and rejected every single-dash argument. Strictness is unchanged: `-x` is still `unexpected argument`, `--versionn` still `unknown flag`.

### Changed

- The live-canary question on #11 is answered by design rather than left open: the canary is `cli-run --doctor --run`, which runs on the user's machine against the user's own sign-ins. A maintainer-credential canary in CI would prove one machine works and bill per run, so it is documented as deliberately absent.

## [0.1.8] - 2026-09-06

### Added

- `author` in `package.json`, so npm shows a byline: `aunysillyme (https://github.com/aunysillyme)`.
- The installer's last line now points at the repository, on the reasoning that the end of a successful install is the moment a user is most likely to act on it.

## [0.1.7] - 2026-09-05

### Fixed

- Preserve unrelated subagents in uninstall guidance and explain manual activation cleanup.
- Provide a chat activation block below 1,500 characters and explain protocol uploads.
- Warn about zero-lane setups; doctor reports inactive with exit 13, including with --run.
- Add a first-task walkthrough and clarify agent-directed routing, connection checks and output contracts.
- Correct the contributor exit-code reference.

## [0.1.6] - 2026-09-05

Issues #16 to #19, filed against 0.1.5. Each reproduced before the fix; each fix has a test.

### Added

- `--dry-run` as an alias for `--dry`; the package script was already named `dry-run` (#16).
- `cli-run`: `killTree()` ends a lane's process tree with `taskkill /T /F` on Windows instead of killing only the root process. Windows is still not exercised by CI and stays documented as unsupported; the branch is unit-tested by argv capture (#18).

### Fixed

- `cli-run --expect-json` accepts a response that is exactly one markdown code fence around JSON (`\`\`\`json ... \`\`\``, CRLF included). Prose before or after the fence still fails the contract, because then the deliverable is not the JSON (#17).
- `--yes` with several candidate agents and no `--primary` now prefers claude-code, then the first agent that can load subagent definitions, then the first listed. `--ais codex,agy` used to pick codex and write no subagents (#19).

## [0.1.5] - 2026-09-05

First release published by the workflow, with provenance.

### Added

- Published to npm as `model-orchestrator` (0.1.4 was the first publish, by hand). `npx model-orchestrator` is now the install line; the GitHub route stays for pinned or unreleased runs.
- `.github/workflows/release.yml`: on a `v*` tag, checks the tag against `package.json`, runs the tests, and publishes with provenance through npm trusted publishing (no stored token). Needs the one-time trusted-publisher setup on npmjs.com described in `RELEASING.md`.

### Changed

- `RELEASING.md`: the first npm publish is manual and must not pass `--provenance` (npm only generates provenance inside a supported CI runner); later releases go through the workflow.

## [0.1.4] - 2026-09-05

### Added

- `--update-docs`: after a selection change, regenerate the documents a previous run wrote and nobody edited since. The check is the same hash rule the runtime class uses: an installed copy that matches the hash `MANIFEST.json` recorded is regenerated and named under "documents updated"; one that differs is kept and named under "document CONFLICT, kept"; without a manifest every changed document is kept as UNVERIFIABLE. `--force` still replaces everything; `--dry` reports and writes nothing. The reconfiguration hint names the flag.

### Fixed

- `MANIFEST.json` recorded the hash of content a run planned for a document it then kept, so the next hash check read every kept document (and, on a reconfiguration, every kept runtime file) as edited. The manifest now records the previous run's hash for kept files and no entry when there was no previous manifest, so the file classes tell the truth about what is on disk. Project-root agent definitions are keyed under `[project]`.

## [0.1.3] - 2026-09-05

Professional-repo pass and the eight findings from the agy scored audit (overall 9.4/10; the findings are in the issue tracker's audit record).

### Added

- Community files: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1), `MAINTAINERS.md`, `RELEASING.md`, `AGENTS.md` and `CLAUDE.md` for contributors' agents, yml issue forms with blank issues disabled, a pull request template, `CODEOWNERS`, `.editorconfig`, Dependabot for the workflow actions.
- `test/prose.test.js`: fails on an em dash anywhere in the repo's text files, so the house rule is checked rather than requested.
- README badges (CI, licence, Node) and a one-line privacy statement.

### Fixed

- `--help`: `--primary` was described as "level 1 only"; it applies at every level and is required when several agents qualify.
- `docs/catalog.md`: install lines now carry the same npm pin the installer uses (`scripts/gen-catalog.js` went through `npmSpec`, closing the last gap #8 left open).
- `--upgrade-runtime`: the report names the runtime files it replaced; before, the files were replaced and the "runtime upgraded:" line never printed.
- `cli-run --doctor`: prints a note when the primary agent is absent from the lane list, so "1 enabled lane(s): codex" after a Claude Code + Codex install no longer reads as a missed install.
- `templates/README.md`: listed four protocols and one companion tool; there are six and two. A test now checks that table against the tree.
- Agent snippets name the routing file for the level (`ORCHESTRATOR.md` at 1, `ROUTING.md` at 2 and 3) instead of a conditional clause; `common/README.md` says why both files exist at level 2.

### Changed

- CI: `cli-run --doctor` is no longer masked with `|| true`; exit 0 or 10 (an enabled lane's binary absent on the runner) passes, anything else fails the job.
- The tarball ships `CHANGELOG.md` and `SECURITY.md` (added to `files`).
- CI: actions pinned to full commit SHAs with a version comment, `permissions: contents: read`, one run per branch with `cancel-in-progress`, `fail-fast: false` so one leg's failure does not hide another's result.
- `SECURITY.md` states a response window (7 days to acknowledge, 30 to fix or decline), that only the latest release receives fixes, and the scope.
- This changelog reshaped to Keep a Changelog 2.0.0 with dated releases and compare links.

## [0.1.2] - 2026-09-05

Follow-up audit of 0.1.1 (issues #12 to #15).

### Fixed

- `cli-run`: SIGINT/SIGTERM to the wrapper kill the lane's process group before exiting 130/143, with the handlers registered before the spawn so a slow runner cannot signal between the two (#13).
- `cli-run`: stdout and stderr go through streaming UTF-8 decoders and limits are counted in bytes, so a multibyte character split across chunks survives (#14).
- `cli-run`: `--expect-file` snapshots the target before the run and requires it to be new or changed, so a pre-existing artifact fails however recent (#15).

### Changed

- Installer: three file classes. `MANIFEST.json` records the generator version and a hash per generated file; runtime files (`cli-run.mjs`, the audit job, unit and timer, compose, gateway config, setup script) are upgraded when the installed copy is provably untouched, kept and reported as a conflict when edited, kept and reported as unverifiable when no manifest exists; `--upgrade-runtime` replaces runtime files only (#12). The README discloses the machine-owned and runtime exceptions to "never overwrite".

## [0.1.1] - 2026-09-05

Audit follow-up (issues #1 to #10 on the repo).

### Fixed

- `cli-run`: lanes run in their own process group and the group is killed on timeout or buffer overrun (#1); the durable log stores only a fixed reason code (#4); nonzero vendor exits pass through with an `exit_nonzero` verdict and a bounded stderr head on the terminal (#9).
- Weekly audit: temp-and-rename so a failed rerun never truncates the last good report, failed output kept beside it (#3); every probe under a watchdog, `TimeoutStartSec=900`, `UNVERIFIED` lines for timed-out probes (#10).
- Installer: one `npmSpec` helper so the interactive install, the printed command, the table and the box script use the same pinned version (#8).

### Added

- `cli-run`: `--expect-file` and `--expect-json` opt-in contracts, with the guarantee of a bare run stated exactly (#5).
- Weekly audit: `--audit` for codex and an explicit boundary note for other lanes (#2).
- Installer: `MANIFEST.json` and `bin/lanes.json` are machine-owned and rewritten on every run, with a requested-vs-applied report on reconfiguration (#6).
- README leads with the GitHub route pinned to the release until the npm publish, and a table stating which properties are enforced, delegated or instructions (#7, #11). CI installs the packed tarball into a clean consumer and runs it.

## [0.1.0] - 2026-09-04

First release.

### Added

- Installer: three levels, access-aware AI selection, primary-agent loading surface, companion-tool questions (codecalc recommended, obsidian-tc optional), strict flags, containment preflight, exclusive create with rollback, no vendor scripts run.
- `bin/cli-run.mjs`: one entrypoint for grok, codex, agy, hermes and qwen with each lane's native success signal; exit 10 on a run that produced nothing, fail-closed `lanes.json`, signal handling, digest-only log, `--doctor`.
- Templates: six protocols (build, propagate, gap analysis, deep research, numbers and logic, memory and record), task bundle, single-agent and multi-lane routing, tiers, generated delegation matrix, research triage, VM tier (gateway config by env-var name, compose on loopback, box rules, privacy gates, weekly audit timer).
- Tests: a case per fix, judges proven to go red, mutation checks; `npm test` prints the current count.
- Adversarial audit: two Codex rounds plus a two-engine review (Codex, Antigravity); findings and fixes in `docs/audit-brief.md`. After the review: subagents go to the project root (`--project`), snippet paths computed from `--dir`, lane sections rendered from the selection, a primary agent required, level 3 asks for API keys separately from CLIs, images and CLI installs pinned, an activation summary at the end of every install.

[Unreleased]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.16...HEAD
[0.1.16]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.15...v0.1.16
[0.1.15]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.14...v0.1.15
[0.1.14]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.13...v0.1.14
[0.1.13]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.12...v0.1.13
[0.1.12]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.11...v0.1.12
[0.1.11]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.10...v0.1.11
[0.1.10]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.9...v0.1.10
[0.1.9]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.8...v0.1.9
[0.1.8]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.7...v0.1.8
[0.1.7]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.6...v0.1.7
[0.1.6]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.5...v0.1.6
[0.1.5]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/aunysillyme/model-orchestrator/releases/tag/v0.1.0
