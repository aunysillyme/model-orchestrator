# AGENTS.md

Two audiences: an agent that wants to USE this package for a project, and an agent that is working ON this repository.

## Using this package from an agent

model-orchestrator writes routing rules, subagents and a CLI lane runner so an agent sends each task to the right model, subagent or CLI and spends fewer frontier tokens. It is not a proxy or gateway. Headless use:

- `npx model-orchestrator --list` prints every supported AI id.
- `npx model-orchestrator --yes --level 2 --ais claude-code,codex --project <repo> --dir <repo>/ai-orchestrator --dry-run` prints the plan and writes nothing.
- Drop `--dry-run` to write it. Existing files are never overwritten without `--force`; activation snippets (for example `CLAUDE.snippet.md`, `settings.hooks.snippet.json`) are written for a person or agent to merge.
- The generated `README.md` in `--dir` lists what to copy where and one smoke command to prove the rules took.
- A summary for LLMs, with links to every doc: [`llms.txt`](llms.txt).

## Working on this repository

The files the installer writes for end users live under `templates/`.

- Read `CONTRIBUTING.md` first, then `src/README.md` (the catalog drives everything) and `docs/audit-brief.md` (the threat model and what has already been attacked).
- Run `npm test` before proposing a change and quote the count and the exit code; the suite prints the current number.
- Everything renders from `src/catalog.js`. Add an AI or a tool there, not in a template. Templates carry no logic.
- Never put a value that looks like a credential anywhere in this repo, including tests and examples. Environment variable names only.
- `bin/cli.js` writes only inside `--dir` and `--project`, never over a document without `--force`, and never runs a vendor script. A change that weakens any of those will be refused in review; the tests that hold them are in `test/install.test.js` and `test/cli.test.js`.
- `bin/cli-run.mjs` must exit non-zero when a lane produced nothing. Every judge has a red case in `test/judges.test.js`; add one before you change a judge.
- Prose in this repo uses no em dashes (`test/prose.test.js` enforces it).
- Why these rules exist: each one is the fix for a failure that reached an audit or CI. `CHANGELOG.md` names the issue behind each.
