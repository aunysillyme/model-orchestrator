# templates/tools/

Companion tools: not AIs, but things the AIs call. Each subfolder is written only when the user selects that tool (`--tools codecalc`, or the interactive question).

| Folder | Written | Contents |
|---|---|---|
| `codecalc/` | when codecalc is selected (recommended, default yes) | `CODECALC.md` (install, per-client registration, the skill) and `mcp/` snippets for the agents its own `setup --write` does not cover |
| `obsidian-tc/` | when obsidian-tc is selected (optional, default no; needs an Obsidian vault, Node 24+, Ollama or a cloud embeddings key) | `OBSIDIAN-TC.md` (what you need first, install, per-agent registration, security posture) and `mcp/` snippets |

The rules the tools serve, `protocols/numbers-and-logic.md` and `protocols/memory-and-record.md`, are in `common/` and are written at every level whether or not a tool was selected: the rule binds, the tool makes it cheap to follow. `src/install.js` writes `templates/tools/<id>/` for every selected tool that has a folder here.
