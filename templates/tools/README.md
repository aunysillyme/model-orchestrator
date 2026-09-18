# templates/tools/

Companion tools: not AIs, but things the AIs call. Each subfolder is written only when the user selects that tool (`--tools codecalc`, or the interactive question).

| Folder | Written | Contents |
|---|---|---|
| `codecalc/` | when codecalc is selected (recommended, default yes) | `CODECALC.md` (install, per-client registration, the skill) and `mcp/` snippets for the agents its own `setup --write` does not cover |
| `obsidian-tc/` | when obsidian-tc is selected (optional, default no; needs an Obsidian vault, Node 24+, Ollama or a cloud embeddings key) | `OBSIDIAN-TC.md` (what you need first, install, per-agent registration, security posture) and `mcp/` snippets |
| `context7/` | when context7 is selected (optional, default no; needs a network call, a Node 18+ local alternative, an optional API key) | `CONTEXT7.md` (what you need first, install, per-agent registration, security posture) and `mcp/` snippets |

The rules the tools serve, `protocols/numbers-and-logic.md`, `protocols/memory-and-record.md` and `protocols/docs-then-prove.md`, are in `common/` and are written at every level whether or not a tool was selected: the rule binds, the tool makes it cheap to follow. `src/install.js` writes `templates/tools/<id>/` for every selected tool that has a folder here.
