# obsidian-tc: governed memory for your agents (optional)

Repo: https://github.com/The-40-Thieves/obsidian-tc · "Obsidian Turbocharged" · 163 tools · TypeScript + Rust · AGPL-3.0 · local by default, no cloud account

**Optional.** Skip this if you do not keep notes in Obsidian. The rule it serves, `protocols/memory-and-record.md`, binds either way.

## What it gives every agent in this folder

A durable, searchable, governed store that the protocols can call by name:

| Need in the protocols | obsidian-tc tool |
|---|---|
| find what exists before writing (deep research dedupe, gap analysis) | `semantic_search`, `search_text`, `search_regex` |
| map a rename's blast radius (propagate) | `get_backlinks`, `find_unresolved_links`, `rewrite_link` |
| record the end-to-end doc (build Stage 7) | `write_note` (compare-and-swap, confirmation on overwrite), `patch_note`, `append_note` |
| keep inferred content honest | `write_note` with `provenance: "agent_synthesis"` runs a poison scan before the write lands |
| keep a shared vault safe for several agents | JWT scopes, per-vault folder ACLs, a read-only kill switch, human-in-the-loop tokens |

## What you need first (contingent tools)

| Requirement | Why | Notes |
|---|---|---|
| **An Obsidian vault folder** | it is the store | a folder of markdown files; the Obsidian app itself is only needed for the live plugin bridges |
| **Node 24+ or Bun 1.1+** | its runtime | stricter than this installer's Node 18; check `node -v` |
| **Ollama with `nomic-embed-text`** | local embeddings for semantic search | `ollama pull nomic-embed-text`; or configure a cloud embeddings provider (OpenAI, Voyage, Cohere, any OpenAI-shaped endpoint) with a key in your environment |
| The Obsidian app + its **Local REST API** plugin | only for bridge tools (Dataview, Templater, Excalidraw, OCR, Obsidian Git, the command palette) | optional; without them every filesystem tool still works and bridge tools return a typed `requires_live_obsidian` |
| Docker (alternative) | run it from `docker-compose.yml` against a bind-mounted vault with no npm install | optional |

## Install

```bash
npm install -g obsidian-tc
ollama pull nomic-embed-text
obsidian-tc /path/to/your/vault          # zero-config: one vault named "main", local only
obsidian-tc plugin install --vault /path/to/your/vault   # optional companion plugin, then enable it in Obsidian
```

For more than one vault, auth, ACLs or custom embeddings, write `obsidian-tc.config.json` and pass its path (or set `OBSIDIAN_TC_CONFIG` to it). `obsidian-tc config show <file>` prints the effective config with secrets redacted.

## Register it with your agent (snippets in `mcp/`)

Every snippet points `OBSIDIAN_TC_CONFIG` at your config file. Replace `/ABSOLUTE/PATH/TO/obsidian-tc.config.json`; the value is a path, not a secret.

| Agent | File to edit | Snippet |
|---|---|---|
| Claude Code, Claude Desktop, any client with a `mcpServers` map | its MCP config (`.mcp.json` for Claude Code) | `mcp/obsidian-tc.mcpServers.json` |
| Cursor | one-click badge in the upstream README, or `~/.cursor/mcp.json` | `mcp/obsidian-tc.mcpServers.json` |
| VS Code | one-click badge, or `.vscode/mcp.json` (key is `servers`) | `mcp/obsidian-tc.vscode.mcp.json` |
| Zed | `~/.config/zed/settings.json` (key is `context_servers`) | `mcp/obsidian-tc.zed.settings.json` |
| Codex CLI | `~/.codex/config.toml` | `mcp/obsidian-tc.codex.config.toml` |
| Antigravity `agy` | `~/.gemini/config/mcp_config.json` | `mcp/obsidian-tc.agy.mcp_config.json` |
| Qwen Code | `~/.qwen/settings.json` under `mcpServers` | `mcp/obsidian-tc.mcpServers.json` |
| Claude Desktop, other MCPB hosts | a prebuilt `.mcpb` bundle from the upstream build | see upstream README |

Merge the block; do not replace the file.

## Security posture, read before a second agent touches it

Zero-config mode boots with **auth off and no folder ACL**: anything that can reach the server has the same authority as raw filesystem access to the vault. That is acceptable only because the surface is local-only (the config fail-closes if you enable HTTP on a non-loopback host with auth off, and a DNS-rebinding guard protects loopback). Before exposing it to partially-trusted, remote or multi-agent callers, turn on `auth.mode: "jwt"` and set `acl.readPaths` / `writePaths` / `deletePaths` in the config file. Upstream `SECURITY.md` has the threat model and a private disclosure path.

Track record worth knowing: an independent code audit of v1.8.1 (July 2026) found three security-relevant gaps (an ACL fail-closed bypass in enumeration tools, a compare-and-swap bypass through `upsert`, a poison-eligibility gap in preference extraction). All three were fixed upstream before they were filed; verified against the v1.25.0 source on 2026-09-03.

## Level 3

On a box it runs as a stdio server next to the orchestrator, or as the Docker service, against the vault the box holds. Keep the HTTP transport off unless every caller is on your private mesh and auth is on. Its embeddings run on the box's Ollama, so nothing leaves the machine.
