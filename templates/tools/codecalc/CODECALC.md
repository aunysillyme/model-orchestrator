# codecalc: the calculator, code runner and logic checker your agent calls

Repo: https://github.com/The-40-Thieves/codecalc · offline, self-hosted, no key, no telemetry · 52 MCP tools

What it gives every agent in this folder: exact arithmetic (`evaluate_expression`, `solve_linear`), code execution in 31 languages (`execute_code`, sandboxed), logic (`z3_check`, `truth_table`), complexity (`analyze_complexity`, `benchmark`), and two proofs nobody else offers cleanly: `verify_translation` (a port behaves identically) and `verify_optimization` (an optimization preserved behaviour). The rule that makes it worth installing is `protocols/numbers-and-logic.md`.

## Install (one command)

Needs `uv` (https://docs.astral.sh/uv/) and Python 3.10+.

```bash
uvx 'codecalc[full]' setup            # prints what it would do, changes nothing
uvx 'codecalc[full]' setup --write    # merges the codecalc entry into your client's config, copies the skill
```

`setup` detects Claude Desktop, Claude Code, Cursor, VS Code and Zed (`--client=NAME` if several), runs two real canaries and ends in one verdict: `ready` / `degraded` / `not-ready`. It backs up the client config it touches. `uvx 'codecalc[full]' doctor` prints a config block with your absolute paths.

Pinned form, if you want the version this installer was released with: `uvx 'codecalc[full]=={{CODECALC_PIN}}' setup --write`. `[full]` is the edition that actually runs everything documented (about 120 MB). Base `codecalc` is execution only; symbolic tools then return a `dependency_missing` error naming the extra, never a silent failure.

## Agents `setup` does not register (snippets in `mcp/`)

| Agent | File to edit | Snippet |
|---|---|---|
| Codex CLI | `~/.codex/config.toml` | `mcp/codex.config.toml` |
| Antigravity `agy` | `~/.gemini/config/mcp_config.json` (remote servers use `serverUrl`; this one is local stdio) | `mcp/agy.mcp_config.json` |
| Qwen Code | `~/.qwen/settings.json` under `mcpServers` | `mcp/mcpServers.json` |
| Any client with a `mcpServers` map | its MCP config | `mcp/mcpServers.json` |
| VS Code | `.vscode/mcp.json` (key is `servers`) | `mcp/vscode.mcp.json` |
| Zed | `~/.config/zed/settings.json` (key is `context_servers`) | `mcp/zed.settings.json` |

Merge the block; do not replace the file. Every other server you have stays as it was.

## Install the skill too

The tools cannot help a model that never reaches for them. codecalc ships `SKILL.md` inside the package and `setup --write` copies it for Claude Code. For other agents, copy it into that agent's skills folder (Antigravity and Qwen Code read the same `SKILL.md` format). `protocols/numbers-and-logic.md` in this folder is the house rule that points at it.

## What it is not

Not a cloud sandbox for multi-tenant loads, not a replacement for a vendor's built-in interpreter when zero setup matters more than measurement. Its threat model is single-operator, local, stdio. It earns its keep when the correctness of a claim, not "it ran", is the point.

## On a box (level 3)

Runs as a stdio server next to the orchestrator CLI; nothing to expose, nothing to bind. Its executor is the Rust sandbox when the platform wheel carries it, and `doctor` tells you which backend you are on before a tool call surprises you.
