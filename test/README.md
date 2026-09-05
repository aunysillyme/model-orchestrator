# test/

`npm test` runs `node --test`, which discovers `test/*.test.js`. No network, no CLI spawned, no dependency.

| File | Proves |
|---|---|
| `judges.test.js` | every `cli-run` judge accepts a well-formed success AND refuses each failure shape it exists to catch, including the lane whose success flags lie. One isolating case per check, so a disabled check turns exactly one case red. |
| `catalog.test.js` | every AI has the fields the installer relies on, ids are unique, install methods are one of the three known shapes, and no field carries a value that looks like a key. |
| `install.test.js` | planning is pure and level-additive, every template placeholder renders, writing into a temp dir produces the plan, a second run keeps existing files unless `--force`, and `--dry` writes nothing. |
| `prose.test.js` | no em dash in any text file in the tree; the house rule is enforced, not requested. Includes a case proving the check can go red. |
| `cli.test.js` | the entry point end to end in a temp dir: non-interactive, piped interactive answers, EOF mid-prompt aborts, `--list`, `--help`, and `cli-run` exit codes. |

A harness that cannot go red proves nothing: `judges.test.js` includes a self-check that a no-op judge fails the suite.
