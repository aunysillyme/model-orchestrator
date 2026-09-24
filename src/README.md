# src/

| File | Job |
|---|---|
| `catalog.js` | the single list of levels and AIs. Add an AI here and the prompts, docs tables, delegation matrix, gateway config and installer all pick it up. Nothing else lists AIs. |
| `detect.js` | PATH lookup for a binary, plus the few places vendor installers drop binaries without touching PATH. No shell-outs. |
| `install.js` | pure planner: turns (level, selection, primary) into a list of files to write, rendering templates and computing every generated table. `writeFiles` is the only thing that touches disk. `activationSteps()` and `snippetFor()` live here so the terminal summary and the generated README render the same list. `subagentsLoadRules(primary)` gates every delegate-by-default render var (builder-by-default wording, the route-gate table, the inline-threshold note) on the one verified premise: a claude-code subagent loads CLAUDE.md. |
| `apply-snippets.js` | validates the two Claude Code activation targets before any writes, builds a replaceable marked block and merges hook entries. `writeFiles` applies these opt-in entries with backups and rollback; they stay outside the uninstall manifest. |
| `plugin.js` | the plan for the Claude Code plugin bundle in `plugin/`: `planPluginFiles()` renders the claude-code agents and the two read-only hooks from the same templates `install.js` uses, with plugin render vars (the installer's default rules paths, the setup hint for a project with no rules) instead of per-install ones. Pure; `scripts/gen-plugin.js` writes it and `test/plugin.test.js` checks the committed copy. |
| `prompt.js` | line-buffered questions for the interactive path; piped answers are queued, EOF mid-prompt aborts instead of confirming a write. |
| `render.js` | `{{KEY}}` substitution. Throws on an unknown key, so a template typo fails the test suite instead of shipping a literal placeholder. |
