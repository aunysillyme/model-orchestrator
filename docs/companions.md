# Companion tools

All optional. The installer asks about each one separately; selecting one writes a doc and config snippets, it installs nothing. `--tools codecalc,obsidian-tc,context7` or `--no-tools` for scripted runs; `--yes` alone selects only the recommended one.

## Companion tools (all optional)

An orchestrator routes work. It does not make a model stop guessing numbers, it does not give it a memory, and it does not make it check a library's current docs before writing against it. Three tools close those gaps: codecalc and obsidian-tc are from the same maintainer, Context7 is from Upstash. The installer asks about each one separately; selecting one writes a doc and config snippets, it installs nothing. `--tools codecalc,obsidian-tc,context7` or `--no-tools` for scripted runs; `--yes` alone selects only the recommended one.

| Tool | Closes | Default | You need first |
|---|---|---|---|
| [codecalc](https://github.com/The-40-Thieves/codecalc) | guessed numbers, comparisons, complexity and equivalence claims: exact arithmetic, code execution in 31 languages, SMT logic checks, `verify_translation` / `verify_optimization`; offline, no key | yes | Python 3.10+ and `uv`. `uvx 'codecalc[full]' setup --write` registers it with Claude Code, Claude Desktop, Cursor, VS Code, Zed; snippets for Codex, Antigravity, Qwen Code are written for you |
| [obsidian-tc](https://github.com/The-40-Thieves/obsidian-tc) | no durable memory: hybrid search, backlinks, compare-and-swap writes with a confirmation gate, folder ACLs, a poison scan on inferred writes; 163 tools, local by default; AGPL-3.0 | no | an Obsidian vault folder; Node 24+ or Bun 1.1+ (stricter than this installer); Ollama with `nomic-embed-text` or a cloud embeddings key; the Obsidian app and its Local REST API plugin only for live bridge tools. Skip it if you do not keep notes in Obsidian |
| [Context7](https://github.com/upstash/context7) | stale library recall: current, version-specific docs and code examples pulled into the prompt for any library, SDK, API or CLI; hosted, or `npx` locally; MIT | no | nothing to install for the hosted endpoint; Node.js 18+ for the local alternative; a free API key is optional, for a higher rate limit. Always makes a network call, unlike the other two: skip it offline |

Context7 pairs with codecalc rather than duplicating it: Context7 tells the agent what a library is documented to do on this version, codecalc runs the code and proves what it actually does. Docs never stand as proof on their own, and where the two disagree the run wins.

Whether or not you select them, every level carries the three rules they serve: `protocols/numbers-and-logic.md` (when calling a calculator is mandatory, how to report a computed figure, why a thought log is not evidence), `protocols/memory-and-record.md` (search before writing, the folder index is part of the change, one writer, inferred content marked as inferred), and `protocols/docs-then-prove.md` (current docs before writing a call, then a run proves it, the run wins on disagreement).
