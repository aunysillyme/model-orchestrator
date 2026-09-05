# Catalog

Generated from `src/catalog.js`. Do not hand-edit; `npm run gen:catalog` rewrites it. Protocols shipped at every level: 6 (counted from `templates/common/protocols/`).

## Levels

| Level | Name | Tagline | Gives |
|---|---|---|---|
| 1 | Beginner | one LLM or agent, routed well | tiers, task classification, every protocol, one agent set up to follow them |
| 2 | Intermediate | several LLMs and agents, called through their CLIs | everything in Beginner plus cli-run, a delegation matrix, task bundles and three-engine research triage |
| 3 | Advanced | everything above, plus a virtual machine that runs it unattended | everything in Intermediate plus a gateway config, scheduled jobs, a dispatch layer and privacy gates for a box |

## AIs

### `claude-code` · Claude Code (Anthropic)

- **Kind:** agent-cli · **Access:** subscription · **Lane:** A · **Level:** 1+
- **Wins at:** orchestrator: routes, maps, builds, verifies, records
- **Install:** `npm install -g @anthropic-ai/claude-code@2.1.260`
- **Sign in:** run `claude` once and sign in with your Anthropic account
- **Reads rules from:** `CLAUDE.md` · subagents in `.claude/agents/`

### `codex` · Codex CLI (OpenAI, ChatGPT plan)

- **Kind:** agent-cli · **Access:** subscription · **Lane:** A · **Level:** 1+
- **Wins at:** second coder and adversarial auditor (a different model family reading your diff)
- **Install:** `npm install -g @openai/codex@0.153.2`
- **Sign in:** `codex login` (add `--device-auth` on a machine with no browser)
- **Reads rules from:** `AGENTS.md`
- **cli-run lane:** yes

### `agy` · Antigravity CLI `agy` (Google AI plan)

- **Kind:** agent-cli · **Access:** subscription · **Lane:** A · **Level:** 1+
- **Wins at:** deep research sweeps and concurrent fan-out (its subagent call takes an array)
- **Install:** vendor script (read it first): `https://antigravity.google/cli/install.sh`
- **Sign in:** first run opens a device-code sign-in with your Google account
- **Reads rules from:** `GEMINI.md` · subagents in `.agents/agents/`
- **cli-run lane:** yes
- **Note:** Gemini CLI was retired by Google in June 2026. agy is the successor. Do not install `gemini`.

### `grok` · Grok CLI (xAI, X Premium)

- **Kind:** agent-cli · **Access:** subscription · **Lane:** A · **Level:** 1+
- **Wins at:** X and live web reads at no per-call cost (its search tools bill on the API, not on the CLI)
- **Install:** vendor script (read it first): `https://x.ai/cli/install.sh`
- **Sign in:** `grok login` (add `--device-auth` on a headless machine)
- **cli-run lane:** yes

### `hermes` · Hermes Agent (Nous Research)

- **Kind:** agent-cli · **Access:** free · **Lane:** A · **Level:** 2+
- **Wins at:** the free tier: rough drafts, first-pass summaries, cheap divergent reads, cron jobs on a box
- **Install:** https://github.com/NousResearch/hermes-agent
- **Sign in:** `hermes auth add <provider>` per provider; its own fallback chain handles outages
- **cli-run lane:** yes

### `qwen` · Qwen Code CLI (Alibaba, provider-agnostic)

- **Kind:** agent-cli · **Access:** metered · **Lane:** B · **Level:** 2+
- **Wins at:** cheapest metered bulk lane for structured output; never for anything that cites a line, a number or a source
- **Install:** `npm install -g @qwen-code/qwen-code@0.23.0`
- **Sign in:** a provider key in an environment variable, named (not stored) in ~/.qwen/settings.json. There is no free Qwen cloud tier any more.
- **Reads rules from:** `QWEN.md`
- **cli-run lane:** yes
- **Note:** Its own success flags lie on API failures. cli-run checks the two honest signals for you.

### `ollama` · Ollama (local models)

- **Kind:** local · **Access:** local · **Lane:** local · **Level:** 2+
- **Wins at:** the privacy lane: anything that must never leave the machine. Not a cost lane.
- **Install:** https://ollama.com/download (or `brew install ollama`)
- **Sign in:** none

### `claude-app` · Claude app or claude.ai (chat only, no CLI)

- **Kind:** chat · **Access:** subscription · **Lane:** chat · **Level:** 1+
- **Wins at:** single-agent use through Projects and custom instructions
- **Install:** https://claude.ai
- **Sign in:** sign in

### `chatgpt-app` · ChatGPT (chat only, no CLI)

- **Kind:** chat · **Access:** subscription · **Lane:** chat · **Level:** 1+
- **Wins at:** single-agent use through custom instructions and Projects
- **Install:** https://chatgpt.com
- **Sign in:** sign in

### `gemini-app` · Gemini app (chat only, no CLI)

- **Kind:** chat · **Access:** subscription · **Lane:** chat · **Level:** 1+
- **Wins at:** single-agent use through Gems and saved instructions
- **Install:** https://gemini.google.com
- **Sign in:** sign in

## Companion tools

### `codecalc` · codecalc (calculator, code runner, logic checker for your agent)

- **Repo:** https://github.com/The-40-Thieves/codecalc
- **Gives:** exact arithmetic, code execution in 31 languages, SMT logic checks, complexity and equivalence proofs; offline, no key, no telemetry
- **Install:** `uvx 'codecalc[full]' setup --write` (needs uv (https://docs.astral.sh/uv/) and Python 3.10+)
- **Registers itself with:** Claude Code, Claude Desktop, Cursor, VS Code, Zed; snippets for the rest are written to `mcp/`
- **Default:** selected

### `obsidian-tc` · obsidian-tc (governed memory: an agent-ready MCP server over an Obsidian vault)

- **Repo:** https://github.com/The-40-Thieves/obsidian-tc
- **Gives:** durable memory and record for your agents: hybrid retrieval (BM25 + dense + link graph), backlinks, compare-and-swap writes with a confirmation gate, folder ACLs, a poison scan on inferred writes; 163 tools, local by default
- **Install:** `npm install -g obsidian-tc && obsidian-tc /path/to/your/vault` (needs an Obsidian vault folder (the Obsidian app itself is only needed for live plugin bridges); Node 24+ or Bun 1.1+ (stricter than this installer); Ollama with `nomic-embed-text` for local embeddings, or a cloud embeddings key; the Local REST API plugin only for bridge tools)
- **Registers itself with:** Cursor, VS Code; snippets for the rest are written to `mcp/`
- **Default:** not selected

