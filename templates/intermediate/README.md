# templates/intermediate/

Written at level 2 and above, on top of `common/` and `beginner/`.

| File | What it adds |
|---|---|
| `ROUTING.md` | the multi-lane decision tree; supersedes `ORCHESTRATOR.md` when present |
| `TIERS.md` | capability tiers, the three cost levers, job fit, model availability and effort selection |
| `DELEGATION_MATRIX.md` | task → lane → pick, generated from the user's selection |
| `RESEARCH_TRIAGE.md` | selected engines in parallel, one source-checking writer |
| `CLI-RUN.md` | how `aunx cli-run` and `bin/cli-run.mjs` verify each response |

`bin/cli-run.mjs` and `bin/lanes.json` are written by the installer from `bin/cli-run.mjs` in this repo and the user's selection; they are not templates.
