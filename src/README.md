# src/

| File | Job |
|---|---|
| `catalog.js` | the single list of levels and AIs. Add an AI here and the prompts, docs tables, delegation matrix, gateway config and installer all pick it up. Nothing else lists AIs. |
| `roles.js` | pure role assignment from selected catalog capability facts, billing and selection order. Renders the stack table and manifest roles, and infers the main agent from its supported surfaces. Unknown facts remain unverified; review requires a known different model family and private work requires local execution. |
| `aunx.js` | command dispatch for briefs, context, checks, routing and runner calls. Route suggestions read manifest roles through a capped regular-file JSON reader; symlinks and malformed files are ignored. Route lookup executes no project code. A project's runner requires explicit `--dir`. |
| `detect.js` | PATH lookup for a binary, plus the few places vendor installers drop binaries without touching PATH. No shell-outs. |
| `install.js` | pure planner: turns (level, selection, primary) into a list of files to write, rendering templates and computed role assignments. `writeFiles` is the only thing that touches disk. `activationSteps()` and `snippetFor()` live here so the terminal summary and the generated README render the same list. `subagentsLoadRules(primary)` selects loading guidance from catalog facts. File ownership hashes preserve edits during runtime upgrades and document updates, migrate the old brief name, and keep uninstall ownership of existing companion files. |
| `apply-snippets.js` | validates the two Claude Code activation targets before any writes, builds a replaceable marked block and merges hook entries. `writeFiles` applies these opt-in entries with backups and rollback; they stay outside the uninstall manifest. |
| `plugin.js` | the plan for the Claude Code plugin bundle in `plugin/`: `planPluginFiles()` renders the claude-code agents and the two read-only hooks from the same templates `install.js` uses, with plugin render vars (the installer's default rules paths, the setup hint for a project with no rules) instead of per-install ones. Pure; `scripts/gen-plugin.js` writes it and the marketplace listing and `test/plugin.test.js` checks the committed copy. |
| `prompt.js` | line-buffered questions for the interactive path; piped answers are queued, EOF mid-prompt aborts instead of confirming a write. |
| `render.js` | `{{KEY}}` substitution. Throws on an unknown key, so a template typo fails the test suite instead of shipping a literal placeholder. |
