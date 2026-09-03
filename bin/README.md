# bin/

Two executables. Both are plain Node, no dependencies.

| File | What it is | Who runs it |
|---|---|---|
| `cli.js` | The installer. `npx model-orchestrator` lands here. Asks level + access, writes files, offers npm installs one at a time. | You, once per machine or project |
| `cli-run.mjs` | The lane runner. Copied into your install at level 2 and above as `bin/cli-run.mjs`. Runs one agent CLI and exits non-zero unless it produced a deliverable. | Your orchestrator, every time it delegates to another CLI |

`cli-run.mjs` exports its judges (`judgeGrok`, `judgeCodex`, `judgeAgy`, `judgeHermes`, `judgeQwen`) so `test/` can prove each one goes red on the failure shapes it exists to catch, without spawning any CLI.
