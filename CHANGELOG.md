# Changelog

## 0.1.1

Audit follow-up (issues #1 to #10 on the repo):

- `cli-run`: lanes run in their own process group and the group is killed on timeout or buffer overrun (#1); the durable log stores only a fixed reason code (#4); nonzero vendor exits pass through with an `exit_nonzero` verdict and a bounded stderr head on the terminal (#9); the guarantee is stated exactly and `--expect-file` / `--expect-json` add opt-in contracts (#5).
- Weekly audit: `--audit` for codex and an explicit boundary note for other lanes (#2); temp-and-rename so a failed rerun never truncates the last good report, failed output kept beside it (#3); every probe under a watchdog, `TimeoutStartSec=900`, `UNVERIFIED` lines for timed-out probes (#10).
- Installer: `MANIFEST.json` and `bin/lanes.json` are machine-owned and rewritten on every run, with a requested-vs-applied report on reconfiguration (#6); one `npmSpec` helper so the interactive install, the printed command, the table and the box script use the same pinned version (#8).
- README leads with the GitHub route pinned to the release until the npm publish, and states which properties are enforced, delegated or instructions (#7, #11). CI installs the packed tarball into a clean consumer and runs it.

## 0.1.0

First release.

- Installer (`npx model-orchestrator`): three levels, access-aware AI selection, primary-agent loading surface, companion-tool question (codecalc), strict flags, containment preflight, exclusive create with rollback, no vendor scripts run.
- `bin/cli-run.mjs`: one entrypoint for grok, codex, agy, hermes and qwen with each lane's native success signal; exit 10 on a run that produced nothing, fail-closed `lanes.json`, signal handling, digest-only log.
- Templates: five protocols (build, propagate, gap analysis, deep research, numbers and logic), task bundle, single-agent and multi-lane routing, tiers, generated delegation matrix, research triage, VM tier (gateway config by env-var name, compose on loopback, box rules, privacy gates, weekly audit timer).
- Tests: a case per fix, judges proven to go red, mutation checks; `npm test` prints the current count.
- Companion tools, both optional: codecalc (recommended) and obsidian-tc (needs an Obsidian vault, Node 24+, Ollama or a cloud embeddings key). The numbers-and-logic and memory-and-record protocols are written at every level.
- Adversarial audit: two Codex rounds plus a two-engine review (Codex, Antigravity); findings and their fixes are in `docs/audit-brief.md`.
- After the review: subagents go to the project root (`--project`), snippet paths are computed from `--dir`, lane sections render from the selection, a primary agent is required, level 3 asks for API keys separately from CLIs, images and CLI installs are pinned, `cli-run --doctor`, an activation summary at the end of every install.
