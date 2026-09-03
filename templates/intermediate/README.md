# templates/intermediate/

Written at level 2 and above, on top of `common/` and `beginner/`.

| File | What it adds |
|---|---|
| `ROUTING.md` | the multi-lane decision tree; supersedes `ORCHESTRATOR.md` when present |
| `TIERS.md` | capability tiers, the three cost levers, the escalation rule, slotting rules |
| `DELEGATION_MATRIX.md` | task → lane → pick, generated from the user's selection |
| `RESEARCH_TRIAGE.md` | three engines in parallel, one triager |
| `CLI-RUN.md` | how `bin/cli-run.mjs` judges each lane |

`bin/cli-run.mjs` and `bin/lanes.json` are written by the installer from `bin/cli-run.mjs` in this repo and the user's selection; they are not templates.
