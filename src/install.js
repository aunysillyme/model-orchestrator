import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync, readdirSync, statSync, lstatSync, unlinkSync, realpathSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { join, dirname, relative, resolve, sep, parse as parsePath, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './render.js';
import { createHash } from 'node:crypto';
import { ROLE_SPECS, assignRoles, roleTable, roleRoute, manifestRoles, inferPrimary } from './roles.js';
import { LANE_FLAGS } from '../bin/cli-run.mjs';
import { AIS, LEVELS, TOOLS, PROVIDERS, IMAGES, byId, toolById, providerById, npmSpec, summaryWithEvidence } from './catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const GENERATOR_VERSION = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).version;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const TEMPLATES = join(HERE, '..', 'templates');
export const CLI_RUN_SRC = join(HERE, '..', 'bin', 'cli-run.mjs');
// Compatibility with the 0.1.x filename; current docs use the public brief name.
const LEGACY_BRIEF = ['TASK', 'BUN' + 'DLE.md'].join('_');

function readLegacyBrief(path, dir) {
  const problems = preflight([{ rel: LEGACY_BRIEF }], dir);
  if (problems.length) throw Object.assign(new Error(problems.join('; ')), { code: 'PREFLIGHT' });
  const expected = lstatSync(path);
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const actual = fstatSync(fd);
    if (!actual.isFile() || actual.dev !== expected.dev || actual.ino !== expected.ino) {
      throw Object.assign(new Error('legacy brief changed during inspection; re-run the installer'), { code: 'PREFLIGHT' });
    }
    return { content: readFileSync(fd), stat: actual };
  } finally { closeSync(fd); }
}

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

export function lanesTable(selected, plans = {}, primary = inferPrimary(selected)) {
  const { roles } = assignRoles({ selected, primary, plans });
  const rows = selected.map(a => [
    a.name,
    a.facts.billing,
    summaryWithEvidence(a),
    Object.entries(roles).filter(([, role]) => role.ai === a.id).map(([id]) => id).join(', ') || 'none',
    a.facts.cliRun ? '`cli-run ' + a.id + '`' : a.bin ? '`' + a.bin + '`' : 'the app',
    plans[a.id] ? `${plans[a.id].name} (${plans[a.id].headroom} headroom)` : 'not stated'
  ]);
  return table(rows, ['AI', 'Lane', 'What it is', 'Assigned roles', 'Call it with', 'Plan']);
}

function planGuidance(selected, plans = {}) {
  const lines = selected.filter((a) => plans[a.id]).map((a) => {
    const p = plans[a.id];
    const volume = p.headroom === 'base'
      ? 'Keep this base-headroom lane for short second opinions. If it is your main agent, delegate volume to high or max headroom lanes.'
      : 'Use this high or max headroom lane for volume: scoped well-specified builds, first-pass research, and pre-ship reviews through cli-run when its configured model family differs from the author\'s.';
    return `- **${a.name}: ${p.name} (${p.headroom} headroom).** ${volume} Capability and independent-review rules are unchanged. Checked ${p.checked}.`;
  });
  return lines.length ? lines.join('\n') : 'State subscription plans with `--plans` to receive volume-allocation guidance. Capability and independent-review rules stay unchanged.';
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
    lines.push('  - model_name: local-small', '    litellm_params:', `      model: ${byId.ollama.gatewayModel}`, '      api_base: http://ollama:11434');
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
    else if (a.install.url && a.facts.kind !== 'chat') lines.push(`say "  ${a.name}:  ${a.install.url}"`);
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

// The weekly job uses the independent review assignment, then an eligible
// bulk runner. A main-agent fallback without a runner keeps the exit-13 guard.
export function auditLane(selected, primary = selected[0]) {
  const { roles } = assignRoles({ selected, primary });
  const id = roles.review.ai ?? roles.bulk.ai ?? null;
  return selected.some(a => a.id === id && a.facts.cliRun) ? id : null;
}

function stackContext(selected, primary, detected = new Set()) {
  const installed = new Set(agentIds(primary));
  const names = { plan: 'deep-planner', build: 'builder', review: 'code-reviewer', verify: 'finding-verifier', research: 'live-researcher', bulk: 'bulk-worker', read: 'reader' };
  const agents = Object.fromEntries(Object.entries(names).filter(([, name]) => installed.has(name)));
  return { selected, primary, detected, agents };
}

function rolePick(id, assignment, ctx) {
  const entry = roleRoute(id, assignment, ctx);
  if (!entry || !entry.ai) return `none selected: ${entry?.reason || entry?.why || 'no eligible lane'}`;
  const ai = ctx.selected.find(a => a.id === entry.ai);
  if (entry.command) return '`' + entry.command + '`';
  if (entry.via === 'local') return `${ai.name} on your machine`;
  if (entry.via === 'main-agent') {
    if (ai.facts.kind === 'chat') return `paste the work into your main agent, ${entry.tier} tier`;
    return `${entry.agent ? '`' + entry.agent + '` on ' : ''}your main agent, ${entry.tier} tier`;
  }
  return `${ai.name}, ${entry.tier} tier`;
}

// Routing advice uses the same assignments as the stack table and manifest.
// Capability facts determine eligibility; selection order resolves equal fits.
export function laneVars(selected, primary = selected[0]) {
  const assignment = assignRoles({ selected, primary });
  const ctx = stackContext(selected, primary);
  const { roles } = assignment;
  const rolesForPrimary = routingRoles(primary);
  const pick = id => rolePick(id, assignment, ctx);
  // The installed subagent labels describe only main-agent assignments.
  // An external winner must reach the action instructions as well as the table.
  const assignedLabel = (id, local) => roles[id]?.ai && roles[id].ai !== primary?.id ? pick(id) : local;
  const assignedRoles = {
    PLANNER_ROLE: assignedLabel('plan', rolesForPrimary.PLANNER_ROLE),
    BUILDER_ROLE: assignedLabel('build', rolesForPrimary.BUILDER_ROLE),
    REVIEW_ROLE: assignedLabel('review', rolesForPrimary.REVIEW_ROLE),
    FINDING_ROLE: assignedLabel('verify', rolesForPrimary.FINDING_ROLE),
    DONE_ROLE: assignedLabel('verify', rolesForPrimary.DONE_ROLE),
    LIVE_ROLE: assignedLabel('research', rolesForPrimary.LIVE_ROLE),
    BULK_ROLE: assignedLabel('bulk', rolesForPrimary.BULK_ROLE),
    READER_ROLE: assignedLabel('read', rolesForPrimary.READER_ROLE)
  };
  const reviewer = selected.find(a => a.id === roles.review.ai);
  const review = reviewer
    ? `${pick('review')} (different model family from the main agent by default; verify the current models before dispatch${reviewer.facts.readOnlyMode ? '; read-only filesystem sandbox' : '; request review only and check the CLI permissions'})`
    : `${rolesForPrimary.REVIEW_ROLE} in a fresh context. No different-family reviewer is selected; treat this as a self-check, not an independent review. ${roles.review.why}`;
  const picks = ROLE_SPECS.filter(spec => roles[spec.id]).map(spec => [spec.job, spec.id === 'review' ? review : pick(spec.id), roles[spec.id].why]);
  const metered = selected.some(a => a.facts.billing === 'pay-per-token');
  const free = selected.some(a => a.facts.billing === 'free');
  const cost = [
    'Prompt caching where it fits: frozen prefix first, volatile text last.',
    `Use the assigned bulk route for bounded volume: ${pick('bulk')}. ${roles.bulk.why}.`,
    ...(metered ? ["Batch APIs where the selected provider supports them, for work that can wait. When a rate is unverified, check your provider's rate."] : []),
    ...(free ? ['A free model can carry routing decisions when its tools and context fit.'] : []),
    'Select effort and scoped context before changing model tiers.',
    'Read the current model roster before choosing an explicit model.'
  ];
  const enabled = selected.filter(a => a.facts.cliRun);
  const step0 = ROLE_SPECS.filter(spec => roles[spec.id]?.ai && roles[spec.id].ai !== primary?.id)
    .map(spec => `${pick(spec.id)} for ${spec.job.toLowerCase()}; ${roles[spec.id].why}`);
  const stage1 = ['research', 'review', 'fan-out'].filter(id => roles[id]?.ai)
    .map(id => `${id === 'review' ? review : pick(id)} for ${id === 'research' ? 'current primary sources' : id === 'review' ? 'a critique of the context file' : 'independent research units'}`);
  const examples = [
    `| "What is current on this topic" | ${pick('research')}; ${roles.research.why} |`,
    `| "Audit this auth diff" | ${review} |`,
    `| "Classify these 200 items" | ${pick('bulk')} |`,
    '| "Research this topic properly" | plan the question, collect primary sources and verify claims; see `RESEARCH_TRIAGE.md` |'
  ];
  const researchRoles = ['research', 'review', 'bulk', 'fan-out'].filter(id => roles[id]?.ai)
    .map(id => `| ${ROLE_SPECS.find(spec => spec.id === id).job} | ${id === 'review' ? review : pick(id)} | ${roles[id].why} |`);
  researchRoles.push('| Triage + the durable record | the main agent | opens primary sources, marks every claim, writes the artifact |');
  const runLanes = new Map();
  for (const id of ['review', 'research', 'bulk', 'fan-out']) {
    const entry = roleRoute(id, assignment, ctx);
    if (entry?.command && !runLanes.has(entry.ai)) runLanes.set(entry.ai, entry.command);
  }
  const run = [...runLanes].map(([id, command]) => `node bin/cli-run.mjs ${command.replace(/^cli-run /, '')} --brief "$BRIEF" --timeout 900 > research/out-${id}.md`);
  return {
    ...assignedRoles,
    TASK_LANES_TABLE: table(picks, ['Task type', 'Pick', 'Why']),
    COST_PLAYBOOK: cost.map((line, i) => `${i + 1}. ${line}`).join('\n'),
    FAN_OUT_ADVICE: roles['fan-out'] ? ` Many independent items each needing their own agent turn → ${pick('fan-out')}.` : '',
    METERED_CITATION_NOTE: metered ? ' Verify every supporting number and citation returned by a pay-per-token lane.' : '',
    RESEARCH_SELECTION_ADVICE: `Use ${pick('research')} for current primary sources. ${roles.research.why}. ` + (enabled.length >= 2
      ? 'Send a shared task brief to selected lanes with complementary capabilities; prefer different model families for independent perspectives.'
      : 'Use a fresh context to challenge the sweep; add a different model family for independent research.') + ` For review, use ${review}.`,
    GAP_ANALYSIS_LANE: `${review}. Give it the same artifact and verify each finding before acting.`,
    LANE_STEP0: step0.length ? step0.map(line => '   - ' + line).join('\n') : '   - no separate lane selected yet: use your main agent\'s tiers; keep local-only work off cloud lanes and arrange independent review separately',
    STAGE1_LANES: stage1.length ? '; ' + stage1.join('; ') : '',
    ATTACK_LANE: review,
    LIVE_LANE: `${pick('research')} for current sources, then`,
    BULK_LANE: `; assigned bulk route: ${pick('bulk')}`,
    LANE_EXAMPLES: examples.join('\n'),
    RESEARCH_ROLES: researchRoles.join('\n'),
    RESEARCH_RUN: run.length ? run.flatMap(command => ['# Or: ' + command.replace('node bin/cli-run.mjs', 'aunx cli-run'), command]).join('\n') : '# no separate cli-run assignment: run the sweep on your main agent, then a fresh-context self-check',
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
  return !!(primary && primary.facts.loadsProjectRules);
}

// Canonical agent order, tier-first. Used to render a stable, non-hardcoded
// "available as" list for the claude-code snippet from the files actually
// shipped, so a future agent addition or removal cannot leave the sentence
// stale the way the finding-verifier omission did.
const AGENT_ORDER = ['deep-planner', 'builder', 'code-reviewer', 'finding-verifier', 'live-researcher', 'bulk-worker', 'done-verifier', 'reader'];
function agentIds(primary) {
  if (!primary?.facts.agentDefinitions) return [];
  const dir = join(TEMPLATES, 'agents', primary.id);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.replace(/\.md$/, ''));
  const set = new Set(files);
  const ordered = AGENT_ORDER.filter((id) => set.has(id));
  const extra = files.filter((id) => !AGENT_ORDER.includes(id)).sort();
  return [...ordered, ...extra];
}
export function claudeAgentIds() {
  return agentIds(byId['claude-code']);
}

function routingRoles(primary) {
  const installed = new Set(agentIds(primary));
  const role = (id, label) => installed.has(id) ? id : `${label} role on the main agent`;
  return {
    BULK_ROLE: role('bulk-worker', 'bulk processing'),
    BUILDER_ROLE: role('builder', 'build'),
    READER_ROLE: role('reader', 'reading'),
    REVIEW_ROLE: role('code-reviewer', 'code review'),
    FINDING_ROLE: role('finding-verifier', 'finding verification'),
    DONE_ROLE: role('done-verifier', 'completion verification'),
    PLANNER_ROLE: role('deep-planner', 'planning'),
    LIVE_ROLE: role('live-researcher', 'live research')
  };
}

// The compact "choose a route before acting" table, rendered from the AIs the
// user actually selected and the agents actually installed, never a second
// hand-typed copy of ROUTING.md's decision tree.
export function routeGateTable(selected, primary = inferPrimary(selected)) {
  const assignment = assignRoles({ selected, primary });
  const ctx = stackContext(selected, primary);
  const rows = ROLE_SPECS.filter(spec => assignment.roles[spec.id])
    .map(spec => [spec.job, rolePick(spec.id, assignment, ctx)]);
  return table(rows, ['Task', 'Lane']);
}

// The marked block route-gate.mjs extracts at runtime. Installed only for
// claude-code so the hook always finds a block to read; other primaries get
// no hook and so get no block.
export function routeGateSection(selected, primary = inferPrimary(selected)) {
  return [
    '<!-- route-gate:start -->',
    '## Route gate: choose a route before acting',
    '',
    'Injected on every turn by the `route-gate` hook, so this table is read at runtime rather than recalled from memory.',
    '',
    routeGateTable(selected, primary),
    '',
    "Stay inline only when: (a) the brief would cost as much as the work itself, (b) the task needs this conversation's own context, (c) it is the human's decision or the final verification of delegated work (a delegate never verifies itself).",
    '',
    'When work depends on project rules, use a named agent that loads those rules. The built-in Explore and Plan agents skip CLAUDE.md; give their rule-bound work to the matching named agent.',
    '',
    'End every reply with a hidden marker: `<!-- route: <lane> | <why, a few words> -->`. The route-metrics hook reads only the lane out of it, so routing coverage can be measured instead of assumed.',
    '<!-- route-gate:end -->'
  ].join('\n');
}

// ROUTING.md / ORCHESTRATOR.md decision-tree rule 5 and the "Who builds"
// section read differently for claude-code, because only claude-code has the
// verified premise that its subagents load CLAUDE.md. Other agents verify
// rules and tool reach during Assign before handing off a section.
export function decisionRule5(primary) {
  return subagentsLoadRules(primary)
    ? `5. **When the task changes files**, builder executes by default after Assign confirms its tools, rules and context fit. The main agent briefs, combines sections, verifies and talks to the human. Keep conversation-dependent decisions and final verification with the main agent. When rules matter, use the matching named agent; the built-in Explore and Plan agents skip CLAUDE.md.`
    : `5. **When the task changes files**, the main agent builds it directly until Assign verifies another lane can carry the required tools, context and rules. Give a suitable delegate the whole scope and its bounded section in a task brief.`;
}
export function decisionRule5Beginner(primary) {
  return subagentsLoadRules(primary)
    ? `5. **When the task changes files or executes a known plan**, builder executes by default after checking its tools and rules. Use the working model tier for well-specified work and a planning model for architecture. Keep conversation-dependent decisions and final verification with the main agent.`
    : `5. **When the task changes files or executes a known plan**, use the main agent's working model tier. If another lane has the required tools and rules, give it a bounded section and a task brief.`;
}
export function whoBuildsSection(primary) {
  return [
    '## Who builds',
    '',
    subagentsLoadRules(primary)
      ? '**Builder executes by default when its capabilities fit.** A Claude Code subagent loads the project CLAUDE.md hierarchy. Give it the context file, acceptance checks and whole scope in `TASK_BRIEF.md`. When the task depends on conversation context, keep that section with the main agent.'
      : '**Assign each section by tools, context and rules.** The main agent already holds the session context. When another lane can carry the required context and permissions, give it the whole scope and its section in `TASK_BRIEF.md`; otherwise build that section in the main agent.',
    '',
    'When a decision belongs to the human, return it to them. When a section finishes, the main agent combines it with the other sections and gives the final artifact to the independent reviewer.',
    '',
    'When delegation costs as much as the bounded work itself, keep that work in the current session and record the reason.'
  ].join('\n');
}
export function addEndpointRow(primary) {
  return subagentsLoadRules(primary)
    ? '| "Add an endpoint" | builder after Assign confirms its capabilities, with a task brief |'
    : '| "Add an endpoint" | the main agent or another capable build lane chosen during Assign |';
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

// Keep assignment guidance consistent across the routing and build protocols.
export function planBigExecuteSmallLine(primary) {
  return subagentsLoadRules(primary)
    ? '- **Assign by job fit.** Use a planning model for architecture, assign scoped execution to builder, and use a cheap model for mechanical work.'
    : '- **Assign by job fit.** Match reach, context window and headroom to each section. When delegation cannot carry its required rules, the main agent executes that section.';
}
export function rolesBuilderRow(primary) {
  return subagentsLoadRules(primary)
    ? [
        '| Main agent | Frames, maps, assigns, combines sections, verifies, records | Keeps the whole scope and names merge conflicts |',
        '| Builder | Executes the assigned section from the task brief | Hands verification to an independent reviewer |'
      ].join('\n')
    : '| Main agent / assigned builder | Executes each section whose tools and rules it holds | Gives the reviewer the combined result and acceptance checks |';
}
export function builderHandoffNote(primary) {
  return subagentsLoadRules(primary)
    ? '**Assign the build:** when a Claude Code subagent has the needed tools and rules, send it the scoped task brief from `TASK_BRIEF.md`. Keep conversation-dependent decisions and the final verification with the main agent.'
    : '**Assign the build:** when another lane can hold the required context, tools and rules, give it the whole scope and its section in `TASK_BRIEF.md`. When that transfer is impractical, build that section in the main agent.';
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
  if (opts.applySnippets) steps.push(`applied ${join(dirAbs, snippet)} to the model-orchestrator marked block in ${join(projectAbs, 'CLAUDE.md')}`);
  else if (snippet && primary.rulesFile) steps.push(`copy the block in ${join(dirAbs, snippet)} into ${join(projectAbs, primary.rulesFile)} (create it if missing)`);
  // A chat app has no possessive that survives its catalog note: "Claude app or
  // claude.ai (chat only, no CLI)'s custom instructions" was the sentence this
  // replaces (#22).
  else if (snippet) steps.push(`open ${primary.chatName || primary.name} and paste the block in ${join(dirAbs, snippet)} into its ${primary.chatSurface || 'custom instructions'}`);
  if (primary && primary.facts.agentDefinitions) steps.push(`subagents are in ${join(projectAbs, primary.facts.agentDefinitions)}; run ${primary.bin} from ${projectAbs} to pick them up`);
  // Only claude-code ships hooks (route-gate, subagent-context): the wiring
  // lives in a snippet, applied only when the user opts in.
  if (opts.applySnippets) steps.push(`applied hooks to ${join(projectAbs, '.claude', 'settings.json')}, preserving existing settings and hooks`);
  else if (subagentsLoadRules(primary)) steps.push(`merge the hooks in ${join(dirAbs, 'settings.hooks.snippet.json')} into ${join(projectAbs, '.claude', 'settings.json')} (create it if missing) to wire the route-gate, subagent-context and route-metrics hooks`);
  for (const a of selected.filter((a) => a.bin && a.facts.kind === 'agent-cli')) steps.push(`sign in to ${a.name}: ${a.auth}`);
  // A local runtime has a bin but no sign-in, so the agent-cli loop above skips it
  // and before this it appeared in no ordered list at any level (#26).
  for (const a of selected.filter((a) => a.bin && a.facts.kind === 'local-runtime')) {
    steps.push(level >= 3
      ? `${a.name}: follow vm/README.md, then run \`bash setup-vm.sh --start-services\` in vm/ to pull the configured model into its Compose service and verify local-small`
      : `install ${a.name}: ${a.install.url}, then \`${a.bin} pull <model>\` before the local lane can answer`);
  }
  for (const t of tools) steps.push(`${t.id}: ${t.install}`);
  if (level >= 2) steps.push(`smoke test: node ${shellQuote(join(dirAbs, 'bin', 'cli-run.mjs'))} --doctor   (or aunx cli-run --dir ${shellQuote(dirAbs)} --doctor; add --run to send each lane one tiny prompt)`);
  if (level >= 3) steps.push(`box: read ${join(dirAbs, 'vm', 'README.md')}; keys named in vm/ENVIRONMENT.md go in your secrets manager, never a file`);
  return steps;
}

// The verification list, in order. Gated on level for the same reason
// activationSteps is: level 1 writes no bin/, so a step naming cli-run.mjs or
// lanes.json there described an install that did not happen (#27).
export function proofSteps(opts) {
  const { level, primary, selected = primary ? [primary] : [] } = opts;
  const steps = [
    'Start a fresh agent session and ask: "Read the orchestrator instructions. Quote the routing rule you will use, then sort pear, apple, banana alphabetically. Name the tier and whether you delegated."',
    'Expect the cheap model tier and `apple, banana, pear`. If the agent cannot quote the routing rule, check the snippet location or chat instructions before continuing. This is a manual activation check, not proof that every future task follows the rules.'
  ];
  if (level >= 2) {
    steps.push('Run `node bin/cli-run.mjs --doctor` from this folder, or `aunx cli-run --doctor` from your project root. It checks binary presence, not authentication or loaded instructions, and prints the model and effort each lane is pinned to. `--doctor --run` additionally uses a little quota to test live responses. No enabled lanes means delegation is inactive.');
    steps.push('Decide whether the route matters to you. Every lane starts unpinned, which means it runs on whatever its own config file says: a CLI configured months ago at a low reasoning effort will keep auditing at that effort while your docs describe something stronger. Pin it in `bin/lanes.json` under `defaults`, or per call with `--model` and `--effort`. Either way the run is recorded in the log with the value requested and where it came from.');
    if (selected.some(a => a.facts.cliRun)) {
      steps.push('To test a real output contract, choose an enabled lane from `bin/lanes.json` and run `node bin/cli-run.mjs <lane> \'Return only {"sorted":["apple","banana","pear"]}\' --expect-json`. The same command is available as `aunx cli-run <lane>` with those arguments. This uses quota. Expect JSON and exit 0; inspect the array yourself. A non-JSON response exits 10, a missing binary exits 13, and an authentication failure reports the vendor error. The explicit lane tests execution; your main agent still makes delegation decisions.');
    } else {
      steps.push('Delegation is inactive: no supported CLI lane is selected, so `--doctor` will exit 13. Defer the output-contract test until you select a supported CLI lane: re-run the installer with that lane in `--ais` and `--update-docs`, then install it and sign in using the printed instructions.');
    }
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
  const plans = opts.plans || {};
  const tools = opts.tools || [];
  const apis = opts.apis || [];
  const lvl = LEVELS.find((l) => l.id === level);
  const lane = auditLane(selected, primary);
  const assignment = assignRoles({ selected, primary, detected: opts.detected, plans });
  const stack = stackContext(selected, primary, opts.detected);
  const enabled = selected.filter(a => a.facts.cliRun);
  const exampleLane = enabled[0]?.id || '<lane>';
  const exampleDefaults = { model: '<model-id>', ...(LANE_FLAGS[exampleLane]?.effort ? { effort: 'high' } : {}) };
  const auditExample = enabled.find(a => a.facts.readOnlyMode);
  const fallbackNote = 'When no separate lane qualifies, your main agent carries the job at its stated tier. Independent review and local-only work require an eligible lane.';
  const gaps = assignment.unassigned.map(id => `${id}: ${assignment.roles[id].why}`).join(' ');
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
  const rulesPathNote = rulesPath === dirPosix
    ? 'Moved the folder? Re-run the installer or set MODEL_ORCHESTRATOR_RULES_DIR to the rules folder for the hooks, and update the paths in your agent instructions.'
    : '';
  const pinOf = (id) => (toolById[id] && toolById[id].pin) || 'latest';
  const snippet = snippetFor(primary);
  const steps = activationSteps({ level, selected, primary, tools, dir: opts.dir, project: opts.project, applySnippets: opts.applySnippets });
  const proofs = proofSteps({ level, primary, selected });
  const routingFile = level >= 2 ? 'ROUTING.md' : 'ORCHESTRATOR.md';
  // The path route-gate.mjs and subagent-context.mjs resolve at runtime,
  // relative to CLAUDE_PROJECT_DIR. Mirrors the RULES_PATH fallback below:
  // outside the project, the honest path is absolute, never a hardcoded one.
  const relJoin = (name) => (rulesPath === dirPosix ? posix.join(dirPosix, name) : rulesPath === '.' ? name : rulesPath + '/' + name);
  const rulesFileRel = relJoin(routingFile);
  const taskBriefRel = relJoin('TASK_BRIEF.md');
  // Only claude-code and agy put files under the project root. A chat primary
  // puts nothing there, so naming a project root would name a folder this run
  // never created (#21).
  const writesProject = !!(primary && primary.facts.agentDefinitions);
  const readsProjectRules = !!(primary && primary.rulesFile);
  const whereThingsWent = [`- This folder: \`${dirAbs}\``];
  if (writesProject) whereThingsWent.push(`- Project root (where your agent reads rules and subagents): \`${projectAbs}\``, `- Subagent definitions: \`${join(projectAbs, primary.facts.agentDefinitions)}\``);
  else if (readsProjectRules) whereThingsWent.push(`- Project root (where ${primary.name} reads \`${primary.rulesFile}\`): \`${projectAbs}\`` + (existsSync(projectAbs) ? '' : ' (this run wrote nothing there; create the folder before you copy the snippet in)'), '- Subagent definitions: none, this agent has no subagent folder');
  else whereThingsWent.push('- Project root: none. A chat app reads pasted instructions, not files, so this install wrote nothing to a project folder.', '- Subagent definitions: none');
  whereThingsWent.push(`- The rules path your snippets use: \`${rulesPath}\``);
  whereThingsWent.push(rulesPathNote
    ? '- Rules location: absolute, because this folder is outside the project. ' + rulesPathNote
    : '- Rules location: project-relative, so moving the project and its rules folder together preserves the paths.');
  return {
    ...laneVars(selected, primary),
    STACK_TABLE: roleTable(assignment, stack),
    STACK_FALLBACK_NOTE: fallbackNote,
    STACK_GAPS: gaps,
    STACK_SUMMARY: ['## Your stack: who does what', fallbackNote, gaps + ' Full assignments: [README.md](README.md#your-stack-who-does-what).'].join('\n'),
    EXAMPLE_LANE: exampleLane,
    EXAMPLE_EFFORT_FLAGS: LANE_FLAGS[exampleLane]?.effort ? ' --effort high' : '',
    EXAMPLE_AUDIT_LANE: auditExample?.id || '',
    EXAMPLE_AUDIT_BLOCK: auditExample ? `When reviewing with an available read-only mode, select its audit shape:\n\n\x60\x60\x60bash\naunx cli-run ${auditExample.id} --audit --brief REVIEW.md\nnode bin/cli-run.mjs ${auditExample.id} --audit --brief REVIEW.md\n\x60\x60\x60` : 'When reviewing, verify the chosen lane permissions and request review-only work.',
    EXAMPLE_LANES_JSON: JSON.stringify({ enabled: enabled.map(a => a.id), defaults: { [exampleLane]: exampleDefaults } }, null, 2),
    ACTIVATION_STEPS: steps.map((st, i) => `${i + 1}. ${st}`).join('\n'),
    PROOF_STEPS: proofs.map((st, i) => `${i + 1}. ${st}`).join('\n'),
    LOAD_IT: opts.applySnippets
      ? 'The installer applied the generated rules to the model-orchestrator marked block in `CLAUDE.md` and merged the hooks into `.claude/settings.json`. Existing files changed by this run have timestamped backups beside them; their paths were printed in the terminal.'
      : readsProjectRules
      ? `${primary.name} reads its rules from \`${primary.rulesFile}\` in the project root. The installer wrote \`${snippet}\` next to this README; copy its contents into \`${join(projectAbs, primary.rulesFile)}\`, creating that file if it does not exist. Nothing was appended to a file you already had.`
      : snippet
        ? `${primary.name} has no project rules file, so the rules travel by paste. The installer wrote \`${snippet}\` next to this README; open ${primary.chatName || primary.name} and paste its contents into ${primary.chatSurface || 'custom instructions'}. Nothing was appended to a file you already had.`
        : 'No main agent was selected, so no activation file was written. Re-run the installer and pick one.',
    CLAUDE_SNIPPET_INTRO: opts.applySnippets
      ? '# Model orchestrator activation\n\nThe installer applied these rules to the marked block in `CLAUDE.md` at your project root.'
      : "# Add this to your project's CLAUDE.md\n\nCopy the block below into `CLAUDE.md` at your project root (create the file if it does not exist). The installer did not modify any file you already had.",
    CLAUDE_HOOKS_ACTIVATION: opts.applySnippets
      ? 'The installer merged the hook entries into `.claude/settings.json` to wire all three in.'
      : 'Merge `settings.hooks.snippet.json`, written next to this file, into `.claude/settings.json` to wire all three in.',
    CHAT_UPLOAD_NOTE: primary && primary.facts.kind === 'chat' ? ' A chat app cannot open a local path: upload or paste any protocol file you want it to read.' : '',
    WHERE_THINGS_WENT: whereThingsWent.join('\n'),
    RULES_PATH: rulesPath,
    RULES_PATH_NOTE: rulesPathNote,
    RULES_PATH_NOTE_COMMENT: rulesPathNote ? '// ' + rulesPathNote : '',
    RULES_DIR_OVERRIDE_JS: 'process.env.MODEL_ORCHESTRATOR_RULES_DIR',
    ROUTING_FILE: level >= 2 ? 'ROUTING.md' : 'ORCHESTRATOR.md',
    PROJECT_DIR: projectAbs,
    AGENTS_DIR: primary && primary.facts.agentDefinitions ? join(projectAbs, primary.facts.agentDefinitions) : 'none (your main agent has no subagent folder)',
    LITELLM_IMAGE: IMAGES.litellm,
    OLLAMA_IMAGE: IMAGES.ollama,
    CODECALC_PIN: pinOf('codecalc'),
    OBSIDIAN_TC_PIN: pinOf('obsidian-tc'),
    CONTEXT7_PIN: pinOf('context7'),
    APIS_LIST: apis.length ? apis.map((prov) => '- ' + prov.name + ' (`' + prov.envName + '`)').join('\n') : '- none: no metered provider key was selected, so the gateway serves only a local lane if you picked one',
    INSTALL_DIR: dirPosix,
    INSTALL_DIR_SH: shellQuote(dirPosix),
    INSTALL_DIR_SYSTEMD: systemdEscape(dirPosix),
    // vm/README.md step 3 named `grok login` and `agy` whatever you picked (#26).
    VM_SIGNIN: (() => {
      const lines = selected.filter((a) => a.bin && a.facts.kind === 'agent-cli').map((a) => `   - ${a.name}: ${a.auth}`);
      for (const a of selected.filter((a) => a.bin && a.facts.kind === 'local-runtime')) lines.push(`   - ${a.name}: no sign-in. Step 5 initializes the model in its Compose service.`);
      return lines.length ? lines.join('\n') : '   - none: no CLI you selected needs a sign-in on the box.';
    })(),
    VM_LOCAL_MODEL_SH: shellQuote(selected.some((a) => a.id === 'ollama') ? byId.ollama.gatewayModel.replace(/^ollama\//, '') : ''),
    VM_SCRIPT_INSTALLERS: scriptInstallers(selected.filter((a) => a.facts.kind !== 'local-runtime')),
    VM_LOCAL_SETUP: selected.some((a) => a.id === 'ollama')
      ? `The command waits for Ollama, pulls \`${byId.ollama.gatewayModel.replace(/^ollama\//, '')}\` inside its Compose service, then requires a nonempty chat completion through the gateway alias \`local-small\`. The container uses its own volume; a host Ollama installation is separate. This check sends one short prompt to the local model.`
      : 'No local runtime was selected. The command starts the configured services; verify any configured provider lanes separately.',
    AUDIT_LANE: lane || 'none',
    // Enforced boundary per lane: codex has a read-only sandbox flag; the others
    // run with whatever their own config allows, and the script says so.
    AUDIT_LANE_FLAGS: selected.find(a => a.id === lane)?.facts.readOnlyMode ? '--audit' : '',
    AUDIT_LANE_BOUNDARY_NOTE: selected.find(a => a.id === lane)?.facts.readOnlyMode
      ? `${lane} --audit, a read-only filesystem sandbox; commands and network follow the ${lane} config`
      : lane
        ? `${lane} offers no sandbox flag cli-run can pass, so the denied-actions list is instruction-level only and enforcement is whatever ${lane}'s own permission config allows`
        : 'no lane selected',
    AUDIT_LANE_GUARD: lane
      ? ''
      : 'echo "weekly-audit: no cli-run lane was enabled at install time; enable one in bin/lanes.json and edit AUDIT_LANE" >&2; exit 13',
    TOOLS_LIST: tools.length ? tools.map((t) => '- ' + t.name + ': ' + t.role).join('\n') : '- none selected (re-run the installer with --tools codecalc to add the calculator and code runner)',
    CODECALC_STATUS: codecalc ? 'setup instructions selected (see `CODECALC.md`); verify your own installation before calling it' : 'use a calculator or the project runtime to compute and verify arithmetic',
    OBSIDIAN_TC_STATUS: tools.some((t) => t.id === 'obsidian-tc') ? 'setup instructions selected (see `OBSIDIAN-TC.md`); verify server access before calling these tools' : 'not selected; the rule below still binds against whatever store you keep (a notes folder, a wiki, a repo of markdown), the tool names are what obsidian-tc would give you',
    CONTEXT7_STATUS: tools.some((t) => t.id === 'context7') ? 'setup instructions selected (see `CONTEXT7.md`); verify server access before calling these tools' : 'not selected; the rule below still binds, read the vendor docs or source by hand before trusting them',
    DATE: new Date().toISOString().slice(0, 10),
    LEVEL_ID: String(level),
    LEVEL_NAME: lvl.name,
    LEVEL_TAGLINE: lvl.tagline,
    PRIMARY_ID: primary ? primary.id : 'none',
    PRIMARY_NAME: primary ? primary.name : 'your agent',
    PRIMARY_RULES_FILE: primary && primary.rulesFile ? primary.rulesFile : 'your agent\'s instructions file',
    PRIMARY_DEEP: 'the planning model available in your configuration',
    PRIMARY_STANDARD: 'the working model available in your configuration',
    PRIMARY_FAST: 'the cheap model available in your configuration',
    AIS_LIST: selected.map((a) => '- ' + a.name + ': ' + summaryWithEvidence(a)).join('\n'),
    AI_IDS: selected.map((a) => a.id).join(','),
    LANES_TABLE: lanesTable(selected, plans, primary),
    PLAN_GUIDANCE: planGuidance(selected, plans),
    INSTALL_TABLE: installTable(selected),
    CLI_RUN_LANES: selected.filter((a) => a.facts.cliRun).map((a) => a.id).join(', ') || 'none selected',
    GATEWAY_MODELS: gatewayModels(selected, apis),
    ENV_NAMES: envNames(selected, apis).map((n) => '- `' + n + '`').join('\n'),
    ENV_EXPORTS: envNames(selected, apis).map((n) => n + '=').join('\n'),
    NPM_PACKAGES: selected.map(npmSpec).filter(Boolean).join(' ') || '""',
    SCRIPT_INSTALLERS: scriptInstallers(selected),
    COMPOSE_ENV: composeEnv(selected, apis),
    COMPOSE_OLLAMA: composeOllama(selected),
    // Delegate-by-default wording uses the verified subagent loading surface.
    // Every other agent confirms tool and rule reach during Assign.
    DECISION_RULE5: decisionRule5(primary),
    DECISION_RULE5_L1: decisionRule5Beginner(primary),
    WHO_BUILDS: whoBuildsSection(primary),
    ADD_ENDPOINT_ROW: addEndpointRow(primary),
    INLINE_THRESHOLD_NOTE: inlineThresholdNote(primary),
    DELEGATE_RULES_NOTE: delegateRulesNote(primary),
    PLAN_BIG_LINE: planBigExecuteSmallLine(primary),
    ROLES_BUILDER_ROW: rolesBuilderRow(primary),
    BUILDER_HANDOFF_NOTE: builderHandoffNote(primary),
    ROUTE_GATE_SECTION: subagentsLoadRules(primary) ? '\n' + routeGateSection(selected, primary) + '\n' : '',
    AGENTS_LIST_LINE: claudeAgentIds().map((id) => '`' + id + '`').join(', '),
    RULES_FILE_REL: rulesFileRel,
    RULES_FILE_REL_JSON: JSON.stringify(rulesFileRel),
    TASK_BRIEF_REL_JSON: JSON.stringify(taskBriefRel),
    // route-gate.mjs takes a candidate list so the plugin bundle (src/plugin.js)
    // can render the installer's default locations from the same template. An
    // install knows its one rules file, and wrote it, so it needs no hint.
    RULES_CANDIDATES_JSON: JSON.stringify([rulesFileRel]),
    SETUP_HINT_JSON: JSON.stringify(''),
    SETUP_NOTICE_JSON: JSON.stringify(''),
    CONTEXT_SUFFIX_JSON: JSON.stringify('')
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
  const renderAgent = (raw) => {
    let content = render(raw, v);
    const tier = raw.match(/^Tier: ((?:planning|working|cheap) model)\./m)?.[1];
    const model = opts.plans?.[primary?.id]?.tierModels?.[tier];
    // Mappings belong to a dated, verified plan entry. Every shipped mapping
    // is null; an unstated plan leaves vendor resolution entirely intact.
    if (model != null) {
      if (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/.test(model)) throw new Error('invalid tierModels model identifier');
      content = content.replace(/^---\n/, `---\nmodel: ${model}\n`);
    }
    return content;
  };
  const addTemplates = (sub) => {
    for (const f of walk(join(TEMPLATES, sub))) {
      if (!installable(sub, f.rel)) continue;
      const raw = readFileSync(f.abs, 'utf8');
      add(f.rel, render(raw, v));
    }
  };

  addTemplates('common');
  addTemplates('beginner');

  // The main agent's own loading surface.
  if (primary && primary.id === 'claude-code') {
    for (const f of walk(join(TEMPLATES, 'agents', 'claude-code'))) {
      if (!installable('agents', f.rel)) continue;
      add(join('.claude', 'agents', f.rel), renderAgent(readFileSync(f.abs, 'utf8')), 0o644, 'project');
    }
    add('CLAUDE.snippet.md', render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'claude-code.md'), 'utf8'), v));
    // Delegate-by-default hooks (0.1.15), claude-code only: route-gate.mjs (UserPromptSubmit)
    // and subagent-context.mjs (SubagentStart) live where Claude Code looks for
    // project hooks; the wiring snippet is merged by hand or with --apply-snippets.
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
      add(join('.agents', 'agents', f.rel), renderAgent(readFileSync(f.abs, 'utf8')), 0o644, 'project');
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
          enabled: selected.filter((a) => a.facts.cliRun).map((a) => a.id),
          defaults: Object.fromEntries((opts.effortAuto || []).map((lane) => [lane, { effort: 'auto' }])),
          note: 'Lanes cli-run may call. Edit to enable or disable a lane. A lane not listed here exits 13 (unavailable).',
          defaultsNote: 'Pin what a lane runs with, so the route in your docs is the route that runs: "defaults": {"' + (selected.find(a => a.facts.cliRun)?.id || '<lane>') + '": ' + JSON.stringify({ model: '<model-id>', ...(LANE_FLAGS[selected.find(a => a.facts.cliRun)?.id]?.effort ? { effort: 'high' } : {}) }) + '}. Left empty, a lane inherits its own config file, which cli-run cannot see and does not guess. `--model` and `--effort` override this per call, and `--doctor` prints what each lane is pinned to. Every enabled lane takes a model; the runner reports which lanes support an effort flag.'
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
          detected: selected.filter(a => opts.detected?.has(a.id)).map(a => a.id),
          roles: manifestRoles(assignRoles({ selected, primary, detected: opts.detected, plans: opts.plans }), stackContext(selected, primary, opts.detected)),
          tools: (opts.tools || []).map((t) => t.id),
          apis: (opts.apis || []).map((p) => p.id),
          ...(Object.keys(opts.plans || {}).length ? { plans: Object.fromEntries(Object.entries(opts.plans).sort(([a], [b]) => a.localeCompare(b)).map(([id, p]) => [id, p.id])) } : {}),
          ...((opts.effortAuto || []).length ? { effortAuto: [...opts.effortAuto].sort() } : {}),
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
  const roots = { dir, project: opts.project || dir };
  const previous = opts.prevManifest;
  const sameRoot = (kind) => {
    if (typeof previous?.[kind] !== 'string') return false;
    try { return realRoot(previous[kind]).root === realRoot(roots[kind]).root; }
    catch { return false; }
  };
  const sameRoots = { dir: sameRoot('dir'), project: sameRoot('project') };
  const belongsHere = (key) => typeof key === 'string' && sameRoots[key.startsWith('[project] ') ? 'project' : 'dir'];
  // A hash or directory from another project cannot establish ownership here.
  const prevHashes = previous?.files ? Object.fromEntries(Object.entries(previous.files).filter(([key]) => belongsHere(key))) : null;
  const groups = { dir: files.filter((f) => (f.root || 'dir') === 'dir'), project: files.filter((f) => f.root === 'project') };
  const problems = [];
  for (const k of ['dir', 'project']) {
    if (!groups[k].length) continue;
    problems.push(...preflight(groups[k], roots[k]).map((p) => (k === 'project' ? `[project] ${p}` : p)));
  }
  // A legacy brief is a read and possible deletion target, so validate it with
  // the same containment, regular-file and symlink checks as every write.
  const currentBrief = groups.dir.find((f) => f.rel === 'TASK_BRIEF.md');
  const legacyPath = resolve(realRoot(dir).root, LEGACY_BRIEF);
  let hasLegacy = false;
  if (currentBrief) {
    try { lstatSync(legacyPath); hasLegacy = true; } catch { /* absent */ }
    if (hasLegacy) problems.push(...preflight([{ rel: LEGACY_BRIEF }], dir));
  }
  if (!problems.length) {
    for (const f of files.filter((file) => file.applySnippet)) {
      const abs = resolve(roots[f.root], f.rel);
      const current = existsSync(abs) ? readFileSync(abs) : null;
      if (current === null ? f.original !== null : !Buffer.isBuffer(f.original) || !current.equals(f.original)) {
        problems.push(`${abs}: changed since snippet planning; re-run the installer`);
      }
    }
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
  const docsRenamed = [];
  const backups = [];
  const created = [];
  // Only directories actually created by this install are owned. Preserve the
  // previous inventory on reruns; legacy manifests deliberately own none.
  const createdDirectories = new Set(Array.isArray(previous?.directories) ? previous.directories.filter(belongsHere) : []);
  const originals = new Map(); // abs -> {content, mode} of files --force overwrote, restored on failure
  // Files that exist and were NOT rewritten this run. MANIFEST.json must record the hash of
  // what is on disk for them (the previous run's hash, or nothing when there was no manifest),
  // never the hash of content this run planned but did not write. Otherwise the next
  // --update-docs or upgrade sees every kept file as "edited".
  const keptKeys = new Set();
  const removedKeys = new Set();
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
        if (exists && f.applySnippet && Buffer.from(f.content).equals(readFileSync(abs))) {
          skipped.push(label);
          continue;
        }
        if (exists && !force && !f.applySnippet) {
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
        if (f.rel === 'MANIFEST.json') {
          if (hasLegacy) {
            const previousHash = prevHashes?.[LEGACY_BRIEF];
            const original = readLegacyBrief(legacyPath, dir);
            const unchanged = previousHash && sha256(original.content) === previousHash;
            if ((updateDocs || force) && unchanged) {
              // The replacement has already been written (or preserved) by this
              // point. Keep deletion in this transaction and restore on failure.
              const current = readLegacyBrief(legacyPath, dir);
              const last = lstatSync(legacyPath);
              if (!current.content.equals(original.content) || current.stat.ino !== original.stat.ino || current.stat.dev !== original.stat.dev
                  || last.ino !== current.stat.ino || last.dev !== current.stat.dev || !last.isFile()) {
                const e = new Error('legacy brief changed during upgrade; re-run the installer');
                e.code = 'PREFLIGHT';
                throw e;
              }
              if (!dry) {
                originals.set(legacyPath, { content: original.content, mode: original.stat.mode });
                unlinkSync(legacyPath);
              }
              removedKeys.add(LEGACY_BRIEF);
              docsRenamed.push(`${LEGACY_BRIEF} -> TASK_BRIEF.md`);
            } else if ((updateDocs || force) && !previousHash) {
              docsUnverifiable.push(LEGACY_BRIEF);
            } else if ((updateDocs || force) && !unchanged) {
              docsConflict.push(LEGACY_BRIEF);
            } else skipped.push(LEGACY_BRIEF);
          }
          const m = JSON.parse(content);
          // Preserve ownership of retained 0.1.x companion files and other
          // formerly selected files, so uninstall still checks their original
          // installed hashes. New defaults do not erase a previous selection.
          m.files = { ...prevHashes, ...m.files };
          for (const removed of removedKeys) delete m.files[removed];
          for (const kk of Object.keys(m.files || {})) {
            if (!keptKeys.has(kk)) continue;
            if (prevHashes && prevHashes[kk]) m.files[kk] = prevHashes[kk];
            else delete m.files[kk]; // never recorded: stays unverifiable, which is the truth
          }
          content = JSON.stringify(m, null, 2) + '\n';
        }
        if (exists && opts.backupExisting) {
          let stamp = Date.now();
          let backup;
          do {
            backup = abs + '.bak-' + new Date(stamp).toISOString().replace(/[-:]/g, '').slice(0, 15);
            stamp += 1000;
          } while (existsSync(backup));
          if (!dry) writeFileSync(backup, readFileSync(abs), { flag: 'wx', mode: statSync(abs).mode & 0o777 });
          backups.push(backup);
          if (!dry) opts.onBackup?.(backup);
        }
        if (!dry) {
          if (exists) originals.set(abs, { content: readFileSync(abs), mode: statSync(abs).mode });
          const missingDirectories = [];
          let parent = dirname(abs);
          while (parent === root || parent.startsWith(root + sep)) {
            if (existsSync(parent)) break;
            // Keep the project container itself; only its generated child
            // directories belong to this package.
            if (k !== 'project' || parent !== root) missingDirectories.push(parent);
            const up = dirname(parent);
            if (up === parent) break;
            parent = up;
          }
          mkdirSync(dirname(abs), { recursive: true });
          for (const path of missingDirectories) createdDirectories.add((k === 'project' ? '[project] ' : '') + (toPosixRel(relative(root, path)) || '.'));
          if (f.rel === 'MANIFEST.json') {
            const m = JSON.parse(content);
            m.directories = [...createdDirectories].sort();
            content = JSON.stringify(m, null, 2) + '\n';
          }
          writeFileSync(abs, content, { flag: exists ? 'w' : 'wx' });
          if (!exists) created.push(abs);
          if (!exists || !f.applySnippet) chmodSync(abs, f.mode);
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
  return { written, skipped, upgraded, conflicts, unverifiable, docsUpdated, docsConflict, docsUnverifiable, docsRenamed, backups };
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
