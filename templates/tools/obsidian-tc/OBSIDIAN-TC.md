# obsidian-tc: governed memory for your agents (optional)

Repo: https://github.com/The-40-Thieves/obsidian-tc · "Obsidian Turbocharged" · 163 tools · TypeScript + Rust · AGPL-3.0 · local by default, no cloud account

**Optional.** Skip this if you do not keep notes in Obsidian. The rule it serves, `protocols/memory-and-record.md`, binds either way.

## What it gives every agent in this folder

A durable, searchable, governed store that the protocols can call by name:

| Need in the protocols | obsidian-tc tool |
|---|---|
| find what exists before writing (deep research dedupe, gap analysis) | `semantic_search`, `search_text`, `search_regex` |
| map everything a rename touches (propagate) | `get_backlinks`, `find_unresolved_links`, `rewrite_link` |
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
npm install -g obsidian-tc@{{OBSIDIAN_TC_PIN}}   # the version this installer was released with; drop the pin for latest
ollama pull nomic-embed-text
obsidian-tc /path/to/your/vault          # zero-config: one vault named "main", local only
obsidian-tc plugin install --vault /path/to/your/vault   # optional companion plugin, then enable it in Obsidian
```

For more than one vault, auth, ACLs or custom embeddings, write `obsidian-tc.config.json` and pass its path (or set `OBSIDIAN_TC_CONFIG` to it). `obsidian-tc config show <file>` prints the effective config with secrets redacted.

## Register it with your agent (snippets in `mcp/`)

Every snippet points `OBSIDIAN_TC_CONFIG` at your config file. Replace `/ABSOLUTE/PATH/TO/obsidian-tc.config.json` (the Windows snippets carry a `C:\ABSOLUTE\PATH\TO\` placeholder instead); the value is a path, not a secret.

| Agent | File to edit | Snippet |
|---|---|---|
| Claude Code, Claude Desktop, any client with a `mcpServers` map | its MCP config (`.mcp.json` for Claude Code) | `mcp/obsidian-tc.mcpServers.json` |
| Cursor | one-click badge in the upstream README, or `~/.cursor/mcp.json` | macOS/Linux: `mcp/obsidian-tc.mcpServers.json` · **Windows: `mcp/obsidian-tc.cursor.windows.mcpServers.json`**, see "Local `npx` on Windows" below |
| VS Code | one-click badge, or `.vscode/mcp.json` (key is `servers`) | `mcp/obsidian-tc.vscode.mcp.json` |
| Zed | `~/.config/zed/settings.json` (key is `context_servers`) | `mcp/obsidian-tc.zed.settings.json` |
| Codex CLI | `~/.codex/config.toml` | `mcp/obsidian-tc.codex.config.toml` |
| Antigravity `agy` | `~/.gemini/config/mcp_config.json` | macOS/Linux: `mcp/obsidian-tc.agy.mcp_config.json` · **Windows: `mcp/obsidian-tc.agy.windows.mcp_config.json`**, see "Local `npx` on Windows" below |
| Qwen Code | `~/.qwen/settings.json` under `mcpServers` | `mcp/obsidian-tc.mcpServers.json` |
| Claude Desktop, other MCPB hosts | a prebuilt `.mcpb` bundle from the upstream build | see upstream README |

Merge the block; do not replace the file.

### Local `npx` on Windows

Every snippet here spawns `npx`, and on Windows `npx` is a batch file (`npx.cmd`) that a client cannot start as a bare command unless it resolves `PATHEXT` or hands the command to a shell. Some of these clients do, some do not, so this is a per-client answer rather than one rule. What was checked, and where:

| Client | Starts `"command": "npx"` on Windows? | Checked against | Use |
|---|---|---|---|
| Zed | yes, it wraps the command in the system shell | `crates/context_server/src/transport/stdio_transport.rs` builds through `ShellBuilder::new(&Shell::System, ..)`, from PR #42382 "Use shell to launch MCP and ACP servers" (2025-12-10) | `mcp/obsidian-tc.zed.settings.json` on every OS |
| VS Code | yes, it resolves the extension and re-spawns through the shell | `src/vs/workbench/api/node/extHostMcpNode.ts`, `formatSubprocessArguments` resolves the executable and sets `shell: true` when it ends in `.bat` or `.cmd` | `mcp/obsidian-tc.vscode.mcp.json` on every OS |
| Codex CLI | yes, it resolves `PATHEXT` itself | `codex-rs/rmcp-client/src/program_resolver.rs`, whose Windows arm calls `which::which_in` so that "tools like `npx`, `pnpm`, and `yarn` work correctly on Windows" | `mcp/obsidian-tc.codex.config.toml` on every OS |
| Cursor | no | Cursor 3.18.9's shipped `out/vs/code/electron-utility/mcpProcess/mcpProcessMain.js` passes the configured command straight to `StdioClientTransport` from `@modelcontextprotocol/sdk`, which spawns with `shell: false` and no `PATHEXT` lookup | `mcp/obsidian-tc.cursor.windows.mcpServers.json` on Windows |
| Antigravity `agy` | probably not | its own docs describe `command` only as "Path to the executable", with no Windows note; it reads the Gemini CLI config namespace, and Gemini CLI hands `mcpServerConfig.command` to the same `shell: false` SDK transport. A Windows report of `"command": "npx"` never starting is modelcontextprotocol/servers#3278 (2026-01-31) | `mcp/obsidian-tc.agy.windows.mcp_config.json` on Windows |

The Windows snippets are the same call behind `cmd /c`: `"command": "cmd"` with `"/c", "npx"` in front of the existing args. Their `OBSIDIAN_TC_CONFIG` placeholder is a Windows path, so the backslashes are doubled the way JSON requires.

Claude Code, Claude Desktop and Qwen Code share `mcp/obsidian-tc.mcpServers.json` with Cursor, and none of the three was checked here, so the Cursor row is about Cursor only. If one of them fails to start the server on Windows, the same `cmd /c` change is the thing to try.

Antigravity is closed source, so its row is inference from its documented config shape and its Gemini CLI lineage, not from its own code. If a bare `"command": "npx"` starts the server for you there, the plain `mcp/obsidian-tc.agy.mcp_config.json` is the one to keep. None of this was run on a Windows machine by this project.

## Security posture, read before a second agent touches it

Zero-config mode boots with **auth off and no folder ACL**: anything that can reach the server has the same authority as raw filesystem access to the vault. That is acceptable only because the surface is local-only (the config refuses by default if you enable HTTP on a non-loopback host with auth off, and a DNS-rebinding guard protects loopback). Before exposing it to partially-trusted, remote or multi-agent callers, turn on `auth.mode: "jwt"` and set `acl.readPaths` / `writePaths` / `deletePaths` in the config file. Upstream `SECURITY.md` has the security notes and a private disclosure path.

Track record worth knowing: an independent code audit of v1.8.1 (July 2026) found three security-relevant gaps (an ACL bypass that let enumeration tools skip its refuse-by-default rule, a compare-and-swap bypass through `upsert`, a poison-eligibility gap in preference extraction). All three were fixed upstream before they were filed; verified against the v1.25.0 source on 2026-09-03.

## Level 3

On a box it runs as a stdio server next to the orchestrator, or as the Docker service, against the vault the box holds. Keep the HTTP transport off unless every caller is on your private mesh and auth is on. Its embeddings run on the box's Ollama, so nothing leaves the machine.
