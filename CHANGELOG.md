# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html); on `0.y.z` anything may change.

## [Unreleased]

## [0.1.32] - 2026-09-23

### Changed

- **README shows what the install gives you, not a file dump.** The 50-line dry-run file list under the demo became a six-row table naming each part and what it does for you; the preview command stays, and the full file list is one link away in `docs/install.md`.

## [0.1.31] - 2026-09-23

### Added

- **Manifest-based uninstall.** `--uninstall --dir <dir> --project <project>` removes managed files whose content matches the recorded hash, keeps and names edited files, and preserves files outside the manifest. `--dry` and `--dry-run` preview the same removals. The manifest is the last file removed and stays when edits remain. New installs record the directories they create so uninstall can remove them when empty; older manifests leave directories in place. The command prints the manual steps for removing pasted rules and merged hooks. A missing manifest exits 2 and names its expected path.
- **Activation and related tools in the README.** A captured install supplies the rules, hooks and smoke-test steps. A shared table links agent-personalizer and website-build-skill, and a short uninstall section links the full instructions.

### Changed

- **Presentation leads with the task and payoff.** The opening states that the rules tell your agent which model handles each task, followed by the problem, the setup and the routing log. README sections follow the install flow, with platform and vendor details kept in collapsed sections. Contributing names new catalog entries, vendor fixtures and documentation fixes as welcome contributions.
- **Short package description and consistent names.** The description fits the search-card budget while preserving the purpose clause. The opening and agent summary name Antigravity (Google). `llms.txt` keeps reference links together and gives plans and automatic effort their own section.
- **Positive section headings.** The plugin README names what the hooks do and what npx installs; codecalc explains where it fits; the pull request template names work kept for a later change. Safety guarantees retain their explicit wording.

### Fixed

- **Setup output matches the generated files.** The plan counts subagents and hooks separately from its file list, and the README contains captured dry-run output with project-relative paths. `--list` prints each AI's catalog install instructions and sign-in note. The README describes how reruns preserve documents, rewrite machine-owned configuration and upgrade untouched runtime files, and its routing link points to the detailed document.

### Security

- **Uninstall validates the entire manifest before removing files.** Absolute paths, traversal, symlinked entries, malformed hashes and mismatched target roots are refused. Foreign files in shared project folders stay. A rerun targeting another project carries previous ownership records only for roots that still match. Regression tests cover these refusals, edit preservation, directory ownership, changed projects, legacy manifests, previews and missing manifests.

## [0.1.30] - 2026-09-22

### Fixed

- **Every hook count now matches the files on disk ([#35](https://github.com/aunysillyme/model-orchestrator/issues/35)).** The generated `CLAUDE.snippet.md` said "Two hooks were written" and named only `route-gate.mjs` and `subagent-context.mjs`, while a claude-code install writes and wires `route-metrics.mjs` too. It now names all three and how to read the metrics log. The same pass corrects `llms.txt` and `docs/install.md` (three hooks on a full install), `templates/agents/README.md` (lists `route-metrics.mjs`), and the README plugin section, which said the plugin ships three hooks: it ships the two read-only ones, and `route-metrics` comes only with the npm install. A new test fails if the snippet names fewer hooks than the plan writes.

## [0.1.29] - 2026-09-21

### Changed

- **The seven principles state what to do, rather than what fails.** "A gate you cannot fail is not a gate" became "Every gate can come back wrong. A checkpoint earns its place by being answerable both ways"; "Exit 0 is not a deliverable" became "Check for the artifact. A deliverable is a file, a commit or a line you can point at"; "A write nobody can find again did not happen" became "A write stays findable". Same rules, same gates, stated forward. This finishes the copy pass 0.1.28 started, which left the principle list untouched.


## [0.1.28] - 2026-09-21

### Added

- **A recording of the command doing its job, at the top of the README.** `docs/demo.gif` (60 KB) shows `npx model-orchestrator ... --dry` typed and run: the level, the AIs, both target folders, all 38 files it would write, and the closing line that nothing was written. `scripts/record-demo.sh` re-records it from the PUBLISHED package inside a temp folder, so the frames stay the program's own output rather than a staged screen, and anyone can reproduce them with `brew install asciinema agg`. The text plan stays in the README under the image, and the image carries alt text describing what it prints, so the page still reads with images off.
- **`--summary` now answers the question the package exists for: how much work left the main session.** `work sent off the main session` counts covered turns whose route marker named any lane that is not an inline name, over covered turns. It is derived only from lane names the log already holds, with no price table and no token estimate, because the log holds neither. `--inline a,b` renames what counts as inline, since the lane vocabulary belongs to your own `ROUTING.md`. A log with no lane markers yet says so instead of printing a number.

### Changed

- **Every line of user-facing copy states what the package is and does.** The opening bullet was "What it is not: a proxy, a gateway or an API router", which told a new reader what to stop expecting before they knew what they were looking at. It now reads "Where it sits: above the request layer. Your agent reads the rules and picks the lane", and request-level routers are described as composing underneath rather than as the thing this is not. Same for the plugin section, the companion-tool intro and the gateway question in Common Questions. `test/copy.test.js` keeps the boundary it was written to protect: the OVERCLAIM guard is unchanged, and two positive phrases are now required in both README and `llms.txt`, so the claim cannot quietly widen and the copy cannot quietly lose it.


## [0.1.27] - 2026-09-21

### Changed

- **README restructured for a first-time reader: 32,083 bytes to 17,586, with the first screen now a claim, the install command and a real `--dry` plan.** The old opening was a 200-word paragraph followed by "What it is not", the flag-conflict rules and the uninstall procedure, all before the reader had seen the tool do anything. The detail moved rather than went away: `docs/install.md` (every flag, the two target folders, headless examples, the full file list), `docs/how-it-routes.md` (role, complexity and stakes; the three verifier agents; pinning model and effort), `docs/guarantees.md` (enforced by code, delegated to a vendor flag, or only an instruction), `docs/companions.md` (the full companion-tool table). `docs/README.md` and `llms.txt` index all four. Platform support and the vendor compatibility table stay in the README inside collapsed `<details>` blocks, because `scripts/gen-catalog.js` writes the vendor table between markers there and `test/prose.test.js` requires the skipped-test explanations to live in the README; collapsing them keeps both mechanisms pointed at the same file. The opening line still satisfies `test/copy.test.js`: it names the package, carries the shared purpose clause, and keeps the 0.1.11 correction that it does not select models itself.

## [0.1.26] - 2026-09-19

### Added

- **obsidian-tc on Windows: the answer is that no client needs a `cmd /c` snippet, and `OBSIDIAN-TC.md` now says so with the code it was read from.** All five obsidian-tc snippets spawn `"command": "npx"`, and on Windows `npx` is `npx.cmd`, which a bare `CreateProcess` will not start. Each client was read instead of assumed, and all five resolve it themselves: Zed hands the command to the system shell (`crates/context_server/src/transport/stdio_transport.rs`, `ShellBuilder::new(&Shell::System, ..)`, from its PR #42382, 2025-12-10), VS Code's `formatSubprocessArguments` in `src/vs/workbench/api/node/extHostMcpNode.ts` resolves the executable and re-spawns with `shell: true` for a `.bat` or `.cmd`, the Codex CLI calls `which::which_in` in `codex-rs/rmcp-client/src/program_resolver.rs`, and Cursor and Antigravity's `agy` both reach `npx` through `@modelcontextprotocol/sdk`, whose `client/stdio.js` imports `cross-spawn` and re-invokes a non-`.exe` as `%COMSPEC% /d /s /c`. That last point is wider than those two clients: every published SDK from 1.23.0 through 1.30.0 depends on `cross-spawn ^7.0.5`, so `shell: false` in that transport is not the whole story. The doc also names the one Windows case that can still fail and is not about `.cmd`: Zed prefers PowerShell, which resolves a bare `npx` to npm's `npx.ps1` shim, and a `.ps1` will not run under the `Restricted` execution policy that is Windows' client default. A test pins the snippet set, fails if any `.windows` file appears, and fails if the doc drops a citation. Not run on a Windows machine.

### Fixed

- **Context7's Windows guidance said something untrue about Zed, and its `cmd` wrapper was missing `/d`** ([#34](https://github.com/aunysillyme/model-orchestrator/issues/34) follow-up). 0.1.25 shipped `mcp/context7.zed.windows.settings.json` on the premise that Zed spawns `"command": "npx"` directly and so cannot start it. Reading Zed's own source for the obsidian-tc work above showed it has launched MCP stdio servers through the system shell since PR #42382 (2025-12-10), so a current Zed starts the plain snippet. The file stays, because it is still the fix for an older Zed and for the PowerShell execution-policy case, but `CONTEXT7.md` no longer sends every Windows user to it and now carries both reasons. The snippet's args change from `["/c", "npx", ...]` to `["/d", "/c", "npx", ...]`: without `/d`, `cmd` first runs whatever sits in the Command Processor `AutoRun` registry value, which can print non-JSON into the protocol stream. `cross-spawn` passes `/d /s /c` for the same reason. The `#34` test follows the new args and now also fails if the doc stops naming why a current Zed does not need the file.

## [0.1.25] - 2026-09-19

### Fixed

- **Context7 on Windows: a Zed snippet that can start the local server** ([#34](https://github.com/aunysillyme/model-orchestrator/issues/34)). `mcp/context7.zed.settings.json` spawns `"command": "npx"`, and on Windows `npx` is `npx.cmd`, a batch file a client cannot spawn as a bare command. New `mcp/context7.zed.windows.settings.json` runs `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@upstash/context7-mcp@<pin>"]`, the shape Context7's own client guide ships for Windows. `CONTEXT7.md` gains a "Local `npx` on Windows" table saying which Zed snippet to use on which OS, and the same by-hand change for any other client taking the local alternative. The remote snippets spawn nothing and are unchanged. A test pins the Windows args to the POSIX args behind `/c npx` and the catalog pin; not yet run on a Windows machine.

## [0.1.24] - 2026-09-18

### Added

- **Context7 as a third companion tool, paired with codecalc.** [Context7](https://github.com/upstash/context7) (Upstash) hands the agent current, version-specific documentation and code examples for any library, SDK, API or CLI, hosted or run locally with `npx`. It answers what a library is documented to do; codecalc still answers what the code actually does by running it. A new protocol, `protocols/docs-then-prove.md`, states the rule the pairing serves: pull current docs before writing against anything unconfirmed this session, then a run proves it, and where a doc and a run disagree the run wins. Optional and off by default, like obsidian-tc (`--tools context7`, or the interactive question); unlike the other two companions it always makes a network call, so it is the one to skip offline. `src/catalog.js` carries the entry (repo, role, install, requirements, the clients it self-registers with); `CONTEXT7_STATUS` renders both selected and not-selected wording the same way `CODECALC_STATUS` and `OBSIDIAN_TC_STATUS` already do, at every level and in `ROUTING.md`.
- **`templates/tools/context7/CONTEXT7.md` plus seven per-client `mcp/` snippets**, each read from that client's own docs rather than shared across clients that do not actually share a config shape: `context7.claude-code.mcp.json` (`"type": "http"` next to `url`, required or Claude Code skips the server), `context7.mcpServers.json` (Cursor's own documented shape, `url` with no `type`), `context7.vscode.mcp.json`, `context7.qwen.settings.json` (`httpUrl`, not `url`, plus the non-credential `Accept` header upstream ships), `context7.zed.settings.json` (local `npx`, pinned to the catalog's `context7` version), `context7.codex.config.toml`, `context7.agy.mcp_config.json`. Claude Desktop has no file: its remote connection is a UI step (`Settings > Connectors > Add Custom Connector`), documented in `CONTEXT7.md` instead of a snippet nothing there reads.
- **Every context7 snippet ships keyless by default.** The anonymous tier works with no header, while an unexpanded or empty `Bearer ${CONTEXT7_API_KEY}` makes every call return "Invalid API key" (probed live against `https://mcp.context7.com/mcp`), and clients like Codex `http_headers` never expand it. `CONTEXT7.md` has a "Higher rate limits (optional key)" section with one mechanism per client: Codex `bearer_token_env_var`, Claude Code `${VAR}` expansion in `.mcp.json` headers, Claude Desktop's own Connectors key field, an exported shell variable for local `npx`, and "check your client's docs" where expansion is not confirmed; the fallback for a client that does not pass its environment to a spawned child is to stay anonymous, never to paste the key into a snippet's args. A test fails if a shipped snippet carries `Authorization` or `CONTEXT7_API_KEY`.

## [0.1.23] - 2026-09-15

### Added

- **`cli-run` says WHY a lane failed.** Every run lands in one class with its own exit code: `auth` 14, `quota` 15, `rejected` 16, `refused` 17, `cut_short` 18, next to the existing `empty` 10, `no_output` 11, `timeout` 12 and `unavailable` 13. A missing API key, a spent quota and an unknown model id used to share exit 10 or the vendor's own code, and each needs a different response: a missing key is not a model fault, and retrying a spent quota cannot help. Signals are read from each lane's authoritative error fields only, never the model's prose, with precedence auth, quota, rejected, refused, cut_short, empty.
- **`refused=N` on every run.** Tool calls a hook or deny rule blocked, counted from qwen's `permission_denials`, agy's deny-rule steps, codex's router `Rejected(` lines, and grok's session transcript (its `sessionId` is charset-checked, the path is contained to the sessions root, lines must name the same session, and the read is capped at 5 MiB). `null` when a lane gives no signal. A deliverable with refused calls is still exit 0.
- **A problem line and a fix line** on the terminal for every failure, and for an `ok` run with refused calls, so a calling agent can relay "this is what went wrong, this is the fix" and ask.
- **Terminal output is redacted** before it prints: JSON credential keys, `Authorization:` values, bearer values, URL query credentials, and common key prefixes, redacted before any clipping.
- **The durable log gains `class` and `refused`.** Both are fixed values; the log still never holds provider text, the problem line or stderr.

### Changed

- **A nonzero vendor exit is no longer passed through as cli-run's exit code.** The class owns the code, and the vendor's own code stays in the log as `cli_rc`. A nonzero exit nothing else explains is `cut_short` (18), and it is still never `ok`. If a script compared `cli-run`'s exit code with a specific vendor code, compare `cli_rc` in the log instead; `!= 0` checks are unaffected.
- **A lane killed by a signal, or output past the 16 MiB buffer, is `cut_short` (18)**, not 10. Exit 10 now means only an empty run or an unmet `--expect-*` contract.
- **agy's judge refuses a non-object terminal `result` as `bad_last_event`** (was `bad_status`), and **qwen's judge refuses a non-string `error.message` as `error_message_not_string`**, so both classify as `cut_short`. hermes' stderr cause (degraded free tier, bad `--toolsets`) is now named in its detail line.

## [0.1.22] - 2026-09-12

### Added

- **SuperGrok Plus as a `grok` plan (high headroom).** xAI's pricing page lists it with "Significantly higher usage across Chat, Imagine, Voice & Build", so `--plans grok=supergrok-plus` now works and counts as a high-headroom lane for plan guidance and `--effort-auto`. SuperGrok Heavy stays out: the page states no Build usage for it. A test holds both.

## [0.1.21] - 2026-09-12

### Added

- **Subscription plans, stated by you and never guessed.** The installer asks which plan you hold for Claude Code, Codex, `agy` and `grok` (interactive, or `--plans codex=pro-20x,agy=ultra-5x`; `--plans none` clears). Each plan row in `src/catalog.js` carries only a name, a headroom level (`base`, `high`, `max`), its official source page and the date it was checked; no prices and no model ids, because both change faster than releases. `--list` prints them.
- **Plan guidance in the generated docs.** The lanes table gains a `Plan` column, and `ROUTING.md` and `DELEGATION_MATRIX.md` gain a plan guidance block: high and max headroom lanes take volume (scoped builds, pre-ship second-family audits, first-pass research), base headroom lanes keep short second opinions. Headroom moves volume only; who reviews what does not change.
- **`--effort auto` in `cli-run`.** Accepted as a flag or as a `lanes.json` default on every lane with an effort flag (qwen still refuses it). A call sizes from prompt length: under 4,000 characters is `medium`, otherwise `high`. A codex `--audit` always runs at `high` and logs the larger of prompt length and changed lines as evidence. Auto never resolves above `high`: `xhigh`, `max` and `ultra` are sent only when named. The durable log gains `effort_resolved`, `effort_basis` (`explicit`, `prompt_chars`, `audit_floor`, `none`), `effort_scope` and `effort_truncated`.
- **Bounded change counting for audits.** Untracked files are listed NUL-delimited, only regular files are opened (FIFOs, devices and symlinks are skipped by `lstat`), and the pass stops at 200 files, 256 KiB per file, 2 MiB total or 2 seconds, marking the evidence truncated. An unborn `HEAD` or any git failure falls back to prompt length.

### Changed

- **Automatic effort is opt-in.** A high or max headroom plan does not change `bin/lanes.json` by itself; `--effort-auto` (or yes to the question) writes `"effort": "auto"` for exactly those cli-run lanes. Claude Code is never written there, since it is not a cli-run lane and an entry for it would fail the whole file closed. With no plan stated, `bin/lanes.json` is byte-identical to 0.1.20 and `MANIFEST.json` records no plan keys. A re-run that omits `--plans` keeps the previous plans.
- **Five documented Windows skips, not four.** The FIFO half of the new untracked-file test needs `mkfifo`; its symlink half runs everywhere.

## [0.1.20] - 2026-09-12

### Added

- **A Claude Code plugin.** `/plugin marketplace add aunysillyme/model-orchestrator`, then `/plugin install model-orchestrator@model-orchestrator`, installs `route-gate.mjs`, `subagent-context.mjs` and the eight subagents without merging a settings snippet by hand. The bundle lives in `plugin/`, listed by `.claude-plugin/marketplace.json` at the repo root. It passes `claude plugin validate --strict`, the check Anthropic's community marketplace review runs, and all eight checks of Sigistry's public plugin verification methodology (1.2), run standalone before release as a quality bar; the plugin is not listed there.
- **The plugin is generated, never a second copy.** `npm run gen:plugin` renders `plugin/` from the same `templates/` the installer uses, and `test/plugin.test.js` fails when the committed bundle drifts from that, when `plugin.json`'s version is not `package.json`'s, when `hooks/hooks.json` references a hook that is not shipped, when a plugin hook gains a network call, a file write, credential access, dynamic evaluation or a subprocess, when an agent has no `tools:` line or a review-type agent carries Write or Edit, and when the plugin README loses its install commands. Each check was proved red against the real files before it was trusted.
- **The plugin's route gate works without an install step.** A plugin cannot be rendered per project, so its `route-gate.mjs` reads the installer's default locations, `ai-orchestrator/ROUTING.md` then `ai-orchestrator/ORCHESTRATOR.md`, and takes the first that exists. Something at the first path that is not a readable file (a directory, a FIFO) is reported, never skipped for the second. With neither present it tells Claude on every prompt, and the user once at session start, to run `npx model-orchestrator`, so a project with no rules is never a silent no-op.

### Changed

- **`builder`, `deep-planner` and `live-researcher` now declare their tools, for npm installs too.** Until now they carried no `tools:` line and inherited every tool the session had, MCP tools included. `builder` gets `Read, Write, Edit, Glob, Grep, Bash`; `deep-planner` gets `Read, Glob, Grep` (its prompt already says it never edits); `live-researcher` gets `WebSearch, WebFetch`. This narrows what those three agents can do in an existing install once regenerated: if you relied on `builder` calling an MCP tool, or `deep-planner` running a command, add the tool to that agent's `tools:` line or delete the line.
- **`route-gate.mjs` takes a list of rules paths instead of one.** An installer render is a one-element list with no setup hint, so an npm install behaves exactly as before; a test pins that render.

### Fixed

- **`route-gate.mjs` could emit more than Claude Code's 10,000-character hook output cap, on npm installs too.** The routing table was capped at 4,000 characters, but a fallback message embeds the resolved project path and the error text, so a 12,000-character `CLAUDE_PROJECT_DIR` produced 12,146 characters from an installer render. Every string the hook emits is now capped at 8,000 characters, with a test on both renders. Found by the pre-release audit round and reproduced before the fix.
- **The plugin's hook-safety test could not see an async write or subprocess.** `writeFileSync?` matches `writeFileSyn` and `writeFileSync`, never `writeFile`, and every `process.env` read was exempt. The check now matches the Sync and async form of every file write and subprocess call, refuses dynamic `import(` and `require(`, allows static imports of `node:fs` and `node:path` only, requires `openSync` to open read-only, and allows no environment variable but `CLAUDE_PROJECT_DIR`, with a red case for each. Found by the same audit round.

### Not changed

- `route-metrics.mjs` still installs with `npx model-orchestrator`, unchanged. It is left out of the plugin only, because it writes a log to disk and the plugin ships only hooks that read.

## [0.1.19] - 2026-09-12

### Added

- **The `route-gate.mjs` non-regular-file guard is now tested on every OS, not only where `mkfifo` exists.** The FIFO test is the only one that can prove the HANG the guard exists to prevent (a naive `readFileSync` on a writer-less FIFO blocks forever), and Windows has no `mkfifo` to build one, so that test was skipped there and nothing exercised `!st.isFile()` on Windows at all. A directory at the same rules path reaches the same guard before any `open` or `read` call, on every OS, so the guard itself is covered everywhere and the win32 skip is no longer its only coverage.
- **A guard that refuses an undocumented test skip.** `test/prose.test.js` pins each skip to its file, its exact marker and a phrase the README has to carry, then counts every `{ skip:` in the suite and fails if the totals disagree. Proved in both directions: adding a skip anywhere fails it, and removing a skip's explanation from the README fails it.

### Fixed

- **The README's Windows skip list named three of the four skips.** The `mkfifo` skip in `test/hooks.test.js` had never been documented, in the README or the changelog, while the sentence above it read "a few narrow skips remain" and enumerated the rest. A skipped test reads as a test that passed, so an undocumented skip is a coverage claim nobody made deliberately. All four are named now, the conditional `statSync().mode` assertion is labelled as the one-assertion case it is rather than a skipped test, and the sentence says outright that the list is enforced by a test rather than maintained by hand.

## [0.1.18] - 2026-09-11

### Fixed

- **The level 3 box's weekly audit could record a hung `--version` probe as a version string instead of "UNVERIFIED: timed out".** `weekly-audit.sh`'s `killtree` killed a hung process's children before the process itself, so in that gap the probe's own shell could print and exit 0, and `bounded()` reported success. Seen once on macOS CI ("codex never" in the report); 0 of 20 local runs reproduced it, so it is rare but real on the box. `killtree` now freezes each process (SIGSTOP) before walking its children, and the watchdog leaves a marker when it fires so `bounded()` returns 124 whatever order the kills land in. A new test forces the bad ordering and checks the timeout still reads as one.
- **On Windows, `bin/cli-run.mjs` could not run any lane at all: `spawn()` threw `EINVAL` for every `.cmd` binary, which is how npm installs every agent CLI there.** Since Node's fix for CVE-2024-27980 (18.20.2, 20.12.2, and every 22.x), spawning a `.bat`/`.cmd` target without `shell: true` throws instead of silently running it through an unsafely-escaped `cmd.exe`. This was a real, shipped defect, not a test gap: a Windows user following this README could not have run a single lane before this release. `bin/cli-run.mjs` now resolves the `.cmd` shim to the Node script npm's own `cmd-shim` tool wrote underneath it and spawns Node directly on that script (`resolveCmdShim`, `windowsSpawnPlan`), so a prompt (untrusted text this tool does not control) never passes through a shell at all in the common case. A lane whose `.cmd`/`.bat` cannot be resolved that way (an old or hand-edited shim) is refused with exit 13 and a message saying how to fix it, never run through `cmd.exe`: a batch file re-reads its arguments through `%*` after `cmd.exe` has parsed them once, and no escaping fully contains a prompt through both passes. The escaped `cmd.exe` path (the algorithm documented at [qntm.org/cmd](https://qntm.org/cmd) and used by `cross-spawn`, with `windowsVerbatimArguments`) survives only as an explicit opt-in for the installer's own `npm install -g <pinned spec>`, whose arguments never include user text. Verified against the real, byte-for-byte output of `cmd-shim@9.0.2` (the package npm itself uses), not a guessed shape; the escaping is pinned to exact expected strings for `&`, `|`, `^`, `%`, `"`, a trailing backslash and a literal newline in `test/judges.test.js`.
- **A reconfigure's terminal report (`runtime upgraded:`, `runtime CONFLICT, kept:`, `documents kept:`, and the rest) printed a Windows install's file paths with backslashes**, while every other path this tool prints in generated text uses forward slashes; `src/install.js`'s manifest key was already posix-normalized, but the label built alongside it for the human-readable report was not. `writeFiles()` now builds both from the same posix-normalized value.
- **A `--dir` outside the project root, or the `vm/` level-3 templates' `INSTALL_DIR`/`INSTALL_DIR_SH`/`INSTALL_DIR_SYSTEMD`, ran through this host's own `path.resolve()`, which reads a leading `/` as drive-relative on win32**, wrong for both: the `vm/` templates describe a REMOTE Linux box (`weekly-audit.sh` is bash, `weekly-audit.service` is a systemd unit, neither of which can run anywhere but Linux), and the outside-project case is documentation prose, not a local filesystem path. An absolute `--dir` given as a bare POSIX path now renders unchanged on every host for both; a real local Windows path (one naming a drive) is untouched, since that case never took this branch.
- **`killTree`'s win32 branch spawned a bare `taskkill`, which depends on PATH containing `System32`; when it does not, the spawn's `ENOENT` reaches this tool as an unheard `error` event on the returned process and crashes the whole run over what should be a best-effort cleanup step.** Found on `windows-latest` CI the first time a lane actually ran end to end there, once the `EINVAL` fix above stopped hiding it. `taskkillPath()` now resolves the executable under `%SystemRoot%` (falling back through `%windir%` to a fixed path), independent of PATH, and `killTree` attaches an error listener so a spawn failure can never crash the wrapper.
- **`bin/cli.js`'s own opt-in `npm install -g <ai>` prompt had the identical `EINVAL`-shaped defect as the lane spawn above, in a different file**, since it called `spawnSync('npm', ...)` directly with no shell. It now resolves `npm` with `which()` and runs it through the same `windowsSpawnPlan()` `bin/cli-run.mjs` exports, instead of a second, duplicated fix.

### Changed

- **The three Windows test-skip groups tracked in [#30](https://github.com/aunysillyme/model-orchestrator/issues/30) are gone, replaced by two narrower, individually-justified skips found by actually running the unskipped suite on `windows-latest` CI, plus the one pre-existing skip this pass never touched (`statSync().mode`'s executable bit; NTFS has nothing equivalent).** `test/cli.test.js`'s fake lane binaries now install as an npm-style `.cmd` shim (verified against the real `cmd-shim@9.0.2` output) pointing at a small Node script, the same shape a real vendor CLI's install takes through `windowsSpawnPlan()` above, instead of a bespoke `sh.exe` bridge that never exercised cli-run.mjs's own spawn path at all; every test in that group but one, and the `#12` upgrade-path pair (fixed by the report-label change above), now runs unconditionally. `test/install.test.js`'s 7 formerly-skipped tests split on what their path assertion actually describes: the ones naming a `vm/` remote-box path stay literal POSIX (now true on every host, per the `INSTALL_DIR*` fix above); the ones naming a LOCAL path (where this run wrote files on this host) now build their expectation with `resolve()`/`join()` instead of a hardcoded POSIX literal, so they assert the same real, platform-native value the product renders rather than a string that only happened to match on POSIX. Two of those seven also had their own, separate bug once actually run on Windows: their fake `curl`/`jq`/`node`/`codex` binaries were placed on a hand-built PATH containing the literal strings `/usr/bin` and `/bin`, which name nothing on that OS; they now prepend the stub directory to the REAL `process.env.PATH` (this job already runs under Git Bash, so that PATH already carries what `bash` itself needs) instead of replacing it with a POSIX-only guess.
- **New skip: a lane dying mid-run from a real POSIX signal genuinely cannot be reproduced on win32.** cli-run.mjs's `r.signal || r.status === null` branch exists for a real lane crashing or being sent a signal, but a real Windows lane is a plain `node <script>` process (via the resolved cmd-shim), so it cannot die "by signal" any more than the product it is testing can; Windows has no OS-level POSIX signals. The only way this file's fixture can even simulate a signal death is a nested `sh -c "...; kill -TERM $$"` (writeShellStub's win32 branch has to bridge through `sh` for the shell body to run at all), which puts an extra node process between cli-run.mjs and the dying shell; measured on `windows-latest` CI, MSYS bash's own self-kill status leaks through as a plain nonzero exit code (3840), which this tool already handles correctly, just under a different, honest verdict (`exit_nonzero`, not `killed`).
- **`#13` (SIGTERM/SIGINT to the wrapper) is Windows-aware now, not skipped, for both signals: Windows has no OS-level signals at all**, proven on `windows-latest` CI (the wrapper died as `{code: null, signal: sig}` for SIGTERM AND SIGINT alike; a hypothesis that SIGINT gets a real, catchable console-control event there was tried first and measured false in this exact scenario, not assumed). The test now expects an unhandled termination for both signals on win32; the graceful exit-143/130-and-kill-the-lane-first behavior stays a POSIX guarantee, asserted as before on every other OS.
- **New skip: `#10`'s watchdog-kill test, and the new `#10b` `bounded()` timeout check, for the same reason.** `weekly-audit.sh`'s `bounded()`/`killtree()` rely on `pgrep -P` and killing a backgrounded subshell's process tree, real bash job control this script only ever runs under on the box it targets (a systemd-scheduled job on Ubuntu, never something a Windows user runs locally). Actually executing that watchdog against a genuinely hanging stub under `windows-latest` CI's Git Bash, rather than just rendering and syntax-checking the script (which the rest of this test group does, and which passes), hung past a 20s outer timeout: MSYS's job-control emulation does not reliably propagate a `kill -KILL` to the underlying Windows process tree of a backgrounded `( subshell ) &`, a known class of MSYS/Cygwin limitation, not a defect in the generated script.
- One test-report-label assertion in `test/install.test.js` and one in `test/cli.test.js` still hardcoded `path.join()`'s native separator for what is now posix-normalized generated text (the report-label fix above); both now match the posix form.
- `docs/audit-brief.md` gained a section on the Windows spawn path: what runs, why no shell in the common case, and why a lane is refused rather than run through `cmd.exe`, and how the installer's one opt-in `cmd.exe` call escapes its arguments.

## [0.1.17] - 2026-09-11

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

[Unreleased]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.31...HEAD
[0.1.32]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.31...v0.1.32
[0.1.31]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.30...v0.1.31
[0.1.30]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.29...v0.1.30
[0.1.29]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.28...v0.1.29
[0.1.28]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.27...v0.1.28
[0.1.27]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.26...v0.1.27
[0.1.26]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.25...v0.1.26
[0.1.25]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.24...v0.1.25
[0.1.24]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.23...v0.1.24
[0.1.23]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.22...v0.1.23
[0.1.22]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.21...v0.1.22
[0.1.21]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.20...v0.1.21
[0.1.20]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.19...v0.1.20
[0.1.19]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.18...v0.1.19
[0.1.18]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.17...v0.1.18
[0.1.17]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.16...v0.1.17
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
