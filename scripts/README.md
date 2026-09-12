# scripts/

| File | Job |
|---|---|
| `gen-catalog.js` | regenerates `docs/catalog.md` AND the vendor compatibility table in `README.md` (between the `vendor-table` markers) from `src/catalog.js`; `npm run gen:catalog`. `test/catalog.test.js` fails if either generated surface disagrees with the catalog. |
| `gen-plugin.js` | regenerates the Claude Code plugin bundle in `plugin/` (agents, the two read-only hooks, `plugin.json`, `LICENSE`) from `templates/`, using the plan in `src/plugin.js`; `npm run gen:plugin`. `test/plugin.test.js` fails if the committed bundle disagrees. `plugin/README.md` and `plugin/hooks/hooks.json` are hand-owned. |
