# scripts/

| File | Job |
|---|---|
| `gen-catalog.js` | regenerates `docs/catalog.md` AND the vendor compatibility table in `README.md` (between the `vendor-table` markers) from `src/catalog.js`; `npm run gen:catalog`. `test/catalog.test.js` fails if either generated surface disagrees with the catalog. |
| `record-demo.sh` | re-records `docs/demo.gif` by installing the published package into a temp folder and running it under `asciinema`, then rendering the cast with `agg`. Pass a version to pin one: `bash scripts/record-demo.sh 0.1.27`. Needs `brew install asciinema agg`. The frames are the installer's own output, so the GIF stays true to what the command prints. |
| `gen-plugin.js` | regenerates the Claude Code plugin bundle in `plugin/` (agents, the two read-only hooks, `plugin.json`, `LICENSE`) from `templates/`, using the plan in `src/plugin.js`; `npm run gen:plugin`. `test/plugin.test.js` fails if the committed bundle disagrees. `plugin/README.md` and `plugin/hooks/hooks.json` are hand-owned. |
