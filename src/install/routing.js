import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROLE_SPECS, assignRoles, roleRoute, inferPrimary } from '../roles.js';
import { byId } from '../catalog.js';
import { TEMPLATES, table } from './shared.js';

// The weekly job uses the independent review assignment, then an eligible
// bulk runner. A main-agent fallback without a runner keeps the exit-13 guard.
export function auditLane(selected, primary = selected[0]) {
  const { roles } = assignRoles({ selected, primary });
  const id = roles.review.ai ?? roles.bulk.ai ?? null;
  return selected.find(a => a.id === id && a.facts.cliRun)?.bin || null;
}

export function stackContext(selected, primary, detected = new Set()) {
  const installed = new Set(agentIds(primary));
  const names = { plan: 'deep-planner', build: 'builder', review: 'code-reviewer', verify: 'finding-verifier', research: 'live-researcher', bulk:
     'bulk-worker', read: 'reader' };
  const agents = Object.fromEntries(Object.entries(names).filter(([, name]) => installed.has(name)));
  return { selected, primary, detected, agents };
}

export function rolePick(id, assignment, ctx) {
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
  // TIERS.md's "Role" column is the one place several rows can carry the
  // SAME bare command (two different rows can both land on `cli-run grok`,
  // and FINDING_ROLE/DONE_ROLE are literally the same 'verify' assignment
  // shown twice): a bare command alone does not say which row it is (C2).
  // ROUTING.md and ORCHESTRATOR.md keep the assignedRoles values above
  // (their decision-tree and activation text are pinned to that bare
  // shape), so this labels a separate set of vars for TIERS.md only.
  const externalWinner = (id) => Boolean(roles[id]?.ai && roles[id].ai !== primary?.id);
  const tierRole = (value, id, label) => externalWinner(id) ? `${label} (${value})` : value;
  const tierRoles = {
    TIER_PLANNER_ROLE: tierRole(assignedRoles.PLANNER_ROLE, 'plan', 'planning'),
    TIER_REVIEW_ROLE: tierRole(assignedRoles.REVIEW_ROLE, 'review', 'code review'),
    TIER_FINDING_ROLE: tierRole(assignedRoles.FINDING_ROLE, 'verify', 'reproduce a finding'),
    TIER_BUILDER_ROLE: tierRole(assignedRoles.BUILDER_ROLE, 'build', 'build'),
    TIER_LIVE_ROLE: tierRole(assignedRoles.LIVE_ROLE, 'research', 'live research'),
    TIER_BULK_ROLE: tierRole(assignedRoles.BULK_ROLE, 'bulk', 'bulk work'),
    TIER_DONE_ROLE: tierRole(assignedRoles.DONE_ROLE, 'verify', 'check definition of done'),
    TIER_READER_ROLE: tierRole(assignedRoles.READER_ROLE, 'read', 'read many files')
  };
  const reviewer = selected.find(a => a.id === roles.review.ai);
  // No reviewer: state the self-check once (dropping roles.review.why here,
  // which restates the same point) and end without a period, so
  // ROUTING.md's fixed "... with appropriate effort." tail reads as one
  // sentence instead of a second, dangling one glued after a full stop
  // (C3). "review" still ends every "Why" column via roles.review.why
  // directly, so that reasoning is not lost, only not duplicated here.
  const review = reviewer
    ? (`${pick('review')}` +
      " (different model family from the main agent by default; verify the current models before dispatch" +
      `${reviewer.facts.readOnlyMode ? '; read-only filesystem sandbox' : '; request review only and check the CLI permissions'}` +
      ")")
    : (`${rolesForPrimary.REVIEW_ROLE}` +
      " in a fresh context. No different-family reviewer is selected: treat this as a self-check");
  const picks = ROLE_SPECS.filter(spec => roles[spec.id]).map(spec => [spec.job, spec.id === 'review' ? review : pick(spec.id), roles[spec.id].why]);
  const metered = selected.some(a => a.facts.billing === 'pay-per-token');
  const free = selected.some(a => a.facts.billing === 'free');
  const cost = [
    'Prompt caching where it fits: frozen prefix first, volatile text last.',
    `Use the assigned bulk route for bounded volume: ${pick('bulk')}. ${roles.bulk.why}.`,
    ...(metered ? [("Batch APIs where the selected provider supports them, for work that can wait. When a rate is " +
      "unverified, check your provider's rate.")] : []),
    ...(free ? ['A free model can carry routing decisions when its tools and context fit.'] : []),
    'Select effort and scoped context before changing model tiers.',
    'Read the current model roster before choosing an explicit model.'
  ];
  const enabled = selected.filter(a => a.facts.cliRun);
  const step0 = ROLE_SPECS.filter(spec => roles[spec.id]?.ai && roles[spec.id].ai !== primary?.id)
    .map(spec => `${pick(spec.id)} for ${spec.job.toLowerCase()}; ${roles[spec.id].why}`);
  const stage1 = ['research', 'review', 'fan-out'].filter(id => roles[id]?.ai)
    .map(id => (`${id === 'review' ? review : pick(id)}` +
      " for " +
      `${id === 'research' ? 'current primary sources' : id === 'review' ? 'a critique of the context file' : 'independent research units'}`));
  const examples = [
    `| "What is current on this topic" | ${pick('research')}; ${roles.research.why} |`,
    `| "Audit this auth diff" | ${review} |`,
    `| "Classify these 200 items" | ${pick('bulk')} |`,
    ("| \"Research this topic properly\" | plan the question, collect primary sources and verify claims; see " +
      "`RESEARCH_TRIAGE.md` |")
  ];
  const researchRoles = ['research', 'review', 'bulk', 'fan-out'].filter(id => roles[id]?.ai)
    .map(id => `| ${ROLE_SPECS.find(spec => spec.id === id).job} | ${id === 'review' ? review : pick(id)} | ${roles[id].why} |`);
  researchRoles.push('| Triage + the durable record | the main agent | opens primary sources, marks every claim, writes the artifact |');
  const runLanes = new Map();
  for (const id of ['review', 'research', 'bulk', 'fan-out']) {
    const entry = roleRoute(id, assignment, ctx);
    if (entry?.command && !runLanes.has(entry.ai)) runLanes.set(entry.ai, entry.command);
  }
  const run = [...runLanes].map(([id, command]) =>
     `node bin/cli-run.mjs ${command.replace(/^cli-run /, '')} --brief "$BRIEF" --timeout 900 > research/out-${id}.md`);
  return {
    ...assignedRoles,
    ...tierRoles,
    TASK_LANES_TABLE: table(picks, ['Task type', 'Pick', 'Why']),
    COST_PLAYBOOK: cost.map((line, i) => `${i + 1}. ${line}`).join('\n'),
    FAN_OUT_ADVICE: roles['fan-out'] ? ` Many independent items each needing their own agent turn → ${pick('fan-out')}.` : '',
    METERED_CITATION_NOTE: metered ? ' Verify every supporting number and citation returned by a pay-per-token lane.' : '',
    RESEARCH_SELECTION_ADVICE: `Use ${pick('research')} for current primary sources. ${roles.research.why}. ` + (enabled.length >= 2
      ? ("Send a shared task brief to selected lanes with complementary capabilities; prefer different model " +
        "families for independent perspectives.")
      : 'Use a fresh context to challenge the sweep; add a different model family for independent research.') + ` For review, use ${review}.`,
    GAP_ANALYSIS_LANE: `${review}. Give it the same artifact and verify each finding before acting.`,
    LANE_STEP0: step0.length ? step0.map(line => '   - ' + line).join('\n') :
       ("   - no separate lane selected yet: use your main agent's tiers; keep local-only work off cloud " +
      "lanes and arrange independent review separately"),
    STAGE1_LANES: stage1.length ? '; ' + stage1.join('; ') : '',
    ATTACK_LANE: review,
    LIVE_LANE: `${pick('research')} for current sources, then`,
    BULK_LANE: `; assigned bulk route: ${pick('bulk')}`,
    LANE_EXAMPLES: examples.join('\n'),
    RESEARCH_ROLES: researchRoles.join('\n'),
    RESEARCH_RUN: run.length ? run.flatMap(command => ['# Or: ' + command.replace('node bin/cli-run.mjs', 'aunx cli-run'), command]).join('\n') :
       '# no separate cli-run assignment: run the sweep on your main agent, then a fresh-context self-check',
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
export const AGENT_ORDER = ['deep-planner', 'builder', 'code-reviewer', 'finding-verifier', 'live-researcher', 'bulk-worker', 'done-verifier', 'reader'];
export function agentIds(primary) {
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

export function routingRoles(primary) {
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
    ("Injected on every turn by the `route-gate` hook, so this table is read at runtime rather than " +
      "recalled from memory."),
    '',
    routeGateTable(selected, primary),
    '',
    ("Stay inline only when: (a) the brief would cost as much as the work itself, (b) the task needs this " +
      "conversation's own context, (c) it is the human's decision or the final verification of delegated " +
      "work (a delegate never verifies itself)."),
    '',
    ("When work depends on project rules, use a named agent that loads those rules. The built-in Explore " +
      "and Plan agents skip CLAUDE.md; give their rule-bound work to the matching named agent."),
    '',
    ("End every reply with a hidden marker: `<!-- route: <lane> | <why, a few words> -->`. The " +
      "route-metrics hook reads only the lane out of it, so routing coverage can be measured instead of " +
      "assumed."),
    '<!-- route-gate:end -->'
  ].join('\n');
}

// ROUTING.md / ORCHESTRATOR.md decision-tree rule 5 and the "Who builds"
// section read differently for claude-code, because only claude-code has the
// verified premise that its subagents load CLAUDE.md. Other agents verify
// rules and tool reach during Assign before handing off a section.
export function decisionRule5(primary) {
  return subagentsLoadRules(primary)
    ? ("5. **When the task changes files**, builder executes by default after Assign confirms its tools, " +
      "rules and context fit. The main agent briefs, combines sections, verifies and talks to the human. " +
      "Keep conversation-dependent decisions and final verification with the main agent. When rules matter, " +
      "use the matching named agent; the built-in Explore and Plan agents skip CLAUDE.md.")
    : ("5. **When the task changes files**, the main agent builds it directly until Assign verifies another " +
      "lane can carry the required tools, context and rules. Give a suitable delegate the whole scope and " +
      "its bounded section in a task brief.");
}
// ORCHESTRATOR.md's own decision tree already lists items 1-7 (see the
// template); this rule lands after all of them, so it continues that
// sequence as 8, not the "5" that fits ROUTING.md's shorter, differently
// ordered tree above (C4).
export function decisionRule5Beginner(primary) {
  return subagentsLoadRules(primary)
    ? ("8. **When the task changes files or executes a known plan**, builder executes by default after " +
      "checking its tools and rules. Use the working model tier for well-specified work and a planning " +
      "model for architecture. Keep conversation-dependent decisions and final verification with the main " +
      "agent.")
    : ("8. **When the task changes files or executes a known plan**, use the main agent's working model " +
      "tier. If another lane has the required tools and rules, give it a bounded section and a task brief.");
}
export function whoBuildsSection(primary) {
  return [
    '## Who builds',
    '',
    subagentsLoadRules(primary)
      ? ("**Builder executes by default when its capabilities fit.** A Claude Code subagent loads the project " +
        "CLAUDE.md hierarchy. Give it the context file, acceptance checks and whole scope in `TASK_BRIEF.md`. " +
        "When the task depends on conversation context, keep that section with the main agent.")
      : ("**Assign each section by tools, context and rules.** The main agent already holds the session " +
        "context. When another lane can carry the required context and permissions, give it the whole scope " +
        "and its section in `TASK_BRIEF.md`; otherwise build that section in the main agent."),
    '',
    ("When a decision belongs to the human, return it to them. When a section finishes, the main agent " +
      "combines it with the other sections and gives the final artifact to the independent reviewer."),
    '',
    ("When delegation costs as much as the bounded work itself, keep that work in the current session and " +
      "record the reason."),
    '',
    'Use the frontier class for a build, a fix or a judgment call.'
  ].join('\n');
}
export function addEndpointRow(primary) {
  return subagentsLoadRules(primary)
    ? '| "Add an endpoint" | builder after Assign confirms its capabilities, with a task brief |'
    : '| "Add an endpoint" | the main agent or another capable build lane chosen during Assign |';
}
export function inlineThresholdNote(primary) {
  return subagentsLoadRules(primary)
    ? ("\n- **Measure your inline threshold once.** A subagent starts with your CLAUDE.md and tool " +
      "definitions already loaded, so it has a fixed start-up cost before it does anything. Spawn one with " +
      "a one-line task and read its token count. Work smaller than that stays inline.")
    : '';
}
export function delegateRulesNote(primary) {
  return subagentsLoadRules(primary)
    ? ("Subagents, a fresh chat, a second window: a Claude Code subagent loads this project's CLAUDE.md " +
      "hierarchy, so it holds the standing rules already, just not this task's scope; a second CLI or a " +
      "fresh chat window may hold none of them.")
    : 'Subagents, a fresh chat, a second window: each one holds none of these rules.';
}

// Keep assignment guidance consistent across the routing and build protocols.
export function planBigExecuteSmallLine(primary) {
  return subagentsLoadRules(primary)
    ? ("- **Assign by job fit.** Use a planning model for architecture, assign scoped execution to builder, " +
      "and use a cheap model for mechanical work.")
    : ("- **Assign by job fit.** Match reach, context window and headroom to each section. When delegation " +
      "cannot carry its required rules, the main agent executes that section.");
}
export function rolesBuilderRow(primary) {
  return subagentsLoadRules(primary)
    ? [
        ("| Main agent | Frames, maps, assigns, combines sections, verifies, records | Keeps the whole scope " +
          "and names merge conflicts |"),
        '| Builder | Executes the assigned section from the task brief | Hands verification to an independent reviewer |'
      ].join('\n')
    : ("| Main agent / assigned builder | Executes each section whose tools and rules it holds | Gives the " +
      "reviewer the combined result and acceptance checks |");
}
export function builderHandoffNote(primary) {
  return subagentsLoadRules(primary)
    ? ("**Assign the build:** when a Claude Code subagent has the needed tools and rules, send it the scoped " +
      "task brief from `TASK_BRIEF.md`. Keep conversation-dependent decisions and the final verification " +
      "with the main agent.")
    : ("**Assign the build:** when another lane can hold the required context, tools and rules, give it the " +
      "whole scope and its section in `TASK_BRIEF.md`. When that transfer is impractical, build that " +
      "section in the main agent.");
}
