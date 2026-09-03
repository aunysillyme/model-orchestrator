# src/

| File | Job |
|---|---|
| `catalog.js` | the single list of levels and AIs. Add an AI here and the prompts, docs tables, delegation matrix, gateway config and installer all pick it up. Nothing else lists AIs. |
| `detect.js` | PATH lookup for a binary, plus the few places vendor installers drop binaries without touching PATH. No shell-outs. |
| `install.js` | pure planner: turns (level, selection, primary) into a list of files to write, rendering templates and computing every generated table. `writeFiles` is the only thing that touches disk. |
| `prompt.js` | line-buffered questions for the interactive path; piped answers are queued, EOF mid-prompt aborts instead of confirming a write. |
| `render.js` | `{{KEY}}` substitution. Throws on an unknown key, so a template typo fails the test suite instead of shipping a literal placeholder. |
