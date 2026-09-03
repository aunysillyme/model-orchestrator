// The single source the installer, the docs and the generated files all read.
// Add an AI here and every level picks it up. Nothing else lists AIs.
//
// Fields
//   id         stable key used in --ais and in generated files
//   name       what the prompt shows
//   kind       'agent-cli' (a terminal agent), 'chat' (a chat app, no CLI), 'local' (a local model runtime)
//   bin        binary to look for on PATH, or null
//   access     'subscription' ($0 per call on a plan you already pay for), 'metered' (per token), 'free', 'local'
//   lane       'A' = subscription CLI, 'B' = metered API, 'local' = stays on the machine
//   role       the one job it wins at in a multi-AI stack
//   minLevel   1 beginner, 2 intermediate, 3 advanced
//   install    { npm: pkg } for a global npm install the installer may run after you say yes,
//              { script: url } for a vendor shell installer the installer only PRINTS, never runs,
//              { url } for a download page
//   auth       how you sign in, always the vendor's own flow, never a key typed into this tool
//   rulesFile  the instructions file that agent reads from a project root, if any
//   agentsDir  where that agent keeps project-level subagent definitions, if any
//   cliRun     true when bin/cli-run.js has a judge for this lane

export const LEVELS = [
  {
    id: 1,
    key: 'beginner',
    name: 'Beginner',
    tagline: 'one LLM or agent, routed well',
    gives: 'tiers, task classification, the four protocols, one agent set up to follow them'
  },
  {
    id: 2,
    key: 'intermediate',
    name: 'Intermediate',
    tagline: 'several LLMs and agents, called through their CLIs',
    gives: 'everything in Beginner plus cli-run, a delegation matrix, task bundles and three-engine research triage'
  },
  {
    id: 3,
    key: 'advanced',
    name: 'Advanced',
    tagline: 'everything above, plus a virtual machine that runs it unattended',
    gives: 'everything in Intermediate plus a gateway config, scheduled jobs, a dispatch layer and privacy gates for a box'
  }
];

export const AIS = [
  {
    id: 'claude-code',
    name: 'Claude Code (Anthropic)',
    vendor: 'Anthropic',
    kind: 'agent-cli',
    bin: 'claude',
    access: 'subscription',
    lane: 'A',
    role: 'orchestrator: routes, maps, builds, verifies, records',
    minLevel: 1,
    install: { npm: '@anthropic-ai/claude-code' },
    auth: 'run `claude` once and sign in with your Anthropic account',
    rulesFile: 'CLAUDE.md',
    agentsDir: '.claude/agents',
    cliRun: false,
    models: { deep: 'opus', standard: 'sonnet', fast: 'haiku' }
  },
  {
    id: 'codex',
    name: 'Codex CLI (OpenAI, ChatGPT plan)',
    vendor: 'OpenAI',
    kind: 'agent-cli',
    bin: 'codex',
    access: 'subscription',
    lane: 'A',
    role: 'second coder and adversarial auditor (a different model family reading your diff)',
    minLevel: 1,
    install: { npm: '@openai/codex' },
    auth: '`codex login` (add `--device-auth` on a machine with no browser)',
    rulesFile: 'AGENTS.md',
    agentsDir: null,
    cliRun: true
  },
  {
    id: 'agy',
    name: 'Antigravity CLI `agy` (Google AI plan)',
    vendor: 'Google',
    kind: 'agent-cli',
    bin: 'agy',
    access: 'subscription',
    lane: 'A',
    role: 'deep research sweeps and concurrent fan-out (its subagent call takes an array)',
    minLevel: 1,
    install: { script: 'https://antigravity.google/cli/install.sh' },
    auth: 'first run opens a device-code sign-in with your Google account',
    rulesFile: 'GEMINI.md',
    agentsDir: '.agents/agents',
    cliRun: true,
    note: 'Gemini CLI was retired by Google in June 2026. agy is the successor. Do not install `gemini`.'
  },
  {
    id: 'grok',
    name: 'Grok CLI (xAI, X Premium)',
    vendor: 'xAI',
    kind: 'agent-cli',
    bin: 'grok',
    access: 'subscription',
    lane: 'A',
    role: 'X and live web reads at no per-call cost (its search tools bill on the API, not on the CLI)',
    minLevel: 1,
    install: { script: 'https://x.ai/cli/install.sh' },
    auth: '`grok login` (add `--device-auth` on a headless machine)',
    rulesFile: null,
    agentsDir: null,
    cliRun: true
  },
  {
    id: 'hermes',
    name: 'Hermes Agent (Nous Research)',
    vendor: 'Nous Research',
    kind: 'agent-cli',
    bin: 'hermes',
    access: 'free',
    lane: 'A',
    role: 'the free tier: rough drafts, first-pass summaries, cheap divergent reads, cron jobs on a box',
    minLevel: 2,
    install: { url: 'https://github.com/NousResearch/hermes-agent' },
    auth: '`hermes auth add <provider>` per provider; its own fallback chain handles outages',
    rulesFile: null,
    agentsDir: null,
    cliRun: true
  },
  {
    id: 'qwen',
    name: 'Qwen Code CLI (Alibaba, provider-agnostic)',
    vendor: 'Alibaba',
    kind: 'agent-cli',
    bin: 'qwen',
    access: 'metered',
    lane: 'B',
    role: 'cheapest metered bulk lane for structured output; never for anything that cites a line, a number or a source',
    minLevel: 2,
    install: { npm: '@qwen-code/qwen-code' },
    auth: 'a provider key in an environment variable, named (not stored) in ~/.qwen/settings.json. There is no free Qwen cloud tier any more.',
    rulesFile: 'QWEN.md',
    agentsDir: null,
    cliRun: true,
    note: 'Its own success flags lie on API failures. cli-run checks the two honest signals for you.'
  },
  {
    id: 'ollama',
    name: 'Ollama (local models)',
    vendor: 'Ollama',
    kind: 'local',
    bin: 'ollama',
    access: 'local',
    lane: 'local',
    role: 'the privacy lane: anything that must never leave the machine. Not a cost lane.',
    minLevel: 2,
    install: { url: 'https://ollama.com/download', brew: 'ollama' },
    auth: 'none',
    rulesFile: null,
    agentsDir: null,
    cliRun: false
  },
  {
    id: 'claude-app',
    name: 'Claude app or claude.ai (chat only, no CLI)',
    vendor: 'Anthropic',
    kind: 'chat',
    bin: null,
    access: 'subscription',
    lane: 'chat',
    role: 'single-agent use through Projects and custom instructions',
    minLevel: 1,
    install: { url: 'https://claude.ai' },
    auth: 'sign in',
    rulesFile: null,
    agentsDir: null,
    cliRun: false
  },
  {
    id: 'chatgpt-app',
    name: 'ChatGPT (chat only, no CLI)',
    vendor: 'OpenAI',
    kind: 'chat',
    bin: null,
    access: 'subscription',
    lane: 'chat',
    role: 'single-agent use through custom instructions and Projects',
    minLevel: 1,
    install: { url: 'https://chatgpt.com' },
    auth: 'sign in',
    rulesFile: null,
    agentsDir: null,
    cliRun: false
  },
  {
    id: 'gemini-app',
    name: 'Gemini app (chat only, no CLI)',
    vendor: 'Google',
    kind: 'chat',
    bin: null,
    access: 'subscription',
    lane: 'chat',
    role: 'single-agent use through Gems and saved instructions',
    minLevel: 1,
    install: { url: 'https://gemini.google.com' },
    auth: 'sign in',
    rulesFile: null,
    agentsDir: null,
    cliRun: false
  }
];

// Companion tools: not AIs, but things the AIs call. Asked about separately.
export const TOOLS = [
  {
    id: 'codecalc',
    name: 'codecalc (calculator, code runner, logic checker for your agent)',
    repo: 'https://github.com/The-40-Thieves/codecalc',
    role: 'exact arithmetic, code execution in 31 languages, SMT logic checks, complexity and equivalence proofs; offline, no key, no telemetry',
    install: "uvx 'codecalc[full]' setup --write",
    requires: 'uv (https://docs.astral.sh/uv/) and Python 3.10+',
    autoClients: ['Claude Code', 'Claude Desktop', 'Cursor', 'VS Code', 'Zed'],
    recommended: true
  }
];
export const toolById = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

export const byId = Object.fromEntries(AIS.map((a) => [a.id, a]));

export function aisForLevel(level) {
  return AIS.filter((a) => a.minLevel <= level);
}

export function agentCandidates(selected) {
  // Which of the selected AIs can be the single primary agent at level 1.
  return selected.filter((a) => a.kind === 'agent-cli' || a.kind === 'chat');
}
