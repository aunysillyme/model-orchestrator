# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog 2.0.0](https://keepachangelog.com/en/2.0.0/) and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html); on `0.y.z` anything may change.

## [Unreleased]

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

[Unreleased]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.4...HEAD
[0.1.4]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.3...v0.1.4
[0.1.3]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/aunysillyme/model-orchestrator/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/aunysillyme/model-orchestrator/releases/tag/v0.1.0
