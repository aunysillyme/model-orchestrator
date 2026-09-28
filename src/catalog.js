// The single source the installer, the docs and the generated files all read.
// Add an AI here and every level picks it up. Nothing else lists AIs.
//
// Fields
//   id         stable key used in --ais and in generated files
//   name       what the prompt shows
//   summary    what the AI is and gives; role assignment is computed in roles.js
//   facts      capability claims, billing and model family; null means UNVERIFIED
//   factNotes  provenance caveats attached to the named capability facts
//   bin        binary to look for on PATH, or null
//   minLevel   1 beginner, 2 intermediate, 3 advanced
//   install    { npm: pkg } for a global npm install command printed for you to run,
//              { script: url } for a vendor shell installer the installer only PRINTS, never runs,
//              { url } for a download page
//   auth       how you sign in, always the vendor's own flow, never a key typed into this tool
//   authStatus optional reliable read-only status command; unlisted CLIs get conditional sign-in guidance.
//              trust: 'positive-only' means only a reported success is
//              believed; every other outcome (a reported failure, a parse
//              error, a timeout, a missing binary) keeps the conditional step.
//              jsonField names the boolean field read from the command's JSON
//              stdout under positive-only trust; default 'loggedIn'.
//   rulesFile  the instructions file that agent reads from a project root, if any
//   projectMcp verified project-local MCP config: relative file and server-map key.
//              Absent means setup remains a manual step; never infer a global path.
//   builtAgainst  the vendor version this release's lane wiring and judges were
//              exercised against. ONE number per lane: the README compatibility
//              table is generated from it, and where install.npm exists the pin
//              IS this number, so "built against" and "pinned to" cannot drift
//              into two answers (#23). Lanes with a recorded fixture are
//              cross-checked against test/fixtures/manifest.json by the tests.
//   chatName   chat apps only: the app's name in a sentence, without the
//              "(chat only, no CLI)" catalog note, so the activation line stays
//              a sentence you can read once (#22)
//   chatSurface chat apps only: where the pasted block goes in that app
//   plans      optional known subscription plans: { id, name, headroom,
//              source, checked, tierModels }. A null tierModels leaves model selection
//              to the user's plan and agent configuration.

export const CATALOG_MODELS = { measuredAt: '2026-09-23', expiresAt: '2026-10-23', source: 'catalog compatibility snapshot; verify with the provider before use' };

export const LEVELS = [
  {
    id: 1,
    key: 'beginner',
    name: 'Beginner',
    tagline: 'one LLM or agent, routed well',
    gives: 'tiers, task classification, every protocol, one agent set up to follow them'
  },
  {
    id: 2,
    key: 'intermediate',
    name: 'Intermediate',
    tagline: 'several LLMs and agents, called through their CLIs',
    gives: 'everything in Beginner plus cli-run, a delegation matrix and multi-engine research triage'
  },
  {
    id: 3,
    key: 'advanced',
    name: 'Advanced',
    tagline: 'everything above, plus templates for your always-on Linux machine',
    gives: 'everything in Intermediate plus a gateway config, a scheduled review job, dispatch guidance and configurable privacy gates'
  }
];

export const AIS = [
  {
    id: 'claude-code',
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: 'Anthropic',
      kind: 'agent-cli',
      billing: 'subscription',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: true,
      cliRun: false,
      writesFiles: true,
      readOnlyMode: false,
      liveWeb: true, // Source: templates/agents/claude-code/live-researcher.md grants WebSearch and WebFetch.
      runsLocally: false,
      fanOut: null, // UNVERIFIED: no vendor doc states N children in one call.
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      // Verified at code.claude.com/docs/en/sub-agents (fetched 2026-09-10): "A
      // non-fork subagent's initial context contains: CLAUDE.md files: every
      // level of the CLAUDE.md hierarchy the main conversation loads ... The
      // built-in Explore and Plan agents skip this." No other lane in this
      // catalog has that documented, so the builder-by-default routing, the
      // route-gate hook and the inline-threshold note are gated on this field
      // and stay claude-code only.
      loadsProjectRules: true,
      agentDefinitions: '.claude/agents',
    },
    name: 'Claude Code (Anthropic)',
    vendor: 'Anthropic',
    bin: 'claude',
    summary: 'Anthropic\'s terminal coding agent; its subagents load the project rules file',
    minLevel: 1,
    install: { npm: '@anthropic-ai/claude-code', url: 'https://code.claude.com/docs/en/setup', pin: '2.1.226' },
    builtAgainst: '2.1.226',
    auth: 'run `claude` once and sign in with your Anthropic account',
    // Positive-only (Q1): an author-machine probe of a working, authenticated
    // session (2026-09-27) still returned {"loggedIn":false} with exit 1, so a
    // reported failure is not trusted; only loggedIn:true skips the step.
    authStatus: { args: ['auth', 'status'], reliable: true, trust: 'positive-only', jsonField: 'loggedIn', checked: '2026-09-27', source: 'author-machine probe: `claude auth status` (default JSON) returned {"loggedIn":false}, exit 1, inside a working authenticated session' },
    rulesFile: 'CLAUDE.md',
    // Project scope documented in templates/tools/context7/CONTEXT7.md.
    projectMcp: { file: '.mcp.json', key: 'mcpServers' },
    // tierModels is UNVERIFIED: no checked vendor source maps this plan to model aliases.
    plans: [
      { id: 'pro', name: 'Claude Pro', headroom: 'base', tierModels: null, source: 'https://claude.com/pricing', checked: '2026-09-12' },
      { id: 'max-5x', name: 'Claude Max 5x', headroom: 'high', tierModels: null, source: 'https://claude.com/pricing', checked: '2026-09-12' },
      { id: 'max-20x', name: 'Claude Max 20x', headroom: 'max', tierModels: null, source: 'https://claude.com/pricing', checked: '2026-09-12' }
    ]
  },
  {
    id: 'codex',
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: 'OpenAI',
      kind: 'agent-cli',
      billing: 'subscription',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: true,
      cliRun: true,
      writesFiles: true,
      readOnlyMode: true, // Source: --audit maps to a read-only filesystem sandbox (src/install.js).
      liveWeb: null, // UNVERIFIED: no checked capability source.
      runsLocally: false,
      fanOut: false,
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      loadsProjectRules: false,
      agentDefinitions: null, // UNVERIFIED: no project agent-definition path is cataloged.
    },
    name: 'Codex CLI (OpenAI, ChatGPT plan)',
    vendor: 'OpenAI',
    bin: 'codex',
    summary: 'OpenAI\'s terminal coding agent on a ChatGPT plan; `--audit` runs it in a read-only filesystem sandbox',
    minLevel: 1,
    install: { npm: '@openai/codex', url: 'https://developers.openai.com/codex/cli', pin: '0.153.4' },
    builtAgainst: '0.153.4',
    auth: '`codex login` (add `--device-auth` on a machine with no browser)',
    authStatus: { args: ['login', 'status'], reliable: true, checked: '2026-09-27', source: 'author-machine probe: Logged in using ChatGPT, exit 0' },
    rulesFile: 'AGENTS.md',
    // tierModels is UNVERIFIED: no checked vendor source maps this plan to model aliases.
    plans: [
      { id: 'plus', name: 'ChatGPT Plus', headroom: 'base', tierModels: null, source: 'https://learn.chatgpt.com/codex/pricing.md', checked: '2026-09-12' },
      { id: 'pro-5x', name: 'ChatGPT Pro 5x', headroom: 'high', tierModels: null, source: 'https://learn.chatgpt.com/codex/pricing.md', checked: '2026-09-12' },
      { id: 'pro-20x', name: 'ChatGPT Pro 20x', headroom: 'max', tierModels: null, source: 'https://learn.chatgpt.com/codex/pricing.md', checked: '2026-09-12' }
    ]
  },
  {
    id: 'agy',
    factNotes: { fanOut: 'UNVERIFIED against a vendor doc; inherited from the 0.1.x catalog.' },
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: 'Google',
      kind: 'agent-cli',
      billing: 'subscription',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: true,
      cliRun: true,
      writesFiles: true,
      readOnlyMode: false,
      liveWeb: null, // UNVERIFIED: no checked capability source.
      runsLocally: false,
      fanOut: true, // UNVERIFIED against a vendor doc; inherited from the 0.1.x catalog.
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      loadsProjectRules: null, // UNVERIFIED: project rules inheritance needs a vendor-doc check.
      agentDefinitions: '.agents/agents',
    },
    name: 'Antigravity CLI `agy` (Google AI plan)',
    vendor: 'Google',
    bin: 'agy',
    summary: 'Google\'s Antigravity terminal agent; one subagent call starts several children',
    minLevel: 1,
    install: { script: 'https://antigravity.google/cli/install.sh' },
    builtAgainst: '1.1.27',
    auth: 'run `agy`; the first run opens a device-code sign-in with your Google account',
    rulesFile: 'GEMINI.md',
    // tierModels is UNVERIFIED: no checked vendor source maps this plan to model aliases.
    plans: [
      { id: 'ai-pro', name: 'Google AI Pro', headroom: 'base', tierModels: null, source: 'https://gemini.google/subscriptions/', checked: '2026-09-12' },
      { id: 'ultra-5x', name: 'Google AI Ultra 5x', headroom: 'high', tierModels: null, source: 'https://gemini.google/subscriptions/', checked: '2026-09-12' },
      { id: 'ultra-20x', name: 'Google AI Ultra 20x', headroom: 'max', tierModels: null, source: 'https://gemini.google/subscriptions/', checked: '2026-09-12' }
    ],
    note: 'Gemini CLI was retired by Google in June 2026. agy is the successor. Do not install `gemini`.'
  },
  {
    id: 'grok',
    factNotes: { liveWeb: 'UNVERIFIED against a vendor doc; inherited from the 0.1.x catalog.' },
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: 'xAI',
      kind: 'agent-cli',
      billing: 'subscription',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: true,
      cliRun: true,
      writesFiles: true,
      readOnlyMode: false,
      liveWeb: true, // UNVERIFIED against a vendor doc; inherited first-party X and web search tools.
      runsLocally: false,
      fanOut: false,
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      loadsProjectRules: false,
      agentDefinitions: null, // UNVERIFIED: no project agent-definition path is cataloged.
    },
    name: 'Grok CLI (xAI, X Premium)',
    vendor: 'xAI',
    bin: 'grok',
    summary: 'xAI\'s terminal agent with first-party X and web search tools; searches are covered by the subscription rather than billed per call',
    minLevel: 1,
    install: { script: 'https://x.ai/cli/install.sh' },
    builtAgainst: '1.0.5',
    auth: '`grok login` (add `--device-auth` on a headless machine)',
    rulesFile: null,
    // tierModels is UNVERIFIED: no checked vendor source maps this plan to model aliases.
    plans: [
      { id: 'supergrok', name: 'SuperGrok', headroom: 'base', tierModels: null, source: 'https://x.ai/news/grok-build-cli', checked: '2026-09-12' },
      { id: 'supergrok-plus', name: 'SuperGrok Plus', headroom: 'high', tierModels: null, source: 'https://x.ai/pricing', checked: '2026-09-12' },
      { id: 'x-premium-plus', name: 'X Premium Plus', headroom: 'base', tierModels: null, source: 'https://x.ai/news/grok-build-cli', checked: '2026-09-12' }
    ]
  },
  {
    id: 'hermes',
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: null, // UNVERIFIED: the configured provider or model determines the family.
      kind: 'agent-cli',
      billing: 'free',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: true,
      cliRun: true,
      writesFiles: true,
      readOnlyMode: false,
      liveWeb: null, // UNVERIFIED: no checked capability source.
      runsLocally: false,
      fanOut: false,
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      loadsProjectRules: false,
      agentDefinitions: null, // UNVERIFIED: no project agent-definition path is cataloged.
    },
    name: 'Hermes Agent (Nous Research)',
    vendor: 'Nous Research',
    bin: 'hermes',
    summary: 'A free terminal agent that chains whichever providers you authenticate',
    minLevel: 2,
    install: { url: 'https://github.com/NousResearch/hermes-agent' },
    builtAgainst: '0.20.0',
    auth: '`hermes auth add <provider>` per provider; its own fallback chain handles outages',
    rulesFile: null,
  },
  {
    id: 'qwen',
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: null, // UNVERIFIED: the configured provider or model determines the family.
      kind: 'agent-cli',
      billing: 'pay-per-token',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: true,
      cliRun: true,
      writesFiles: true,
      readOnlyMode: false,
      liveWeb: null, // UNVERIFIED: no checked capability source.
      runsLocally: false,
      fanOut: false,
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      loadsProjectRules: false,
      agentDefinitions: null, // UNVERIFIED: no project agent-definition path is cataloged.
    },
    name: 'Qwen Code CLI (Alibaba, provider-agnostic)',
    vendor: 'Alibaba',
    bin: 'qwen',
    summary: 'A provider-agnostic terminal agent; you supply the API key, so its rate is your provider\'s rate',
    minLevel: 2,
    install: { npm: '@qwen-code/qwen-code', url: 'https://qwenlm.github.io/qwen-code-docs/en/users/overview/', pin: '0.22.3' },
    builtAgainst: '0.22.3',
    auth: 'run `qwen` and use `/auth` to configure your provider',
    rulesFile: 'QWEN.md',
    note: 'Its own success flags lie on API failures. cli-run checks the two honest signals for you.'
  },
  {
    id: 'ollama',
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: null, // UNVERIFIED: the configured provider or model determines the family.
      kind: 'local-runtime',
      billing: 'local',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: true,
      cliRun: false,
      writesFiles: false,
      readOnlyMode: false,
      liveWeb: false,
      runsLocally: true,
      fanOut: false,
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      loadsProjectRules: false,
      agentDefinitions: null, // UNVERIFIED: no project agent-definition path is cataloged.
    },
    gatewayModel: 'ollama/llama3.2:3b',
    modelsChecked: CATALOG_MODELS.measuredAt,
    modelsExpires: CATALOG_MODELS.expiresAt,
    name: 'Ollama (local models)',
    vendor: 'Ollama',
    bin: 'ollama',
    summary: 'A local model runtime; work sent here stays on the machine',
    minLevel: 2,
    install: { url: 'https://ollama.com/download', brew: 'ollama' },
    builtAgainst: '0.33.3',
    auth: 'none',
    rulesFile: null,
  },
  {
    id: 'claude-app',
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: 'Anthropic',
      kind: 'chat',
      billing: 'subscription',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: false,
      cliRun: false,
      writesFiles: false,
      readOnlyMode: false,
      liveWeb: null, // UNVERIFIED: no checked capability source.
      runsLocally: false,
      fanOut: false,
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      loadsProjectRules: false,
      agentDefinitions: null, // UNVERIFIED: no project agent-definition path is cataloged.
    },
    name: 'Claude app or claude.ai (chat only, no CLI)',
    vendor: 'Anthropic',
    bin: null,
    summary: 'A chat app; it reads pasted instructions, not files',
    minLevel: 1,
    install: { url: 'https://claude.ai' },
    auth: 'sign in',
    chatName: 'the Claude app or claude.ai',
    chatSurface: 'custom instructions or a Project',
    rulesFile: null,
  },
  {
    id: 'chatgpt-app',
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: 'OpenAI',
      kind: 'chat',
      billing: 'subscription',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: false,
      cliRun: false,
      writesFiles: false,
      readOnlyMode: false,
      liveWeb: null, // UNVERIFIED: no checked capability source.
      runsLocally: false,
      fanOut: false,
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      loadsProjectRules: false,
      agentDefinitions: null, // UNVERIFIED: no project agent-definition path is cataloged.
    },
    name: 'ChatGPT (chat only, no CLI)',
    vendor: 'OpenAI',
    bin: null,
    summary: 'A chat app; it reads pasted instructions, not files',
    minLevel: 1,
    install: { url: 'https://chatgpt.com' },
    auth: 'sign in',
    chatName: 'ChatGPT',
    chatSurface: 'custom instructions or a Project',
    rulesFile: null,
  },
  {
    id: 'gemini-app',
    facts: { // Capability snapshot checked 2026-09-27; unknown facts stay null.
      modelFamily: 'Google',
      kind: 'chat',
      billing: 'subscription',
      pricing: null, // UNVERIFIED: check your provider's current rate.
      headless: false,
      cliRun: false,
      writesFiles: false,
      readOnlyMode: false,
      liveWeb: null, // UNVERIFIED: no checked capability source.
      runsLocally: false,
      fanOut: false,
      contextWindow: null, // UNVERIFIED: context capacity depends on the selected model.
      loadsProjectRules: false,
      agentDefinitions: null, // UNVERIFIED: no project agent-definition path is cataloged.
    },
    name: 'Gemini app (chat only, no CLI)',
    vendor: 'Google',
    bin: null,
    summary: 'A chat app; it reads pasted instructions, not files',
    minLevel: 1,
    install: { url: 'https://gemini.google.com' },
    auth: 'sign in',
    chatName: 'the Gemini app',
    chatSurface: 'saved instructions or a Gem',
    rulesFile: null,
  }
];

// Companion tools: not AIs, but things the AIs call. Asked about separately.
export const TOOLS = [
  {
    id: 'codecalc',
    name: 'codecalc (calculator, code runner, logic checker for your agent)',
    repo: 'https://github.com/The-40-Thieves/codecalc',
    role: 'exact arithmetic, code execution in 31 languages, SMT logic checks, complexity and equivalence proofs; offline, no key, no telemetry',
    get install() { return `uvx 'codecalc[full]==${this.pin}' setup --write`; },
    pin: '0.5.0',
    mcpSnippets: { 'claude-code': 'mcp/mcpServers.json', codex: 'mcp/codex.config.toml', agy: 'mcp/agy.mcp_config.json', qwen: 'mcp/mcpServers.json' },
    requires: 'uv (https://docs.astral.sh/uv/) and Python 3.10+',
    autoClients: ['Claude Code', 'Claude Desktop', 'Cursor', 'VS Code', 'Zed'],
    recommended: false,
    optionalNote: 'Optional. Needs Python 3.10+ and uv. Everything else runs offline.'
  },
  {
    id: 'obsidian-tc',
    name: 'obsidian-tc (governed memory: an agent-ready MCP server over an Obsidian vault)',
    repo: 'https://github.com/The-40-Thieves/obsidian-tc',
    role: 'durable memory and record for your agents: hybrid retrieval (BM25 + dense + link graph), backlinks, compare-and-swap writes with a confirmation gate, folder ACLs, a poison scan on inferred writes; 163 tools, local by default',
    get install() { return `npm install -g obsidian-tc@${this.pin} && obsidian-tc /path/to/your/vault`; },
    pin: '1.26.0',
    mcpSnippets: { 'claude-code': 'mcp/obsidian-tc.mcpServers.json', codex: 'mcp/obsidian-tc.codex.config.toml', agy: 'mcp/obsidian-tc.agy.mcp_config.json', qwen: 'mcp/obsidian-tc.mcpServers.json' },
    requires: 'an Obsidian vault folder (the Obsidian app itself is only needed for live plugin bridges); Node 24+ or Bun 1.1+ (stricter than this installer); Ollama with `nomic-embed-text` for local embeddings, or a cloud embeddings key; the Local REST API plugin only for bridge tools',
    autoClients: ['Cursor', 'VS Code'],
    recommended: false,
    optionalNote: 'Optional and heavier than codecalc. Skip it if you do not keep notes in Obsidian. AGPL-3.0.'
  },
  {
    id: 'context7',
    name: 'Context7 (Upstash: version-aware docs for the libraries your agent calls)',
    repo: 'https://github.com/upstash/context7',
    role: 'up-to-date, version-specific documentation and code examples for libraries, SDKs, APIs and CLIs, pulled into the prompt; tells the agent what the code is SUPPOSED to do. Paired with codecalc, which runs the code and proves what it actually does: docs never stand as proof, and where they disagree the run wins',
    get install() { return `npx -y @upstash/context7-mcp@${this.pin}`; },
    pin: '4.1.1',
    mcpSnippets: { 'claude-code': 'mcp/context7.claude-code.mcp.json', codex: 'mcp/context7.codex.config.toml', agy: 'mcp/context7.agy.mcp_config.json', qwen: 'mcp/context7.qwen.settings.json' },
    requires: 'Node.js 18+ for the local server or the ctx7 CLI; a free CONTEXT7_API_KEY is optional, for higher rate limits (it works anonymously at the base rate)',
    autoClients: [], // The pinned MCP server does not register itself; merge its snippets.
    recommended: false,
    optionalNote: 'Optional, and from a different maintainer than codecalc and obsidian-tc (Upstash, not The-40-Thieves). Needs a network call even at the anonymous rate; skip it offline. MIT.'
  }
];
export const toolById = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

// Metered API providers for the level 3 gateway. Separate from the AI list on
// purpose: a Claude Code subscription is not an Anthropic API key, and a user
// can truthfully have one without the other. Only NAMES of variables live here.
// Model names are a dated compatibility snapshot, refreshed against vendor catalogs.

export const PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic API', envName: 'ANTHROPIC_API_KEY', modelsChecked: CATALOG_MODELS.measuredAt, modelsExpires: CATALOG_MODELS.expiresAt, lanes: [['standard', 'anthropic/claude-sonnet-5'], ['deep', 'anthropic/claude-opus-5']] },
  { id: 'openai', name: 'OpenAI API', envName: 'OPENAI_API_KEY', modelsChecked: CATALOG_MODELS.measuredAt, modelsExpires: CATALOG_MODELS.expiresAt, lanes: [['second-opinion', 'openai/gpt-5.6-terra']] },
  { id: 'google', name: 'Google Gemini API', envName: 'GEMINI_API_KEY', modelsChecked: CATALOG_MODELS.measuredAt, modelsExpires: CATALOG_MODELS.expiresAt, lanes: [['long-context', 'gemini/gemini-3.1-pro']] },
  { id: 'xai', name: 'xAI API', envName: 'XAI_API_KEY', modelsChecked: CATALOG_MODELS.measuredAt, modelsExpires: CATALOG_MODELS.expiresAt, lanes: [['live-fast', 'xai/grok-4.1-fast']] },
  { id: 'openrouter', name: 'OpenRouter (many cheap models, one key)', envName: 'OPENROUTER_API_KEY', modelsChecked: CATALOG_MODELS.measuredAt, modelsExpires: CATALOG_MODELS.expiresAt, lanes: [['bulk-cheap', 'openrouter/qwen/qwen3.7-flash']] }
];
export const providerById = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

// Container image pins for the level 3 templates. Bump deliberately; a
// reviewed box should not change underneath the user on a restart.
export const IMAGES = {
  litellm: 'ghcr.io/berriai/litellm:v1.99.1',
  ollama: 'ollama/ollama:0.33.3'
};

export const byId = Object.fromEntries(AIS.map((a) => [a.id, a]));

// The ONE place an npm install spec is built. The printed
// fallback command, the install table and the box script all call this, so
// two users on two paths get the same version.
export function npmSpec(a) {
  if (!a.install || !a.install.npm) return null;
  return a.install.npm + (a.install.pin ? '@' + a.install.pin : '');
}

export function aisForLevel(level) {
  return AIS.filter((a) => a.minLevel <= level);
}

export function agentCandidates(selected) {
  // Which of the selected AIs can be the single main agent at level 1.
  return selected.filter((a) => a.facts.kind === 'agent-cli' || a.facts.kind === 'chat');
}


// Preserve provenance when the compact summary is rendered away from facts.
export function summaryWithEvidence(ai) {
  const notes = Object.entries(ai.factNotes || {}).map(([fact, note]) => `${fact}: ${note}`);
  return notes.length ? `${ai.summary.replace(/\.$/, '')}. ${notes.join(' ')}` : ai.summary;
}
