import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync, readdirSync, statSync, lstatSync, unlinkSync, realpathSync } from 'node:fs';
import { join, dirname, relative, resolve, sep, parse as parsePath, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './render.js';
import { createHash } from 'node:crypto';
import { AIS, LEVELS, TOOLS, PROVIDERS, IMAGES, byId, toolById, providerById, npmSpec } from './catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const GENERATOR_VERSION = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).version;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const TEMPLATES = join(HERE, '..', 'templates');
export const CLI_RUN_SRC = join(HERE, '..', 'bin', 'cli-run.mjs');

function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push({ abs: p, rel: relative(base, p) });
  }
  return out;
}

// A README.md at the ROOT of a template tier (beginner/, intermediate/,
// advanced/, agents/*) documents this repo's folder and is not installed.
// common/README.md is the exception: it is the user's start-here file.
// Deeper README.md files (protocols/, vm/) are installed, they index the
// folder they sit in.
function installable(sub, rel) {
  if (rel !== 'README.md') return true;
  return sub === 'common';
}

function table(rows, header) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

export function lanesTable(selected) {
  const rows = selected.map((a) => [
    a.name,
    a.lane === 'A' ? 'A (subscription, $0 per call)' : a.lane === 'B' ? 'B (metered)' : a.lane === 'local' ? 'local' : 'chat',
    a.role,
    a.cliRun ? '`cli-run ' + a.id + '`' : a.bin ? '`' + a.bin + '`' : 'the app'
  ]);
  return table(rows, ['AI', 'Lane', 'Wins at', 'Call it with']);
}

export function installTable(selected) {
  const rows = selected.map((a) => {
    const how = a.install.npm
      ? '`npm install -g ' + npmSpec(a) + '` (pinned; check for newer)'
      : a.install.script
        ? 'vendor script: ' + a.install.script
        : a.install.url;
    return [a.name, how, a.auth];
  });
  return table(rows, ['AI', 'Install', 'Sign in']);
}

// Gateway lanes come from the metered API keys the user said they HOLD, never
// from which subscription CLIs they selected: those are different entitlements.
// Only variable NAMES appear here. The installer never writes a value.
export function gatewayModels(selected, apis = []) {
  const lines = [];
  if (selected.some((a) => a.id === 'ollama')) {
    lines.push('  - model_name: local-small', '    litellm_params:', '      model: ollama/llama3.2:3b', '      api_base: http://ollama:11434');
  }
  for (const prov of apis) {
    for (const [alias, model] of prov.lanes) {
      lines.push(`  - model_name: ${alias}`, '    litellm_params:', `      model: ${model}`, `      api_key: os.environ/${prov.envName}`);
    }
  }
  if (!lines.length) lines.push('  # No provider key and no local runtime selected. Add one lane per provider here; keys stay in the environment.');
  return lines.join('\n');
}

export function envNames(selected, apis = []) {
  const names = new Set(apis.map((prov) => prov.envName));
  names.add('GATEWAY_MASTER_KEY');
  return [...names];
}

export function scriptInstallers(selected) {
  const lines = [];
  for (const a of selected) {
    if (a.install.script) lines.push(`say "  ${a.name}:  curl -fsSL ${a.install.script} -o /tmp/${a.id}-install.sh && less /tmp/${a.id}-install.sh && bash /tmp/${a.id}-install.sh"`);
    else if (a.install.url && a.kind !== 'chat') lines.push(`say "  ${a.name}:  ${a.install.url}"`);
  }
  return lines.length ? lines.join('\n') : 'say "  none"';
}

export function composeEnv(selected, apis = []) {
  // Pass-through of NAMES only. Compose substitutes each from the host environment.
  const rows = envNames(selected, apis)
    .filter((n) => n !== 'GATEWAY_MASTER_KEY')
    .map((n) => `      - ${n}=\${${n}:-}`);
  return rows.length ? rows.join('\n') : '      # no metered provider keys selected';
}

export function composeOllama(selected) {
  if (!selected.some((a) => a.id === 'ollama')) return '  # no local runtime selected';
  return [
    '  ollama:',
    `    image: ${IMAGES.ollama}`,
    '    container_name: ollama',
    '    restart: unless-stopped',
    '    ports:',
    '      - "127.0.0.1:11434:11434"',
    '    volumes:',
    '      - ollama:/root/.ollama',
    '',
    'volumes:',
    '  ollama: {}'
  ].join('\n');
}

// --dir is rendered into a bash script and a systemd unit. It is data there,
// never syntax: single-quoted for bash (the only character that needs care
// inside single quotes is the quote itself), and %-escaped for systemd, whose
// specifiers begin with %. Control characters and newlines are refused outright
// because no quoting convention survives them in both grammars.
export function shellQuote(v) {
  return "'" + String(v).replace(/'/g, "'\\''") + "'";
}
export function systemdEscape(v) {
  return String(v).replace(/%/g, '%%');
}
export function dirProblems(dir) {
  const abs = resolve(dir);
  const problems = [];
  if (/[\x00-\x1f\x7f]/.test(abs)) problems.push('the target path contains control characters or a newline');
  if (abs === parsePath(abs).root) problems.push('the target is the filesystem root; pick a folder');
  return problems;
}

// The lane the generated weekly audit calls: the first ENABLED cli-run lane
// in this preference order. None enabled means the job refuses at run time
// (exit 13) instead of calling a lane the installer disabled.
export const AUDIT_LANE_ORDER = ['hermes', 'qwen', 'codex', 'agy', 'grok'];
export function auditLane(selected) {
  const enabled = new Set(selected.filter((a) => a.cliRun).map((a) => a.id));
  return AUDIT_LANE_ORDER.find((l) => enabled.has(l)) || null;
}

// Everything ROUTING.md and RESEARCH_TRIAGE.md say about lanes is rendered
// from the lanes the user actually has. A generated manual must never
// recommend a command its own lanes.json disables.
export function laneVars(selected) {
  const has = (id) => selected.some((a) => a.id === id);
  const enabled = selected.filter((a) => a.cliRun).map((a) => a.id);
  const cr = (id) => '`cli-run ' + id + '`';
  const step0 = [];
  if (has('hermes')) step0.push(`${cr('hermes')} (the free tier) for rough drafts and divergent reads`);
  if (has('qwen')) step0.push(`${cr('qwen')} (the cheapest metered lane) for structured bulk, never for anything citing a line, number or source`);
  if (has('grok')) step0.push(`${cr('grok')} for X and live web reads at $0`);
  if (has('codex')) step0.push(`${cr('codex --audit')} for a second-opinion read by a second model family`);
  if (has('agy')) step0.push(`${cr('agy')} for research sweeps and concurrent fan-out`);
  const stage1 = [];
  if (has('codex')) stage1.push(`${cr('codex')} for a second-opinion critique of the map`);
  if (has('grok')) stage1.push(`${cr('grok')} to verify current API behaviour instead of trusting recall`);
  if (has('hermes')) stage1.push(`${cr('hermes')} for a divergent read`);
  if (has('agy')) stage1.push(`${cr('agy')} for a wide sweep of prior art`);
  const examples = [];
  examples.push(has('grok') ? `| "What is trending on X today" | ${cr('grok')} |` : '| "What is trending on X today" | live-researcher (standard tier with web tools) |');
  examples.push(has('codex') ? `| "Audit this auth diff" | ${cr('codex --audit')} |` : '| "Audit this auth diff" | code-reviewer at deep tier, in a fresh context told to challenge |');
  examples.push(has('qwen') ? `| "Classify these 200 items" | bulk-worker, or ${cr('qwen')} if the items may leave the machine |` : '| "Classify these 200 items" | bulk-worker |');
  examples.push(enabled.length >= 2 ? '| "Research this topic properly" | several engines in parallel, see `RESEARCH_TRIAGE.md` |' : '| "Research this topic properly" | deep tier plans, standard tier sweeps, a fresh context challenges; see `RESEARCH_TRIAGE.md` |');
  const roles = [];
  if (has('agy')) roles.push('| Web sweep | `cli-run agy` | widest landscape pass |');
  if (has('codex')) roles.push('| Second-opinion read | `cli-run codex --audit` | question the premise, hunt for what the others would get wrong |');
  if (has('grok')) roles.push('| Live data | `cli-run grok` | dated primary sources, real-time reads |');
  if (has('hermes')) roles.push('| Cheap divergent read | `cli-run hermes` | another opinion at $0 |');
  if (has('qwen')) roles.push('| Structured extraction | `cli-run qwen` | pull the facts into a table; never trust its citations without a check |');
  roles.push('| Triage + the durable record | the orchestrator | opens primary sources, marks every claim, writes the artifact |');
  const run = [];
  if (has('agy')) run.push('node bin/cli-run.mjs agy   --brief "$BRIEF" --timeout 900 > research/out-agy.md');
  if (has('codex')) run.push('node bin/cli-run.mjs codex --audit --brief "$BRIEF" --timeout 900 > research/out-codex.md');
  if (has('grok')) run.push('node bin/cli-run.mjs grok  --brief "$BRIEF" --timeout 900 > research/out-grok.md');
  if (has('hermes')) run.push('node bin/cli-run.mjs hermes --brief "$BRIEF" --timeout 900 > research/out-hermes.md');
  if (has('qwen')) run.push('node bin/cli-run.mjs qwen  --brief "$BRIEF" --timeout 900 > research/out-qwen.md');
  return {
    LANE_STEP0: step0.length ? step0.map((l) => '   - ' + l).join('\n') : '   - none selected yet: every task stays on your primary agent\'s tiers until you add a lane (re-run the installer with more AIs)',
    STAGE1_LANES: stage1.length ? '; ' + stage1.join(', ') : '',
    ATTACK_LANE: has('codex') ? '`cli-run codex --audit` (a second model family in a read-only sandbox)' : 'code-reviewer at deep tier, in a fresh context told to challenge and allowed to answer CLEAN',
    LIVE_LANE: has('grok') ? '`cli-run grok` first ($0), then' : '',
    BULK_LANE: has('qwen') ? ', or `cli-run qwen` if the data may leave your machine' : has('hermes') ? ', or `cli-run hermes` for a free rough pass' : '',
    LANE_EXAMPLES: examples.join('\n'),
    RESEARCH_ROLES: roles.join('\n'),
    RESEARCH_RUN: run.length ? run.join('\n') : '# no cli-run lane selected: run the sweep on your primary agent, then a fresh second-opinion turn (protocols/deep-research.md, level 1 shape)',
    RESEARCH_ENGINES: String(run.length)
  };
}

// Only claude-code has a verified sub-agents doc quote saying its subagents
// load the project's CLAUDE.md hierarchy (code.claude.com/docs/en/sub-agents,
// see the comment on the catalog entry). Every delegate-by-default surface below
// (builder-by-default wording, the route-gate hook, the inline-threshold
// note) is gated on this so a primary with no verified premise keeps the
// original, more conservative wording.
export function subagentsLoadRules(primary) {
  return !!(primary && primary.subagentsLoadRules);
}

// Canonical agent order, tier-first. Used to render a stable, non-hardcoded
// "available as" list for the claude-code snippet from the files actually
// shipped, so a future agent addition or removal cannot leave the sentence
// stale the way the finding-verifier omission did.
const AGENT_ORDER = ['deep-planner', 'builder', 'code-reviewer', 'finding-verifier', 'live-researcher', 'bulk-worker', 'done-verifier', 'reader'];
export function claudeAgentIds() {
  const dir = join(TEMPLATES, 'agents', 'claude-code');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.replace(/\.md$/, ''));
  const set = new Set(files);
  const ordered = AGENT_ORDER.filter((id) => set.has(id));
  const extra = files.filter((id) => !AGENT_ORDER.includes(id)).sort();
  return [...ordered, ...extra];
}

// The compact "pick the lane before acting" table, rendered from the AIs the
// user actually selected and the agents actually installed, never a second
// hand-typed copy of ROUTING.md's decision tree.
export function routeGateTable(selected) {
  const rows = [
    ['Bulk or mechanical, many similar items', 'bulk-worker'],
    ['Needs live data', 'live-researcher'],
    ['Review without changing', 'code-reviewer'],
    ['Findings from a review or a scanner', 'finding-verifier, before any repair'],
    ['Reading or digesting many files or notes', 'reader'],
    ['Checking a tracker item against its stated done-signal', 'done-verifier'],
    ['Ambiguous, architectural, expensive to get wrong', 'deep-planner'],
    ['Everything else that changes files', 'builder, by default']
  ];
  for (const a of selected.filter((x) => x.cliRun)) rows.push([a.role, '`cli-run ' + a.id + '`']);
  return table(rows, ['Task', 'Lane']);
}

// The marked block route-gate.mjs extracts at runtime. Installed only for
// claude-code so the hook always finds a block to read; other primaries get
// no hook and so get no block.
export function routeGateSection(selected) {
  return [
    '<!-- route-gate:start -->',
    '## Route gate: pick the lane before acting',
    '',
    'Injected on every turn by the `route-gate` hook, so this table is read at runtime rather than recalled from memory.',
    '',
    routeGateTable(selected),
    '',
    "Stay inline only when: (a) the brief would cost as much as the work itself, (b) the task needs this conversation's own context, (c) it is the human's decision or the final verification of delegated work (a delegate never verifies itself).",
    '',
    'Never: the built-in Explore or Plan agents for rule-bound work (they skip CLAUDE.md). general-purpose taking work a named agent already owns.',
    '',
    'End every reply with a hidden marker: `<!-- route: <lane> | <why, a few words> -->`. The route-metrics hook reads only the lane out of it, so routing coverage can be measured instead of assumed.',
    '<!-- route-gate:end -->'
  ].join('\n');
}

// ROUTING.md / ORCHESTRATOR.md decision-tree rule 5 and the "Who builds"
// section read differently for claude-code, because only claude-code has the
// verified premise that its subagents load CLAUDE.md. Every other primary
// keeps the original wording: the orchestrator builds the main line directly
// and a subagent or second CLI is assumed to hold none of these rules.
export function decisionRule5(primary) {
  return subagentsLoadRules(primary)
    ? `5. **Everything else that changes files** → builder executes by default. The orchestrator plans, briefs, verifies and talks to the human; it stays inline only when (a) the brief would cost as much as the work, (b) the task needs this conversation's own context, or (c) it is the human's decision, or the final verification of delegated work (a delegate never verifies itself). Never route rule-bound work to the built-in Explore or Plan agents: both skip CLAUDE.md. general-purpose should not take work a named agent already owns.`
    : `5. **Everything else that changes files** → the orchestrator builds it directly. Bounded sub-parts go to cheaper tiers; the main build is never handed off whole.`;
}
export function decisionRule5Beginner(primary) {
  return subagentsLoadRules(primary)
    ? `5. **Everything else that changes files or executes a known plan** → builder executes by default, at standard tier. The orchestrator plans, briefs, verifies and talks to you; it stays inline only when (a) the brief would cost as much as the work, (b) the task needs this conversation's own context, or (c) it is your decision, or the final verification of delegated work. Never route rule-bound work to the built-in Explore or Plan agents: both skip CLAUDE.md.`
    : `5. **Everything else that changes files or executes a known plan** → you build it directly, at standard tier. The main build is never handed off whole; bounded sub-parts (a bulk pass, a wide search, a long audit loop) can go to cheaper tiers.`;
}
export function whoBuildsSection(primary) {
  if (subagentsLoadRules(primary)) {
    return [
      '## Who builds',
      '',
      `**Builder executes by default.** A Claude Code subagent loads this project's CLAUDE.md hierarchy at start (verified: code.claude.com/docs/en/sub-agents), so it already carries the standing rules; the orchestrator's job is to plan, brief, verify and talk to the human, not to hold work a delegate can do. Stay inline only when: (a) the brief would cost as much as the work itself, (b) the task needs this conversation's own context, or (c) it is the human's decision to make, or the final verification of delegated work (a delegate never verifies its own output as final). Never route rule-bound work to the built-in Explore or Plan agents: both skip CLAUDE.md and the git status the router depends on. general-purpose should not take work a named agent already owns.`,
      '',
      `Delegate: the main build, background and long-running tasks, small tasks, scoping, verification, research, bounded sub-parts. Never delegate: the human's own decision, or the final sign-off on a delegate's work.`,
      '',
      `Every delegation carries \`TASK_BUNDLE.md\`. Its brief must restate this task's scope: a Claude Code subagent already has the standing rules, just not that.`
    ].join('\n');
  }
  return [
    '## Who builds',
    '',
    '**The orchestrator owns the main build.** It is the only surface that holds these rules: a subagent or a second CLI starts with none of them and cannot route. Handing the main build to one hands it to something the router cannot reach.',
    '',
    'Delegate: background and long-running tasks, small tasks, scoping, verification, research, bounded sub-parts. Never delegate: the main build, or any step that must carry a house rule (secrets handling, the loud-negative verification, the durable record).',
    '',
    'Every delegation carries `TASK_BUNDLE.md`. Its brief must restate every convention the delegate needs.'
  ].join('\n');
}
export function addEndpointRow(primary) {
  return subagentsLoadRules(primary)
    ? '| "Add an endpoint" | builder, briefed and verified by the orchestrator |'
    : '| "Add an endpoint" | the orchestrator builds it |';
}
export function inlineThresholdNote(primary) {
  return subagentsLoadRules(primary)
    ? '\n- **Measure your inline threshold once.** A subagent starts with your CLAUDE.md and tool definitions already loaded, so it has a fixed start-up cost before it does anything. Spawn one with a one-line task and read its token count. Work smaller than that stays inline.'
    : '';
}
export function delegateRulesNote(primary) {
  return subagentsLoadRules(primary)
    ? `Subagents, a fresh chat, a second window: a Claude Code subagent loads this project's CLAUDE.md hierarchy, so it holds the standing rules already, just not this task's scope; a second CLI or a fresh chat window may hold none of them.`
    : 'Subagents, a fresh chat, a second window: each one holds none of these rules.';
}

// Pre-release audit finding 3: the delegate-by-default gate reached the
// decision tree and "Who builds" but missed three other generated surfaces
// stating the same old premise (the orchestrator writes the main build
// itself; a delegate inherits none of the session's rules). These three
// close that gap the same way: gated on subagentsLoadRules(primary), every
// other primary keeps the original wording unchanged.
export function planBigExecuteSmallLine(primary) {
  return subagentsLoadRules(primary)
    ? `- **Plan big, execute small**, within a build: deep tier plans at Checkpoint 1, builder executes from the orchestrator's brief, bulk and wide searches go down.`
    : '- **Plan big, execute small**, within a build: deep tier plans at Checkpoint 1, the orchestrator executes, bulk and wide searches go down.';
}
export function rolesBuilderRow(primary) {
  return subagentsLoadRules(primary)
    ? [
        '| Orchestrator | Routes, maps, briefs, verifies, records. Stages 0, 1, 2, 4, 5b, 6, 7 | Write the build |',
        "| Builder | Executes Stage 3 from the orchestrator's brief | Route further, or verify its own work as final |"
      ].join('\n')
    : '| Builder / orchestrator | Routes, maps, writes, verifies, records. Stages 0, 1, 3, 6, 7 | Hand off the main build |';
}
export function builderHandoffNote(primary) {
  return subagentsLoadRules(primary)
    ? `**Why Stage 3 goes to builder by default:** a Claude Code subagent loads this project's CLAUDE.md hierarchy at start, so it already carries the standing rules; the orchestrator's brief only has to restate this task's scope (see \`TASK_BUNDLE.md\`). The orchestrator keeps Stage 3 for itself only when the brief would cost as much as the work, the task needs this conversation's own context, or it is the human's decision or the final verification of delegated work.`
    : `**Why the builder does not hand off the main build:** a delegated agent does not inherit the session's standing rules and usually cannot delegate further. Any brief must restate every convention it needs (see \`TASK_BUNDLE.md\`), and that cost is itself a reason to build directly when the work fits.`;
}

// Which activation file this primary gets. ONE decision, read by three
// surfaces: planFiles writes the file, vars() names it in the generated README,
// and bin/cli.js prints it in the terminal. Before 0.1.12 the README hardcoded
// PASTE-INTO-YOUR-AGENT.md and named it for CLI installs that never got one (#20).
export function snippetFor(primary) {
  if (!primary) return null;
  return primary.rulesFile ? primary.rulesFile.replace(/\.md$/, '.snippet.md') : 'PASTE-INTO-YOUR-AGENT.md';
}

// The activation list, in order. The terminal prints this array at the end of a
// run and the generated README renders the same array, so the page cannot
// describe a different first step from the one the user just read (#20).
export function activationSteps(opts) {
  const { level, selected = [], primary } = opts;
  const tools = opts.tools || [];
  const dirAbs = resolve(opts.dir || 'ai-orchestrator');
  const projectAbs = resolve(opts.project || process.cwd());
  const snippet = snippetFor(primary);
  const steps = [];
  if (snippet && primary.rulesFile) steps.push(`copy the block in ${join(dirAbs, snippet)} into ${join(projectAbs, primary.rulesFile)} (create it if missing)`);
  // A chat app has no possessive that survives its catalog note: "Claude app or
  // claude.ai (chat only, no CLI)'s custom instructions" was the sentence this
  // replaces (#22).
  else if (snippet) steps.push(`open ${primary.chatName || primary.name} and paste the block in ${join(dirAbs, snippet)} into its ${primary.chatSurface || 'custom instructions'}`);
  if (primary && primary.agentsDir) steps.push(`subagents are in ${join(projectAbs, primary.agentsDir)}; run ${primary.bin} from ${projectAbs} to pick them up`);
  // Only claude-code ships hooks (route-gate, subagent-context): the wiring
  // lives in a snippet, never written into a settings.json the user already has.
  if (subagentsLoadRules(primary)) steps.push(`merge the hooks in ${join(dirAbs, 'settings.hooks.snippet.json')} into ${join(projectAbs, '.claude', 'settings.json')} (create it if missing) to wire the route-gate, subagent-context and route-metrics hooks`);
  for (const a of selected.filter((a) => a.bin && a.kind === 'agent-cli')) steps.push(`sign in to ${a.name}: ${a.auth}`);
  // A local runtime has a bin but no sign-in, so the agent-cli loop above skips it
  // and before this it appeared in no ordered list at any level (#26).
  for (const a of selected.filter((a) => a.bin && a.kind === 'local')) steps.push(`install ${a.name}: ${a.install.url}, then \`${a.bin} pull <model>\` before the local lane can answer`);
  for (const t of tools) steps.push(`${t.id}: ${t.install}`);
  if (level >= 2) steps.push(`smoke test: node ${join(dirAbs, 'bin', 'cli-run.mjs')} --doctor   (add --run to send each lane one tiny prompt)`);
  if (level >= 3) steps.push(`box: read ${join(dirAbs, 'vm', 'README.md')}; keys named in vm/ENVIRONMENT.md go in your secrets manager, never a file`);
  return steps;
}

// The verification list, in order. Gated on level for the same reason
// activationSteps is: level 1 writes no bin/, so a step naming cli-run.mjs or
// lanes.json there described an install that did not happen (#27).
export function proofSteps(opts) {
  const { level, primary } = opts;
  const steps = [
    'Start a fresh agent session and ask: "Read the orchestrator instructions. Quote the routing rule you will use, then sort pear, apple, banana alphabetically. Name the tier and whether you delegated."',
    'Expect the fast tier and `apple, banana, pear`. If the agent cannot quote the routing rule, check the snippet location or chat instructions before continuing. This is a manual activation check, not proof that every future task follows the rules.'
  ];
  if (level >= 2) {
    steps.push('Run `node bin/cli-run.mjs --doctor` from this folder. It checks binary presence, not authentication or loaded instructions, and prints the model and effort each lane is pinned to. `--doctor --run` additionally uses a little quota to test live responses. No enabled lanes means delegation is inactive.');
    steps.push('Decide whether the route matters to you. Every lane starts unpinned, which means it runs on whatever its own config file says: a CLI configured months ago at a low reasoning effort will keep auditing at that effort while your docs describe something stronger. Pin it in `bin/lanes.json` under `defaults`, or per call with `--model` and `--effort`. Either way the run is recorded in the log with the value requested and where it came from.');
    steps.push('To test a real output contract, choose an enabled lane from `bin/lanes.json` and run `node bin/cli-run.mjs <lane> \'Return only {"sorted":["apple","banana","pear"]}\' --expect-json`. This uses quota. Expect JSON and exit 0; inspect the array yourself. A non-JSON response exits 10, a missing binary exits 13, and an authentication failure reports the vendor error. The explicit lane tests execution; your primary agent still makes delegation decisions.');
  }
  // Only claude-code ships the route-gate hook, so only claude-code gets a
  // proof step that checks it fired: the table must come from the hook's
  // injected context, not from the agent reciting ROUTING.md from memory.
  if (subagentsLoadRules(primary)) {
    steps.push('Ask the agent: "Quote the route-gate table you were given this turn." It should quote the injected table verbatim, not recite it from memory. If it cannot, the hooks snippet was not merged into `.claude/settings.json`, or the hook found no rules file: check both before trusting the routing docs are actually reaching the agent.');
  }
  return steps;
}

function vars(opts) {
  const { level, selected, primary } = opts;
  const tools = opts.tools || [];
  const apis = opts.apis || [];
  const lvl = LEVELS.find((l) => l.id === level);
  const lane = auditLane(selected);
  const codecalc = tools.some((t) => t.id === 'codecalc');
  const dirAbs = resolve(opts.dir || 'ai-orchestrator');
  const projectAbs = resolve(opts.project || process.cwd());
  // dirPosix backs two things that must read the same on every host:
  //   1. INSTALL_DIR / INSTALL_DIR_SH / INSTALL_DIR_SYSTEMD (below), rendered
  //      into vm/jobs/weekly-audit.sh (bash) and vm/jobs/weekly-audit.service
  //      (a systemd unit) for the REMOTE Linux box, neither of which can run
  //      anywhere but Linux;
  //   2. rulesPath below when --dir falls outside --project, which is
  //      prose in generated markdown ("a dir outside the project renders an
  //      absolute path"), not a filesystem call.
  // An absolute --dir given as a bare POSIX path ("/opt/x") is never
  // re-resolved through this host's own path semantics for either: a real
  // Windows path always names a drive ("C:\...", caught by the `startsWith`
  // check below falling through to dirAbs), so a bare "/opt/x" only ever
  // means "a Linux path, or documentation text, verbatim" - resolving it
  // with plain path.resolve() reads that leading "/" as drive-relative on
  // win32 and silently turns it into a local path that does not exist,
  // on the box or in the doc. A relative --dir resolves against this
  // host's cwd exactly as before, which is already correct in the common
  // case: level 3 is normally installed by running this CLI ON the box,
  // where "this host" and "the box" are the same filesystem.
  const rawDir = opts.dir || 'ai-orchestrator';
  const dirPosix = rawDir.startsWith('/') ? posix.normalize(rawDir) : dirAbs;
  let rulesPath = relative(projectAbs, dirAbs).split(sep).join(posix.sep);
  if (rulesPath === '') rulesPath = '.';
  else if (rulesPath.startsWith('..')) rulesPath = dirPosix; // outside the project: absolute is the only honest path
  const pinOf = (id) => (toolById[id] && toolById[id].pin) || 'latest';
  const snippet = snippetFor(primary);
  const steps = activationSteps({ level, selected, primary, tools, dir: opts.dir, project: opts.project });
  const proofs = proofSteps({ level, primary });
  const routingFile = level >= 2 ? 'ROUTING.md' : 'ORCHESTRATOR.md';
  // The path route-gate.mjs and subagent-context.mjs resolve at runtime,
  // relative to CLAUDE_PROJECT_DIR. Mirrors the RULES_PATH fallback below:
  // outside the project, the honest path is absolute, never a hardcoded one.
  const relJoin = (name) => (rulesPath === dirPosix ? posix.join(dirPosix, name) : rulesPath === '.' ? name : rulesPath + '/' + name);
  const rulesFileRel = relJoin(routingFile);
  const taskBundleRel = relJoin('TASK_BUNDLE.md');
  // Only claude-code and agy put files under the project root. A chat primary
  // puts nothing there, so naming a project root would name a folder this run
  // never created (#21).
  const writesProject = !!(primary && primary.agentsDir);
  const readsProjectRules = !!(primary && primary.rulesFile);
  const whereThingsWent = [`- This folder: \`${dirAbs}\``];
  if (writesProject) whereThingsWent.push(`- Project root (where your agent reads rules and subagents): \`${projectAbs}\``, `- Subagent definitions: \`${join(projectAbs, primary.agentsDir)}\``);
  else if (readsProjectRules) whereThingsWent.push(`- Project root (where ${primary.name} reads \`${primary.rulesFile}\`): \`${projectAbs}\`` + (existsSync(projectAbs) ? '' : ' (this run wrote nothing there; create the folder before you copy the snippet in)'), '- Subagent definitions: none, this agent has no subagent folder');
  else whereThingsWent.push('- Project root: none. A chat app reads pasted instructions, not files, so this install wrote nothing to a project folder.', '- Subagent definitions: none');
  whereThingsWent.push(`- The rules path your snippets use: \`${rulesPath}\``);
  return {
    ...laneVars(selected),
    ACTIVATION_STEPS: steps.map((st, i) => `${i + 1}. ${st}`).join('\n'),
    PROOF_STEPS: proofs.map((st, i) => `${i + 1}. ${st}`).join('\n'),
    LOAD_IT: readsProjectRules
      ? `${primary.name} reads its rules from \`${primary.rulesFile}\` in the project root. The installer wrote \`${snippet}\` next to this README; copy its contents into \`${join(projectAbs, primary.rulesFile)}\`, creating that file if it does not exist. Nothing was appended to a file you already had.`
      : snippet
        ? `${primary.name} has no project rules file, so the rules travel by paste. The installer wrote \`${snippet}\` next to this README; open ${primary.chatName || primary.name} and paste its contents into ${primary.chatSurface || 'custom instructions'}. Nothing was appended to a file you already had.`
        : 'No primary agent was selected, so no activation file was written. Re-run the installer and pick one.',
    CHAT_UPLOAD_NOTE: primary && primary.kind === 'chat' ? ' A chat app cannot open a local path: upload or paste any protocol file you want it to read.' : '',
    WHERE_THINGS_WENT: whereThingsWent.join('\n'),
    RULES_PATH: rulesPath,
    ROUTING_FILE: level >= 2 ? 'ROUTING.md' : 'ORCHESTRATOR.md',
    PROJECT_DIR: projectAbs,
    AGENTS_DIR: primary && primary.agentsDir ? join(projectAbs, primary.agentsDir) : 'none (your primary agent has no subagent folder)',
    LITELLM_IMAGE: IMAGES.litellm,
    OLLAMA_IMAGE: IMAGES.ollama,
    CODECALC_PIN: pinOf('codecalc'),
    OBSIDIAN_TC_PIN: pinOf('obsidian-tc'),
    APIS_LIST: apis.length ? apis.map((prov) => '- ' + prov.name + ' (`' + prov.envName + '`)').join('\n') : '- none: no metered provider key was selected, so the gateway serves only a local lane if you picked one',
    INSTALL_DIR: dirPosix,
    INSTALL_DIR_SH: shellQuote(dirPosix),
    INSTALL_DIR_SYSTEMD: systemdEscape(dirPosix),
    // vm/README.md step 3 named `grok login` and `agy` whatever you picked (#26).
    VM_SIGNIN: (() => {
      const lines = selected.filter((a) => a.bin && a.kind === 'agent-cli').map((a) => `   - ${a.name}: ${a.auth}`);
      for (const a of selected.filter((a) => a.bin && a.kind === 'local')) lines.push(`   - ${a.name}: no sign-in. Install it from ${a.install.url}, then \`${a.bin} pull <model>\`.`);
      return lines.length ? lines.join('\n') : '   - none: no CLI you selected needs a sign-in on the box.';
    })(),
    AUDIT_LANE: lane || 'none',
    // Enforced boundary per lane: codex has a read-only sandbox flag; the others
    // run with whatever their own config allows, and the script says so.
    AUDIT_LANE_FLAGS: lane === 'codex' ? '--audit' : '',
    AUDIT_LANE_BOUNDARY_NOTE: lane === 'codex'
      ? 'codex --audit, a read-only filesystem sandbox; commands and network follow the codex config'
      : lane
        ? `${lane} offers no sandbox flag cli-run can pass, so the denied-actions list is instruction-level only and enforcement is whatever ${lane}'s own permission config allows`
        : 'no lane selected',
    AUDIT_LANE_GUARD: lane
      ? ''
      : 'echo "weekly-audit: no cli-run lane was enabled at install time; enable one in bin/lanes.json and edit AUDIT_LANE" >&2; exit 13',
    TOOLS_LIST: tools.length ? tools.map((t) => '- ' + t.name + ': ' + t.role).join('\n') : '- none selected (re-run the installer with --tools codecalc to add the calculator and code runner)',
    CODECALC_STATUS: codecalc ? 'installed alongside this folder (see `CODECALC.md`)' : 'not selected; the rule below still binds, do the arithmetic with any tool that computes rather than guesses',
    OBSIDIAN_TC_STATUS: tools.some((t) => t.id === 'obsidian-tc') ? 'selected (see `OBSIDIAN-TC.md`); the tool names below are live calls' : 'not selected; the rule below still binds against whatever store you keep (a notes folder, a wiki, a repo of markdown), the tool names are what obsidian-tc would give you',
    DATE: new Date().toISOString().slice(0, 10),
    LEVEL_ID: String(level),
    LEVEL_NAME: lvl.name,
    LEVEL_TAGLINE: lvl.tagline,
    PRIMARY_ID: primary ? primary.id : 'none',
    PRIMARY_NAME: primary ? primary.name : 'your agent',
    PRIMARY_RULES_FILE: primary && primary.rulesFile ? primary.rulesFile : 'your agent\'s instructions file',
    PRIMARY_DEEP: primary && primary.models ? primary.models.deep : 'your strongest model',
    PRIMARY_STANDARD: primary && primary.models ? primary.models.standard : 'your everyday model',
    PRIMARY_FAST: primary && primary.models ? primary.models.fast : 'your cheapest model',
    AIS_LIST: selected.map((a) => '- ' + a.name + ': ' + a.role).join('\n'),
    AI_IDS: selected.map((a) => a.id).join(','),
    LANES_TABLE: lanesTable(selected),
    INSTALL_TABLE: installTable(selected),
    CLI_RUN_LANES: selected.filter((a) => a.cliRun).map((a) => a.id).join(', ') || 'none selected',
    GATEWAY_MODELS: gatewayModels(selected, apis),
    ENV_NAMES: envNames(selected, apis).map((n) => '- `' + n + '`').join('\n'),
    ENV_EXPORTS: envNames(selected, apis).map((n) => n + '=').join('\n'),
    NPM_PACKAGES: selected.map(npmSpec).filter(Boolean).join(' ') || '""',
    SCRIPT_INSTALLERS: scriptInstallers(selected),
    COMPOSE_ENV: composeEnv(selected, apis),
    COMPOSE_OLLAMA: composeOllama(selected),
    // Delegate by default (0.1.15): gated on subagentsLoadRules(primary), currently
    // claude-code only. Every other primary keeps the original, more
    // conservative wording these replace.
    DECISION_RULE5: decisionRule5(primary),
    DECISION_RULE5_L1: decisionRule5Beginner(primary),
    WHO_BUILDS: whoBuildsSection(primary),
    ADD_ENDPOINT_ROW: addEndpointRow(primary),
    INLINE_THRESHOLD_NOTE: inlineThresholdNote(primary),
    DELEGATE_RULES_NOTE: delegateRulesNote(primary),
    PLAN_BIG_LINE: planBigExecuteSmallLine(primary),
    ROLES_BUILDER_ROW: rolesBuilderRow(primary),
    BUILDER_HANDOFF_NOTE: builderHandoffNote(primary),
    ROUTE_GATE_SECTION: subagentsLoadRules(primary) ? '\n' + routeGateSection(selected) + '\n' : '',
    AGENTS_LIST_LINE: claudeAgentIds().map((id) => '`' + id + '`').join(', '),
    RULES_FILE_REL: rulesFileRel,
    RULES_FILE_REL_JSON: JSON.stringify(rulesFileRel),
    TASK_BUNDLE_REL_JSON: JSON.stringify(taskBundleRel)
  };
}

// Build the list of files this run would write. Pure: touches no disk except
// reading templates, so tests and --dry can inspect it.
export function planFiles(opts) {
  const { level, selected, primary } = opts;
  const v = vars(opts);
  const files = [];
  // root: 'dir' (the docs folder) or 'project' (where the agent actually looks for subagents)
  const add = (rel, content, mode, root = 'dir') => files.push({ rel, content, mode: mode || 0o644, root });
  const addTemplates = (sub) => {
    for (const f of walk(join(TEMPLATES, sub))) {
      if (!installable(sub, f.rel)) continue;
      const raw = readFileSync(f.abs, 'utf8');
      add(f.rel, render(raw, v));
    }
  };

  addTemplates('common');
  addTemplates('beginner');

  // The primary agent's own loading surface.
  if (primary && primary.id === 'claude-code') {
    for (const f of walk(join(TEMPLATES, 'agents', 'claude-code'))) {
      if (!installable('agents', f.rel)) continue;
      add(join('.claude', 'agents', f.rel), render(readFileSync(f.abs, 'utf8'), v), 0o644, 'project');
    }
    add('CLAUDE.snippet.md', render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'claude-code.md'), 'utf8'), v));
    // Delegate-by-default hooks (0.1.15), claude-code only: route-gate.mjs (UserPromptSubmit)
    // and subagent-context.mjs (SubagentStart) live where Claude Code looks for
    // project hooks; the wiring snippet is a document the user merges in, never
    // written into a settings.json they already have.
    add(join('.claude', 'hooks', 'route-gate.mjs'), render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'route-gate.mjs'), 'utf8'), v), 0o755, 'project');
    add(join('.claude', 'hooks', 'subagent-context.mjs'), render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'subagent-context.mjs'), 'utf8'), v), 0o755, 'project');
    // route-metrics.mjs (0.1.16), claude-code only: five events (UserPromptSubmit,
    // PreToolUse on Agent|Task, SubagentStart, SubagentStop, Stop) turned into one
    // JSON line each under ~/.ai-orchestrator/, so a routing rule nobody measures
    // is not a rule nobody knows is followed.
    add(join('.claude', 'hooks', 'route-metrics.mjs'), render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'route-metrics.mjs'), 'utf8'), v), 0o755, 'project');
    add('settings.hooks.snippet.json', render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'settings.hooks.snippet.json'), 'utf8'), v));
  } else if (primary && primary.id === 'agy') {
    for (const f of walk(join(TEMPLATES, 'agents', 'agy'))) {
      if (!installable('agents', f.rel)) continue;
      add(join('.agents', 'agents', f.rel), render(readFileSync(f.abs, 'utf8'), v), 0o644, 'project');
    }
    add('GEMINI.snippet.md', render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'generic.md'), 'utf8'), v));
  } else if (primary && primary.rulesFile) {
    add(primary.rulesFile.replace('.md', '.snippet.md'), render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'generic.md'), 'utf8'), v));
  } else if (primary) {
    add('PASTE-INTO-YOUR-AGENT.md', render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'chat.md'), 'utf8'), v));
  }

  for (const t of opts.tools || []) {
    if (existsSync(join(TEMPLATES, 'tools', t.id))) addTemplates(join('tools', t.id));
  }

  if (level >= 2) {
    addTemplates('intermediate');
    add(join('bin', 'cli-run.mjs'), readFileSync(CLI_RUN_SRC, 'utf8'), 0o755);
    add(
      join('bin', 'lanes.json'),
      JSON.stringify(
        {
          enabled: selected.filter((a) => a.cliRun).map((a) => a.id),
          defaults: {},
          note: 'Lanes cli-run may call. Edit to enable or disable a lane. A lane not listed here exits 13 (unavailable).',
          defaultsNote: 'Pin what a lane runs with, so the route in your docs is the route that runs: "defaults": {"codex": {"model": "gpt-6-astra", "effort": "high"}}. Left empty, a lane inherits its own config file, which cli-run cannot see and does not guess. `--model` and `--effort` override this per call, and `--doctor` prints what each lane is pinned to. Every lane takes a model; every lane except qwen takes an effort.'
        },
        null,
        2
      ) + '\n'
    );
  }

  if (level >= 3) {
    addTemplates('advanced');
  }

  // MANIFEST.json records the choices this run was generated from, the
  // generator version, and a hash of every file as generated, so a later run
  // can tell an untouched generated file (safe to upgrade) from one the user
  // edited (kept, reported as a conflict). Machine-owned: rewritten every run.
  const fileHashes = {};
  for (const f of files) fileHashes[(f.root === 'project' ? '[project] ' : '') + f.rel.split(sep).join('/')] = sha256(f.content);
  files.push({
    rel: 'MANIFEST.json',
    mode: 0o644,
    root: 'dir',
    content:
      JSON.stringify(
        {
          generator: 'model-orchestrator',
          generatorVersion: GENERATOR_VERSION,
          generatedAt: new Date().toISOString(),
          level,
          ais: selected.map((a) => a.id),
          primary: primary ? primary.id : null,
          tools: (opts.tools || []).map((t) => t.id),
          apis: (opts.apis || []).map((p) => p.id),
          dir: resolve(opts.dir || 'ai-orchestrator'),
          project: resolve(opts.project || process.cwd()),
          files: fileHashes,
          note: 'Machine-owned. Rewritten on every run together with bin/lanes.json. Edit the docs, not this.'
        },
        null,
        2
      ) + '\n'
  });

  return files;
}

// Every write is checked before any write happens:
//   containment  the resolved target stays inside --dir (template names are ours,
//                but a check is cheaper than trusting that forever)
//   no symlinks  no existing path component under --dir may be a symlink, so a
//                target/bin -> /elsewhere link cannot redirect a write
//   parent type  an existing component that must be a directory is one
// Then files are written with an exclusive create unless --force, and any file
// this run created is removed again if a later write fails.
// Resolve the target root through whatever part of it already exists. A
// symlinked ancestor (macOS /tmp -> /private/tmp, a user's ~/projects link) is
// the user's own choice and is followed; the resolved real path is what every
// containment check compares against. A root that exists and is not a
// directory is refused.
export function realRoot(dir) {
  const abs = resolve(dir);
  const missing = [];
  let cur = abs;
  while (!existsSync(cur)) {
    missing.unshift(cur.slice(dirname(cur).length + (dirname(cur).endsWith(sep) ? 0 : 1)));
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  const real = realpathSync(cur);
  return { root: missing.length ? join(real, ...missing) : real, exists: missing.length === 0 };
}

export function preflight(files, dir) {
  const problems = dirProblems(dir);
  if (problems.length) return problems;
  const { root, exists } = realRoot(dir);
  if (exists && !statSync(root).isDirectory()) return [`the target exists and is not a directory: ${resolve(dir)}`];
  for (const f of files) {
    const abs = resolve(root, f.rel);
    if (abs === root || !abs.startsWith(root + sep)) {
      problems.push(`${f.rel}: resolves outside the target directory`);
      continue;
    }
    const parts = relative(root, abs).split(sep);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      cur = join(cur, parts[i]);
      let st;
      try {
        st = lstatSync(cur);
      } catch {
        break; // nothing below here exists yet
      }
      const last = i === parts.length - 1;
      if (st.isSymbolicLink()) {
        problems.push(`${f.rel}: ${relative(root, cur)} is a symlink`);
        break;
      }
      if (!last && !st.isDirectory()) {
        problems.push(`${f.rel}: ${relative(root, cur)} exists and is not a directory`);
        break;
      }
      if (last && !st.isFile()) {
        problems.push(`${f.rel}: exists and is not a regular file`);
        break;
      }
    }
  }
  return problems;
}

// Three classes of generated file.
//   MACHINE_OWNED  structured configuration: rewritten on every run so a new
//                  selection applies (MANIFEST.json, bin/lanes.json).
//   RUNTIME        executables and units: rewritten when the installed copy is
//                  byte-identical to what a previous run generated (the manifest
//                  hash proves nobody edited it), kept and reported as a conflict
//                  when it was edited, kept and reported as unverifiable when no
//                  manifest exists. --upgrade-runtime forces this class only.
//   documents      everything else: the user may have edited them; kept unless --force.
export const MACHINE_OWNED = new Set(['MANIFEST.json', 'bin/lanes.json']);
export const RUNTIME = new Set([
  'bin/cli-run.mjs',
  'vm/setup-vm.sh',
  'vm/docker-compose.yml',
  'vm/gateway.config.yaml',
  'vm/jobs/weekly-audit.sh',
  'vm/jobs/weekly-audit.service',
  'vm/jobs/weekly-audit.timer'
]);
// MACHINE_OWNED and RUNTIME are keyed with forward slashes (they read as
// prose in the comment above them, and every caller needs the same one
// spelling regardless of host OS); an f.rel or a writeFiles() "written" path
// is built with path.join, so it is backslash-separated on win32. Both sets
// must be checked against the SAME normalized form, or a win32 install
// silently drops bin/lanes.json and every RUNTIME file from set membership
// (found: bin/cli.js's own "applied:"/existing-runtime checks did exactly
// that before this was exported for them to use too).
// separator is a parameter (default the real path.sep) so a test can prove
// the win32 case from any host, the same pattern which()'s platform
// parameter already uses.
export function toPosixRel(rel, separator = sep) {
  return rel.split(separator).join('/');
}
export function fileClass(rel, separator = sep) {
  const r = toPosixRel(rel, separator);
  if (MACHINE_OWNED.has(r)) return 'owned';
  if (RUNTIME.has(r)) return 'runtime';
  return 'document';
}

export function readManifest(dir) {
  try {
    const j = JSON.parse(readFileSync(join(resolve(dir), 'MANIFEST.json'), 'utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

// Files carry a root: 'dir' for the docs folder, 'project' for the agent
// definitions the user's CLI reads from the project root. Each root gets its
// own preflight; one failure anywhere rolls back everything this run touched.
// Machine-owned files are always rewritten (they carry the selection); other
// existing documents are kept unless --force, or --update-docs for the ones a previous run wrote and nobody edited.
export function writeFiles(files, opts) {
  const { dir, force = false, dry = false, upgradeRuntime = false, updateDocs = false } = opts;
  const prevHashes = (opts.prevManifest && opts.prevManifest.files) || null;
  const roots = { dir, project: opts.project || dir };
  const groups = { dir: files.filter((f) => (f.root || 'dir') === 'dir'), project: files.filter((f) => f.root === 'project') };
  const problems = [];
  for (const k of ['dir', 'project']) {
    if (!groups[k].length) continue;
    problems.push(...preflight(groups[k], roots[k]).map((p) => (k === 'project' ? `[project] ${p}` : p)));
  }
  if (problems.length) {
    const e = new Error('refusing to write:\n  ' + problems.join('\n  '));
    e.code = 'PREFLIGHT';
    throw e;
  }
  const written = [];
  const skipped = [];
  const upgraded = [];      // runtime files replaced because the installed copy was an untouched generated one
  const conflicts = [];     // runtime files kept because the installed copy differs from what we generated
  const unverifiable = [];  // runtime files kept because there is no manifest to compare against
  const docsUpdated = [];   // --update-docs: documents regenerated because the installed copy was an untouched generated one
  const docsConflict = [];  // --update-docs: documents kept because you edited them
  const docsUnverifiable = []; // --update-docs: documents kept because there is no manifest to compare against
  const created = [];
  const originals = new Map(); // abs -> {content, mode} of files --force overwrote, restored on failure
  // Files that exist and were NOT rewritten this run. MANIFEST.json must record the hash of
  // what is on disk for them (the previous run's hash, or nothing when there was no manifest),
  // never the hash of content this run planned but did not write. Otherwise the next
  // --update-docs or upgrade sees every kept file as "edited".
  const keptKeys = new Set();
  try {
    // project first so MANIFEST.json (last in the dir group) is the final write and can
    // describe every decision made above it
    for (const k of ['project', 'dir']) {
      if (!groups[k].length) continue;
      const { root } = realRoot(roots[k]);
      for (const f of groups[k]) {
        const abs = resolve(root, f.rel);
        const exists = existsSync(abs);
        // label is what reaches the terminal report (bin/cli.js's "runtime
        // upgraded:", "runtime CONFLICT, kept:", etc lines): posix-normalized
        // like key, below, so the report reads the same on every host. Before
        // this it carried f.rel verbatim, which is native-separated (join()),
        // so on win32 the report named "bin\cli-run.mjs" while everything
        // else in this tool (docs, other path prose) uses forward slashes.
        const label = (k === 'project' ? '[project] ' : '') + f.rel.split(sep).join('/');
        const key = label;
        const cls = k === 'dir' ? fileClass(f.rel) : 'document';
        if (exists && !force) {
          if (cls === 'document') {
            // Documents are the user's. Without --update-docs they are never touched.
            // With it, the same hash rule the runtime class uses applies: regenerate
            // only what a previous run wrote and nobody edited since.
            if (!updateDocs) {
              skipped.push(label);
              keptKeys.add(key);
              continue;
            }
            const onDisk = sha256(readFileSync(abs));
            if (onDisk === sha256(f.content)) {
              skipped.push(label); // already current
              continue;
            }
            const prev = prevHashes ? prevHashes[key] : undefined;
            if (!prev) {
              docsUnverifiable.push(label);
              keptKeys.add(key);
              continue;
            }
            if (onDisk !== prev) {
              docsConflict.push(label);
              keptKeys.add(key);
              continue;
            }
            docsUpdated.push(label);
          }
          if (cls === 'runtime') {
            const onDisk = sha256(readFileSync(abs));
            if (onDisk === sha256(f.content)) {
              skipped.push(label); // already current
              continue;
            }
            if (!upgradeRuntime) {
              const prev = prevHashes ? prevHashes[key] : undefined;
              if (!prev) {
                unverifiable.push(label);
                keptKeys.add(key);
                continue;
              }
              if (onDisk !== prev) {
                conflicts.push(label);
                keptKeys.add(key);
                continue;
              }
            }
            upgraded.push(label); // untouched generated file, or --upgrade-runtime said replace it: either way it is reported
          }
        }
        let content = f.content;
        if (f.rel === 'MANIFEST.json' && keptKeys.size) {
          const m = JSON.parse(content);
          for (const kk of Object.keys(m.files || {})) {
            if (!keptKeys.has(kk)) continue;
            if (prevHashes && prevHashes[kk]) m.files[kk] = prevHashes[kk];
            else delete m.files[kk]; // never recorded: stays unverifiable, which is the truth
          }
          content = JSON.stringify(m, null, 2) + '\n';
        }
        if (!dry) {
          if (exists) originals.set(abs, { content: readFileSync(abs), mode: statSync(abs).mode });
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, content, { flag: exists ? 'w' : 'wx' });
          if (!exists) created.push(abs);
          chmodSync(abs, f.mode);
        }
        written.push(label);
      }
    }
  } catch (e) {
    for (const abs of created.reverse()) {
      try {
        unlinkSync(abs);
      } catch {
        /* best effort */
      }
    }
    for (const [abs, o] of originals) {
      try {
        writeFileSync(abs, o.content);
        chmodSync(abs, o.mode);
      } catch {
        /* best effort */
      }
    }
    throw e;
  }
  return { written, skipped, upgraded, conflicts, unverifiable, docsUpdated, docsConflict, docsUnverifiable };
}

export function resolveSelection(ids) {
  const selected = [];
  const unknown = [];
  for (const id of ids) {
    if (byId[id]) selected.push(byId[id]);
    else unknown.push(id);
  }
  return { selected, unknown };
}

export function resolveApis(ids) {
  const apis = [];
  const unknown = [];
  for (const id of ids) {
    if (providerById[id]) apis.push(providerById[id]);
    else unknown.push(id);
  }
  return { apis, unknown };
}

export function resolveTools(ids) {
  const tools = [];
  const unknown = [];
  for (const id of ids) {
    if (toolById[id]) tools.push(toolById[id]);
    else unknown.push(id);
  }
  return { tools, unknown };
}

export { AIS, LEVELS, TOOLS, PROVIDERS, IMAGES, npmSpec };
