# templates/tools/

Companion tools: not AIs, but things the AIs call. Each subfolder is written only when the user selects that tool (`--tools codecalc`, or the interactive question).

| Folder | Written | Contents |
|---|---|---|
| `codecalc/` | when codecalc is selected (recommended, default yes) | `CODECALC.md` (install, per-client registration, the skill) and `mcp/` snippets for the agents its own `setup --write` does not cover |

The rule the tool serves, `protocols/numbers-and-logic.md`, is in `common/` and is written at every level whether or not the tool was selected: the rule binds, the tool makes it cheap to follow.
