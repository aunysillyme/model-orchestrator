# Works well with

Companions add calculation, searchable notes or current library documentation. They are other authors' projects, with their own releases and support channels. All are opt-in; a default install and `--yes` both select none.

```bash
npx model-orchestrator --tools codecalc,obsidian-tc,context7
```

Selecting a companion writes model-orchestrator's setup guide and configuration snippets. The installer installs only its own files, prints missing tools together under **Install these yourself**, and leaves third-party commands for you to run. `--no-tools` remains accepted for existing scripts.

## Choose a companion

| Project | Maintainer | What it adds | Setup and support |
|---|---|---|---|
| [codecalc](https://github.com/The-40-Thieves/codecalc) | The-40-Thieves | Local arithmetic, code execution, logic and equivalence checks | Follow the generated `CODECALC.md` and the [upstream instructions](https://github.com/The-40-Thieves/codecalc#readme); report tool issues [upstream](https://github.com/The-40-Thieves/codecalc/issues) |
| [obsidian-tc](https://github.com/The-40-Thieves/obsidian-tc) | The-40-Thieves | Search, backlinks and controlled writes for an Obsidian notes folder | Follow `OBSIDIAN-TC.md` and the [upstream instructions](https://github.com/The-40-Thieves/obsidian-tc#readme); report tool issues [upstream](https://github.com/The-40-Thieves/obsidian-tc/issues) |
| [Context7](https://github.com/upstash/context7) | Upstash | Current documentation and examples for a specific library version | Follow `CONTEXT7.md` and the [upstream instructions](https://github.com/upstash/context7#readme); report tool issues [upstream](https://github.com/upstash/context7/issues) |

Check each project's current runtime and sign-in requirements before installing it. Context7 sends documentation queries over the network, including when its MCP server runs locally. Keep private source and secrets out of query text.

## Use the protocols with your existing tools

| Need | With a companion | With your existing tools |
|---|---|---|
| Compute and verify | codecalc | A calculator, a local runtime or your project's test command |
| Search and record | obsidian-tc | A notes folder, file search and version control |
| Check an API | Context7 | Current official documentation and upstream source, then a local execution check |

Every install includes `protocols/numbers-and-logic.md`, `protocols/memory-and-record.md` and `protocols/docs-then-prove.md`. The protocols describe the job; companion selection changes which tool can do it.

## Keep an existing setup

Upgrading from 0.1.x preserves existing codecalc files. `--uninstall` removes a managed companion guide or snippet only when its content still matches the recorded hash; edited files stay and are listed. See [Upgrading from 0.1.x](install.md#upgrading-from-01x).
