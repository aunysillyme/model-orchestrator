# Changelog

## 0.1.0

First release.

- Installer (`npx model-orchestrator`): three levels, access-aware AI selection, primary-agent loading surface, companion-tool question (codecalc), strict flags, containment preflight, exclusive create with rollback, no vendor scripts run.
- `bin/cli-run.mjs`: one entrypoint for grok, codex, agy, hermes and qwen with each lane's native success signal; exit 10 on a run that produced nothing, fail-closed `lanes.json`, signal handling, digest-only log.
- Templates: five protocols (build, propagate, gap analysis, deep research, numbers and logic), task bundle, single-agent and multi-lane routing, tiers, generated delegation matrix, research triage, VM tier (gateway config by env-var name, compose on loopback, box rules, privacy gates, weekly audit timer).
- Tests: 74 cases, judges proven to go red, two mutation checks.
- Companion tools, both optional: codecalc (recommended) and obsidian-tc (needs an Obsidian vault, Node 24+, Ollama or a cloud embeddings key). Six protocols: numbers-and-logic and memory-and-record are written at every level.
- Adversarial audit: two rounds, 20 findings, 19 fixed, 1 deferred with mitigation (documented in `docs/audit-brief.md`).
