# Context7: version-aware docs for your agent (optional)

Repo: https://github.com/upstash/context7 · Upstash · MIT · hosted MCP server, or run it yourself with `npx`

**Optional.** Skip this if your agent already opens the real source or docs of anything it calls before writing code against it. The rule it serves, `protocols/docs-then-prove.md`, binds either way.

**Paired with codecalc, not a replacement for it.** Context7 answers "what is this library documented to do, on this version": current docs and code examples, pulled straight into the prompt. codecalc answers "what does this code actually do": it runs the thing. A doc can be stale, a version can drift, a default can change between releases; only a run proves current behaviour. Where the two disagree, the run wins and the source settles it.

## What it gives every agent in this folder

| Need in the protocol | Context7 tool |
|---|---|
| find the Context7 id for a library, SDK, API or CLI by name | `resolve-library-id` (MCP) or `ctx7 library <name> <query>` (CLI) |
| pull current, version-specific docs and code examples before writing a call | `query-docs` (MCP, needs a library id) or `ctx7 docs <libraryId> <query>` (CLI) |
| skip the library-matching step when you already know the exact package | address it directly, `/org/project` (e.g. `/vercel/next.js`), optionally with `@version` |

Context7 indexes documentation from GitHub, GitLab, Bitbucket, websites, `llms.txt` files, OpenAPI specs and Confluence spaces. It is community-contributed: the upstream disclaimer says it cannot guarantee every project's docs are accurate, complete or current, which is exactly why `protocols/docs-then-prove.md` treats a Context7 answer as a lead codecalc (or your own test run) still has to confirm, never as a verdict.

## What you need first

| Requirement | Why | Notes |
|---|---|---|
| **Node.js 18+** | runs the local server or the `ctx7` CLI | only needed for the local (`npx`) connection; the hosted endpoint needs nothing local at all |
| **A network call to `mcp.context7.com`** | Context7 is a hosted service; there is no fully offline mode | the anonymous rate limit works with no account. Unlike codecalc (offline) and obsidian-tc (local), this tool always leaves the machine |
| A free **`CONTEXT7_API_KEY`** (optional) | raises the anonymous rate limit | get one at [context7.com/dashboard](https://context7.com/dashboard); it is never pasted into a snippet in `mcp/` (see "Higher rate limits" below) |

## Install

Two ways to connect, remote first (Context7's own documented default, and the one that needs nothing installed). Both connect keyless, at the anonymous rate limit, which is enough to try it:

```bash
# Remote (recommended): no install. Point your MCP client at the hosted endpoint,
# https://mcp.context7.com/mcp. No key needed: anonymous requests work at a
# lower rate limit. OAuth is available where your client supports it
# (mcp.context7.com/mcp/oauth), as an alternative to an API key, not required either.

# Local alternative: runs the MCP server on your machine over stdio.
npx -y @upstash/context7-mcp

# Or the one-command setup Context7 itself ships, which authenticates via OAuth,
# writes an API key, and can install a CLI-based skill instead of MCP:
npx ctx7 setup
```

Pinned form, if you want the version this installer was released against: `npx -y @upstash/context7-mcp@{{CONTEXT7_PIN}}`. Drop the pin for latest; `npx` always resolves fresh, so pinning only matters when you want a reproducible version rather than whatever shipped this week.

`npx ctx7 setup` is upstream's own guided installer; it is not run by this installer, only documented here, the same way this project never runs a vendor script for you.

## Register it with your agent (snippets in `mcp/`)

Every snippet below ships **keyless**: the remote ones point at the hosted endpoint with no `Authorization` header at all (Qwen Code's snippet keeps the non-credential `Accept` header upstream itself ships), and both Zed snippets run the local, version-pinned `npx` server with no key in its `env` block. That is deliberate, not an oversight: see "Higher rate limits" next for why a header is not shipped by default.

| Agent | File to edit | Snippet |
|---|---|---|
| Claude Code | its MCP config (`.mcp.json`); needs `"type": "http"` next to `url` or Claude Code skips the server as misconfigured | `mcp/context7.claude-code.mcp.json` |
| Claude Desktop | no config file: `Settings > Connectors > Add Custom Connector`, name `Context7`, URL `https://mcp.context7.com/mcp` | none, it is a UI step |
| Cursor | one-click install in the upstream README, or `~/.cursor/mcp.json` | `mcp/context7.mcpServers.json` |
| VS Code | `.vscode/mcp.json` (key is `servers`, remote type is `http`) | `mcp/context7.vscode.mcp.json` |
| Zed | `~/.config/zed/settings.json` (key is `context_servers`); upstream ships only a local (`npx`) config for Zed, so this snippet runs the server locally rather than remote. On Windows a current Zed starts it as written; see "Local `npx` on Windows" below for the two cases that need the `.windows` file | `mcp/context7.zed.settings.json` · fallback: `mcp/context7.zed.windows.settings.json` |
| Codex CLI | `~/.codex/config.toml` | `mcp/context7.codex.config.toml` |
| Antigravity `agy` | its MCP config file | `mcp/context7.agy.mcp_config.json` |
| Qwen Code | `~/.qwen/settings.json` under `mcpServers`; note the field is `httpUrl`, not `url`, a different shape from every other client here | `mcp/context7.qwen.settings.json` |

### Local `npx` on Windows

On Windows `npx` is a batch file (`npx.cmd`) that a bare `CreateProcess` will not start, and Context7's own client guide says to wrap it in `cmd` on Windows ([all clients, Windows section](https://context7.com/docs/resources/all-clients)). That guide is about clients in general. **Zed is not one that needs it:** since its PR #42382, "Use shell to launch MCP and ACP servers" (2025-12-10), `crates/context_server/src/transport/stdio_transport.rs` builds every MCP launch through `ShellBuilder::new(&Shell::System, ..)`, so the shell resolves `npx` and a plain `"command": "npx"` starts. The `.windows` snippet is kept for two cases it does fix: a Zed older than that build, and the PowerShell one below. This only affects the local form either way: every remote snippet above connects over HTTPS and spawns nothing.

| Where | Use |
|---|---|
| Zed on macOS or Linux | `mcp/context7.zed.settings.json` (`"command": "npx"`) |
| Zed on Windows, current build | `mcp/context7.zed.settings.json` as well; the shell Zed opens resolves `npx` |
| Zed on Windows, older build or a blocked `npx.ps1` | `mcp/context7.zed.windows.settings.json` (`"command": "cmd"`, `"args": ["/d", "/c", "npx", ...]`) |
| Any other client, local alternative, on Windows | usually nothing: Cursor, VS Code, the Codex CLI and every client on the stock `@modelcontextprotocol/sdk` resolve `PATHEXT` themselves. If yours genuinely does not, the change is `"command": "cmd"` with `"/d", "/c", "npx"` in front of the existing args |

The one Windows failure that is not about `.cmd`: Zed prefers PowerShell for the system shell (`get_windows_system_shell` in `crates/gpui_util/src/lib.rs` falls back to `cmd.exe` only when PowerShell is missing), and PowerShell resolves a bare `npx` to npm's `npx.ps1` shim when one is installed. Under the `Restricted` execution policy that is Windows' client default, a `.ps1` will not run. Check `Get-ExecutionPolicy`, and if that is the cause the `.windows` snippet is the fix.

The `/d` in those args is deliberate: without it `cmd` first runs whatever is in the Command Processor `AutoRun` registry value, which can print non-JSON into the protocol stream. `cross-spawn`, the library the MCP TypeScript SDK uses for exactly this job, passes `/d /s /c` for the same reason.

Not yet run on a Windows machine by this project.

Merge the block; do not replace the file. `mcp/context7.mcpServers.json` (Cursor) and `mcp/context7.claude-code.mcp.json` look alike but are not interchangeable: Claude Code requires the `"type": "http"` field and Cursor's own docs show plain `{"url": ...}` with no `type` at all.

## Higher rate limits (optional key)

Anonymous works. If you hit the rate limit and want a key, add it the correct way for your client, and never as a literal value pasted into any of the snippets above:

- **Codex CLI**: under the `[mcp_servers.context7]` table in `~/.codex/config.toml`, add a `bearer_token_env_var` entry naming the environment variable `CONTEXT7_API_KEY`. Codex reads the token from that variable at connect time and sends it as the `Authorization` header itself; the config file never holds the value ([Codex MCP docs](https://developers.openai.com/codex/mcp)).
- **Claude Code** (`mcp/context7.claude-code.mcp.json`): add a `headers` object to the `context7` entry with an `Authorization` field whose value is `Bearer` followed by a `${CONTEXT7_API_KEY}` reference. Claude Code expands `${VAR}` references in a remote server's `headers` at load time, and `CONTEXT7_API_KEY` is not one of the credential names it deliberately reads as empty (those are Claude/Anthropic-specific). Set the variable in your environment before launching; an unset variable still loads with the literal, unexpanded reference sent as the header, and Context7 answers every call with "Invalid API key" instead of running anonymously ([Claude Code MCP docs](https://code.claude.com/docs/en/mcp)). That failure, not a missing feature, is why this snippet ships with no header at all.
- **Claude Desktop**: the Connectors UI has its own key field; use it there rather than editing a file.
- **Any local `npx` connection** (Zed, or the local alternative for any other client): export `CONTEXT7_API_KEY` in the shell that launches your editor or agent. A spawned stdio child process inherits its parent's environment by default, so `npx -y @upstash/context7-mcp` picks it up with no config edit; this is the same environment variable name Context7's own Docker MCP Toolkit config and its GitHub Copilot integration use to feed the server a key. If your client does not pass its environment through to the child (uncommon), either stay anonymous, or check whether that client's own config format has an `env` block that itself supports an environment-variable reference (Claude Code's does, described above; not every client's does) rather than typing the key in.
- **Cursor, VS Code, Qwen Code, Antigravity `agy`, or any other client using the `mcpServers.json`/`vscode.mcp.json`/`qwen.settings.json`/`agy.mcp_config.json` snippet**: check that client's own docs for whether it expands an environment-variable reference inside a remote server's `headers` before adding one. This is not confirmed for any of them here. If it does not expand, the literal, unexpanded text becomes the header value and every call fails with "Invalid API key" instead of running anonymously, which is worse than shipping no header at all.

## Security posture, read before you send anything through it

Only the library name and your query text reach Context7's API; your source code is never uploaded. It is still a third-party network call on every lookup, unlike codecalc (offline) and obsidian-tc (local by default): do not route a query that would leak a private project name, an internal library name, or anything else you would not put in a public search box. The docs it indexes are community-contributed, not vetted by Context7 or by this installer; a suspicious or malicious-looking result is reportable upstream from the project's page. An API key raises your rate limit; it is not a secret worth protecting the way a database credential is, but it still never belongs in a committed file, only in your environment.

## Level 3

Runs the same way at any level: the remote endpoint over HTTPS, or the local `npx` server over stdio next to the orchestrator CLI on the box. Nothing about it changes on a box except that the box, not your laptop, is the machine making the network call.
