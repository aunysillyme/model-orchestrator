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

### Local `npx` on Windows

Every snippet here spawns `npx`, and on Windows `npx` is a batch file (`npx.cmd`) that a bare `CreateProcess` will not start. **All five clients handle that themselves, so there is no Windows snippet here and the files above are the ones to use on every OS.** Each was read rather than assumed, because the usual advice ("on Windows, wrap it in `cmd /c`") is about clients in general and is wrong for all five of these:

| Client | How it starts `"command": "npx"` on Windows | Checked against |
|---|---|---|
| Zed | hands the whole command to the system shell | `crates/context_server/src/transport/stdio_transport.rs` builds through `ShellBuilder::new(&Shell::System, ..)`, from PR #42382 "Use shell to launch MCP and ACP servers" (2025-12-10) |
| VS Code | resolves the executable, then re-spawns it through a shell | `src/vs/workbench/api/node/extHostMcpNode.ts`, `formatSubprocessArguments` resolves the extension and sets `shell: true` when it ends in `.bat` or `.cmd` |
| Codex CLI | resolves `PATHEXT` itself before spawning | `codex-rs/rmcp-client/src/program_resolver.rs`, whose Windows arm calls `which::which_in` so that "tools like `npx`, `pnpm`, and `yarn` work correctly on Windows" |
| Cursor | the MCP SDK it bundles spawns through `cross-spawn` | Cursor 3.18.9 ships `@modelcontextprotocol/sdk` 1.25.1, whose `dist/esm/client/stdio.js` opens with `import spawn from 'cross-spawn'`; `cross-spawn/lib/parse.js` resolves the command and, when it is not an `.exe`, re-invokes it as `%COMSPEC% /d /s /c "<escaped>"` |
| Antigravity `agy` | same SDK path, through the Gemini CLI config namespace it reads | Gemini CLI pins `@modelcontextprotocol/sdk` 1.23.0 in `packages/core/package.json` and hands `mcpServerConfig.command` to that transport; 1.23.0's `client/stdio.js` imports `cross-spawn` too |

The SDK point covers more than these two clients: every published `@modelcontextprotocol/sdk` from 1.23.0 through 1.30.0 depends on `cross-spawn ^7.0.5` and uses it in the stdio client, so any client that connects through the stock TypeScript SDK inherits the same `PATHEXT` resolution. `shell: false` in that transport is not the whole story, and reading only that line is how a client gets mistaken for one that cannot start `npx`.

One Windows case can still fail, and it is not about `.cmd`. Zed prefers PowerShell for the system shell (`get_windows_system_shell` in `crates/gpui_util/src/lib.rs` falls back to `cmd.exe` only when PowerShell is missing), and PowerShell resolves a bare `npx` to npm's `npx.ps1` shim when one is installed. Under the `Restricted` execution policy that is Windows' client default, running a `.ps1` is blocked. If Zed reports that the server would not start, check `Get-ExecutionPolicy` first, and if that is the cause, change the Zed entry by hand to `"command": "cmd"` with `"args": ["/d", "/c", "npx", "-y", "obsidian-tc"]`, keeping the rest of the block. `/d` is there on purpose: it skips any Command Processor `AutoRun` command, which would otherwise run first and can print non-JSON into the protocol stream.

None of this was run on a Windows machine by this project. The five verdicts are from each client's own shipped code; the PowerShell case is from Zed's shell choice plus documented `Restricted` behaviour, and is the one worth reporting back if you hit it.

## Security posture, read before a second agent touches it

Zero-config mode boots with **auth off and no folder ACL**: anything that can reach the server has the same authority as raw filesystem access to the vault. That is acceptable only because the surface is local-only (the config refuses by default if you enable HTTP on a non-loopback host with auth off, and a DNS-rebinding guard protects loopback). Before exposing it to partially-trusted, remote or multi-agent callers, turn on `auth.mode: "jwt"` and set `acl.readPaths` / `writePaths` / `deletePaths` in the config file. Upstream `SECURITY.md` has the security notes and a private disclosure path.

Track record worth knowing: an independent code audit of v1.8.1 (July 2026) found three security-relevant gaps (an ACL bypass that let enumeration tools skip its refuse-by-default rule, a compare-and-swap bypass through `upsert`, a poison-eligibility gap in preference extraction). All three were fixed upstream before they were filed; verified against the v1.25.0 source on 2026-09-03.

## Level 3

On a box it runs as a stdio server next to the orchestrator, or as the Docker service, against the vault the box holds. Keep the HTTP transport off unless every caller is on your private mesh and auth is on. Its embeddings run on the box's Ollama, so nothing leaves the machine.
