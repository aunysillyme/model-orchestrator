# Changelog

## 0.1.0

First release.

- Installer (`npx model-orchestrator`): three levels, access-aware AI selection, primary-agent loading surface, companion-tool question (codecalc), strict flags, containment preflight, exclusive create with rollback, no vendor scripts run.
- `bin/cli-run.js`: one entrypoint for grok, codex, agy, hermes and qwen with each lane's native success signal; exit 10 on a run that produced nothing, fail-closed `lanes.json`, signal handling, digest-only log.
- Templates: five protocols (build, propagate, gap analysis, deep research, numbers and logic), task bundle, single-agent and multi-lane routing, tiers, generated delegation matrix, research triage, VM tier (gateway config by env-var name, compose on loopback, box rules, privacy gates, weekly audit timer).
- Tests: 74 cases, judges proven to go red, two mutation checks.
- Adversarial audit: two rounds, 12 findings, 11 fixed, 1 deferred with mitigation (documented in `docs/audit-brief.md`).
