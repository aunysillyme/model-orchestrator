# scripts/

| File | Job |
|---|---|
| `gen-catalog.js` | regenerates `docs/catalog.md` AND the vendor compatibility table in `README.md` (between the `vendor-table` markers) from `src/catalog.js`; `npm run gen:catalog`. `test/catalog.test.js` fails if either generated surface disagrees with the catalog. |
