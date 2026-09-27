# Catalog

Generated from `src/catalog.js`. Do not hand-edit; `npm run gen:catalog` rewrites it. Protocols shipped at every level: 10 (counted from `templates/common/protocols/`).

## Levels

| Level | Name | Tagline | Gives |
|---|---|---|---|
| 1 | Beginner | one LLM or agent, routed well | tiers, task classification, every protocol, one agent set up to follow them |
| 2 | Intermediate | several LLMs and agents, called through their CLIs | everything in Beginner plus cli-run, a delegation matrix and multi-engine research triage |
| 3 | Advanced | everything above, plus templates for your always-on Linux machine | everything in Intermediate plus a gateway config, a scheduled review job, dispatch guidance and configurable privacy gates |

## AIs

### `claude-code` · Claude Code (Anthropic)

- **Kind:** agent-cli · **Billing:** subscription · **Level:** 1+
- **What it is:** Anthropic's terminal coding agent; its subagents load the project rules file
- **Install:** `npm install -g @anthropic-ai/claude-code@2.1.226`
- **Sign in:** run `claude` once and sign in with your Anthropic account
- **Reads rules from:** `CLAUDE.md` · subagents in `.claude/agents/`
- **Plans:**
  - Claude Pro (base headroom, checked 2026-09-12; tier models: unverified): https://claude.com/pricing
  - Claude Max 5x (high headroom, checked 2026-09-12; tier models: unverified): https://claude.com/pricing
  - Claude Max 20x (max headroom, checked 2026-09-12; tier models: unverified): https://claude.com/pricing
- **Built against:** 2.1.226 (the same number the npm pin uses)

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | Anthropic |
| `kind` | agent-cli |
| `billing` | subscription |
| `pricing` | unverified |
| `headless` | yes |
| `cliRun` | no |
| `writesFiles` | yes |
| `readOnlyMode` | no |
| `liveWeb` | yes |
| `runsLocally` | no |
| `fanOut` | unverified |
| `contextWindow` | unverified |
| `loadsProjectRules` | yes |
| `agentDefinitions` | .claude/agents |

### `codex` · Codex CLI (OpenAI, ChatGPT plan)

- **Kind:** agent-cli · **Billing:** subscription · **Level:** 1+
- **What it is:** OpenAI's terminal coding agent on a ChatGPT plan; `--audit` runs it in a read-only filesystem sandbox
- **Install:** `npm install -g @openai/codex@0.153.4`
- **Sign in:** `codex login` (add `--device-auth` on a machine with no browser)
- **Reads rules from:** `AGENTS.md`
- **cli-run lane:** yes
- **Plans:**
  - ChatGPT Plus (base headroom, checked 2026-09-12; tier models: unverified): https://learn.chatgpt.com/codex/pricing.md
  - ChatGPT Pro 5x (high headroom, checked 2026-09-12; tier models: unverified): https://learn.chatgpt.com/codex/pricing.md
  - ChatGPT Pro 20x (max headroom, checked 2026-09-12; tier models: unverified): https://learn.chatgpt.com/codex/pricing.md
- **Built against:** 0.153.4 (the same number the npm pin uses)

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | OpenAI |
| `kind` | agent-cli |
| `billing` | subscription |
| `pricing` | unverified |
| `headless` | yes |
| `cliRun` | yes |
| `writesFiles` | yes |
| `readOnlyMode` | yes |
| `liveWeb` | unverified |
| `runsLocally` | no |
| `fanOut` | no |
| `contextWindow` | unverified |
| `loadsProjectRules` | no |
| `agentDefinitions` | unverified |

### `agy` · Antigravity CLI `agy` (Google AI plan)

- **Kind:** agent-cli · **Billing:** subscription · **Level:** 1+
- **What it is:** Google's Antigravity terminal agent; one subagent call starts several children. fanOut: UNVERIFIED against a vendor doc; inherited from the 0.1.x catalog.
- **Install:** vendor script (read it first): `https://antigravity.google/cli/install.sh`
- **Sign in:** first run opens a device-code sign-in with your Google account
- **Reads rules from:** `GEMINI.md` · subagents in `.agents/agents/`
- **cli-run lane:** yes
- **Plans:**
  - Google AI Pro (base headroom, checked 2026-09-12; tier models: unverified): https://gemini.google/subscriptions/
  - Google AI Ultra 5x (high headroom, checked 2026-09-12; tier models: unverified): https://gemini.google/subscriptions/
  - Google AI Ultra 20x (max headroom, checked 2026-09-12; tier models: unverified): https://gemini.google/subscriptions/
- **Built against:** 1.1.27
- **Note:** Gemini CLI was retired by Google in June 2026. agy is the successor. Do not install `gemini`.

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | Google |
| `kind` | agent-cli |
| `billing` | subscription |
| `pricing` | unverified |
| `headless` | yes |
| `cliRun` | yes |
| `writesFiles` | yes |
| `readOnlyMode` | no |
| `liveWeb` | unverified |
| `runsLocally` | no |
| `fanOut` | yes (UNVERIFIED against a vendor doc; inherited from the 0.1.x catalog.) |
| `contextWindow` | unverified |
| `loadsProjectRules` | unverified |
| `agentDefinitions` | .agents/agents |

### `grok` · Grok CLI (xAI, X Premium)

- **Kind:** agent-cli · **Billing:** subscription · **Level:** 1+
- **What it is:** xAI's terminal agent with first-party X and web search tools; searches are covered by the subscription rather than billed per call. liveWeb: UNVERIFIED against a vendor doc; inherited from the 0.1.x catalog.
- **Install:** vendor script (read it first): `https://x.ai/cli/install.sh`
- **Sign in:** `grok login` (add `--device-auth` on a headless machine)
- **cli-run lane:** yes
- **Plans:**
  - SuperGrok (base headroom, checked 2026-09-12; tier models: unverified): https://x.ai/news/grok-build-cli
  - SuperGrok Plus (high headroom, checked 2026-09-12; tier models: unverified): https://x.ai/pricing
  - X Premium Plus (base headroom, checked 2026-09-12; tier models: unverified): https://x.ai/news/grok-build-cli
- **Built against:** 1.0.5

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | xAI |
| `kind` | agent-cli |
| `billing` | subscription |
| `pricing` | unverified |
| `headless` | yes |
| `cliRun` | yes |
| `writesFiles` | yes |
| `readOnlyMode` | no |
| `liveWeb` | yes (UNVERIFIED against a vendor doc; inherited from the 0.1.x catalog.) |
| `runsLocally` | no |
| `fanOut` | no |
| `contextWindow` | unverified |
| `loadsProjectRules` | no |
| `agentDefinitions` | unverified |

### `hermes` · Hermes Agent (Nous Research)

- **Kind:** agent-cli · **Billing:** free · **Level:** 2+
- **What it is:** A free terminal agent that chains whichever providers you authenticate
- **Install:** https://github.com/NousResearch/hermes-agent
- **Sign in:** `hermes auth add <provider>` per provider; its own fallback chain handles outages
- **cli-run lane:** yes
- **Built against:** 0.20.0

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | unverified |
| `kind` | agent-cli |
| `billing` | free |
| `pricing` | unverified |
| `headless` | yes |
| `cliRun` | yes |
| `writesFiles` | yes |
| `readOnlyMode` | no |
| `liveWeb` | unverified |
| `runsLocally` | no |
| `fanOut` | no |
| `contextWindow` | unverified |
| `loadsProjectRules` | no |
| `agentDefinitions` | unverified |

### `qwen` · Qwen Code CLI (Alibaba, provider-agnostic)

- **Kind:** agent-cli · **Billing:** pay-per-token · **Level:** 2+
- **What it is:** A provider-agnostic terminal agent; you supply the API key, so its rate is your provider's rate
- **Install:** `npm install -g @qwen-code/qwen-code@0.22.3`
- **Sign in:** a provider key in an environment variable, named (not stored) in ~/.qwen/settings.json. There is no free Qwen cloud tier any more.
- **Reads rules from:** `QWEN.md`
- **cli-run lane:** yes
- **Built against:** 0.22.3 (the same number the npm pin uses)
- **Note:** Its own success flags lie on API failures. cli-run checks the two honest signals for you.

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | unverified |
| `kind` | agent-cli |
| `billing` | pay-per-token |
| `pricing` | unverified |
| `headless` | yes |
| `cliRun` | yes |
| `writesFiles` | yes |
| `readOnlyMode` | no |
| `liveWeb` | unverified |
| `runsLocally` | no |
| `fanOut` | no |
| `contextWindow` | unverified |
| `loadsProjectRules` | no |
| `agentDefinitions` | unverified |

### `ollama` · Ollama (local models)

- **Kind:** local-runtime · **Billing:** local · **Level:** 2+
- **What it is:** A local model runtime; work sent here stays on the machine
- **Install:** https://ollama.com/download (or `brew install ollama`)
- **Sign in:** none
- **Built against:** 0.33.3

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | unverified |
| `kind` | local-runtime |
| `billing` | local |
| `pricing` | unverified |
| `headless` | yes |
| `cliRun` | no |
| `writesFiles` | no |
| `readOnlyMode` | no |
| `liveWeb` | no |
| `runsLocally` | yes |
| `fanOut` | no |
| `contextWindow` | unverified |
| `loadsProjectRules` | no |
| `agentDefinitions` | unverified |

### `claude-app` · Claude app or claude.ai (chat only, no CLI)

- **Kind:** chat · **Billing:** subscription · **Level:** 1+
- **What it is:** A chat app; it reads pasted instructions, not files
- **Install:** https://claude.ai
- **Sign in:** sign in

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | Anthropic |
| `kind` | chat |
| `billing` | subscription |
| `pricing` | unverified |
| `headless` | no |
| `cliRun` | no |
| `writesFiles` | no |
| `readOnlyMode` | no |
| `liveWeb` | unverified |
| `runsLocally` | no |
| `fanOut` | no |
| `contextWindow` | unverified |
| `loadsProjectRules` | no |
| `agentDefinitions` | unverified |

### `chatgpt-app` · ChatGPT (chat only, no CLI)

- **Kind:** chat · **Billing:** subscription · **Level:** 1+
- **What it is:** A chat app; it reads pasted instructions, not files
- **Install:** https://chatgpt.com
- **Sign in:** sign in

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | OpenAI |
| `kind` | chat |
| `billing` | subscription |
| `pricing` | unverified |
| `headless` | no |
| `cliRun` | no |
| `writesFiles` | no |
| `readOnlyMode` | no |
| `liveWeb` | unverified |
| `runsLocally` | no |
| `fanOut` | no |
| `contextWindow` | unverified |
| `loadsProjectRules` | no |
| `agentDefinitions` | unverified |

### `gemini-app` · Gemini app (chat only, no CLI)

- **Kind:** chat · **Billing:** subscription · **Level:** 1+
- **What it is:** A chat app; it reads pasted instructions, not files
- **Install:** https://gemini.google.com
- **Sign in:** sign in

**Capability facts.** An unverified value needs a current capability check before use. Role assignments come from the selected stack, using these facts.

| Fact | Value |
|---|---|
| `modelFamily` | Google |
| `kind` | chat |
| `billing` | subscription |
| `pricing` | unverified |
| `headless` | no |
| `cliRun` | no |
| `writesFiles` | no |
| `readOnlyMode` | no |
| `liveWeb` | unverified |
| `runsLocally` | no |
| `fanOut` | no |
| `contextWindow` | unverified |
| `loadsProjectRules` | no |
| `agentDefinitions` | unverified |

## Companion tools

### `codecalc` · codecalc (calculator, code runner, logic checker for your agent)

- **Repo:** https://github.com/The-40-Thieves/codecalc
- **Gives:** exact arithmetic, code execution in 31 languages, SMT logic checks, complexity and equivalence proofs; offline, no key, no telemetry
- **Install:** `uvx 'codecalc[full]' setup --write` (needs uv (https://docs.astral.sh/uv/) and Python 3.10+)
- **Registers itself with:** Claude Code, Claude Desktop, Cursor, VS Code, Zed; snippets for the rest are written to `mcp/`
- **Default:** not selected

### `obsidian-tc` · obsidian-tc (governed memory: an agent-ready MCP server over an Obsidian vault)

- **Repo:** https://github.com/The-40-Thieves/obsidian-tc
- **Gives:** durable memory and record for your agents: hybrid retrieval (BM25 + dense + link graph), backlinks, compare-and-swap writes with a confirmation gate, folder ACLs, a poison scan on inferred writes; 163 tools, local by default
- **Install:** `npm install -g obsidian-tc && obsidian-tc /path/to/your/vault` (needs an Obsidian vault folder (the Obsidian app itself is only needed for live plugin bridges); Node 24+ or Bun 1.1+ (stricter than this installer); Ollama with `nomic-embed-text` for local embeddings, or a cloud embeddings key; the Local REST API plugin only for bridge tools)
- **Registers itself with:** Cursor, VS Code; snippets for the rest are written to `mcp/`
- **Default:** not selected

### `context7` · Context7 (Upstash: version-aware docs for the libraries your agent calls)

- **Repo:** https://github.com/upstash/context7
- **Gives:** up-to-date, version-specific documentation and code examples for libraries, SDKs, APIs and CLIs, pulled into the prompt; tells the agent what the code is SUPPOSED to do. Paired with codecalc, which runs the code and proves what it actually does: docs never stand as proof, and where they disagree the run wins
- **Install:** `npx ctx7 setup` (needs Node.js 18+ for the local server or the ctx7 CLI; a free CONTEXT7_API_KEY is optional, for higher rate limits (it works anonymously at the base rate))
- **Registers itself with:** Claude Code, Cursor, Codex CLI, Qwen Code; snippets for the rest are written to `mcp/`
- **Default:** not selected

