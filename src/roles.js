// Pure role assignment. The catalog supplies capabilities; this module orders
// those facts and renders the result without probing tools or touching files.
import { markdownCell } from './markdown.js';

const isMain = (ai, ctx) => ai.id === ctx.primary?.id;
const mainFirst = (ai, ctx) => isMain(ai, ctx) ? 0 : 1;
const knownContext = (ai) => ai.facts.contextWindow?.tokens ?? null;
const largestContext = (ai) => -(knownContext(ai) ?? -1);
const differentFamily = (ai, ctx) => Boolean(ctx.mainFamily && ai.facts.modelFamily && ai.facts.modelFamily !== ctx.mainFamily);
const familyFirst = (ai, ctx) => differentFamily(ai, ctx) ? 0 : 1;
const callable = (ai, ctx) => isMain(ai, ctx) || ai.facts.cliRun === true;
const inputRate = (ai) => ai.facts.billing === 'pay-per-token' ? ai.facts.pricing?.inPerM ?? null : null;
const factNote = (ai, key) => ai.factNotes?.[key] ? `; ${ai.factNotes[key]}` : '';
const billingReason = (ai) => ai.facts.billing === 'pay-per-token'
  ? `pay-per-token billing${ai.facts.pricing?.inPerM == null ? "; check your provider's rate" : `, stated input rate ${ai.facts.pricing.inPerM} per million tokens`}`
  : `${ai.facts.billing} billing`;

export function costRank(ai) {
  return { local: 0, free: 1, subscription: 2, 'pay-per-token': 3 }[ai.facts.billing] ?? Infinity;
}

const mainOrContext = (ai, ctx) => isMain(ai, ctx) ? 'main agent' : knownContext(ai) == null
  ? 'selection order; context capacity is unverified'
  : `largest known context among qualifying lanes (${knownContext(ai)} tokens)`;
const noReview = (ctx) => ctx.mainFamily
  ? `No AI from a different model family than ${ctx.mainFamily} is selected. Review in a fresh context on your main agent and treat the result as a self-check, not an independent review.`
  : 'The main agent model family is unverified, so independent review cannot be established. Review in a fresh context as a self-check.';
const noPrivate = () => 'Nothing in your stack runs on your own machine. Keep this work off every lane here.';
const noMain = () => 'No main agent is selected.';

export const ROLE_SPECS = [
  {
    id: 'plan', job: 'Architecture, ambiguity, unknown cause', tier: 'planning model',
    requires: callable, prefer: [mainFirst, largestContext], fallback: 'main', why: mainOrContext
  },
  {
    id: 'build', job: 'Implement a specified section', tier: 'working model',
    requires: (ai, ctx) => ai.facts.writesFiles === true && (isMain(ai, ctx) || (ai.facts.headless === true && ai.facts.cliRun === true)),
    prefer: [mainFirst, (ai) => ai.facts.loadsProjectRules === true ? 0 : 1, (ai) => ai.facts.agentDefinitions ? 0 : 1], fallback: 'main',
    why: (ai, ctx) => [isMain(ai, ctx) ? 'main agent' : 'writes files, headless cli-run lane', ai.facts.loadsProjectRules === true ? 'loads project rules' : ai.facts.loadsProjectRules === null ? 'project rules inheritance is unverified' : null].filter(Boolean).join(', ')
  },
  {
    id: 'review', job: 'Independent review of the final artifact', tier: 'working model',
    requires: (ai, ctx) => ai.facts.cliRun === true && differentFamily(ai, ctx),
    prefer: [(ai) => ai.facts.readOnlyMode === true ? 0 : 1, costRank], fallback: 'none', noneReason: noReview,
    why: (ai, ctx) => `different model family from ${ctx.mainFamily}${ai.facts.readOnlyMode === true ? ', read-only mode available' : `, ${billingReason(ai)}`}`
  },
  {
    id: 'verify', job: 'Reproduce a finding, check a definition of done', tier: 'working model',
    requires: callable, prefer: [familyFirst, costRank, mainFirst], fallback: 'main',
    why: (ai, ctx) => differentFamily(ai, ctx)
      ? `different model family from the author (${ctx.mainFamily}), ${billingReason(ai)}`
      : `${isMain(ai, ctx) ? 'main agent' : billingReason(ai)}${!ai.facts.modelFamily || !ctx.mainFamily ? '; model family is unverified' : ''}`
  },
  {
    id: 'research', job: 'Current primary sources, live web or social', tier: 'working model',
    requires: (ai) => ai.facts.liveWeb === true, prefer: [costRank], fallback: 'main',
    why: (ai) => `states live web tools, ${billingReason(ai)}; ties follow selection order${factNote(ai, 'liveWeb')}`
  },
  {
    id: 'bulk', job: 'Many similar items, cheap', tier: 'cheap model',
    requires: (ai) => ai.facts.headless === true && ai.facts.cliRun === true,
    prefer: [costRank, inputRate], fallback: 'main',
    why: (ai, ctx) => `${billingReason(ai)}, headless${!isMain(ai, ctx) && ctx.level >= 2 && routeVia(ai, ctx.primary) === 'cli-run' ? ', runs through cli-run' : ''}; ties follow selection order`
  },
  {
    id: 'read', job: 'Digest many files, return cited facts', tier: 'cheap model',
    requires: () => true, prefer: [mainFirst, largestContext], fallback: 'main', why: mainOrContext
  },
  {
    id: 'private', job: 'Work that must not leave the machine', tier: 'working model',
    requires: (ai) => ai.facts.runsLocally === true, prefer: [], fallback: 'none', noneReason: noPrivate,
    why: () => 'runs on your machine'
  },
  {
    id: 'fan-out', job: 'N independent units in one call', tier: 'working model', conditional: true,
    requires: (ai) => ai.facts.fanOut === true, prefer: [costRank], fallback: 'none',
    why: (ai) => `one call starts several children, ${billingReason(ai)}${factNote(ai, 'fanOut')}`
  },
  {
    id: 'long-context', job: 'One document larger than the main agent holds', tier: 'planning model', conditional: true,
    requires: (ai, ctx) => ctx.mainContext !== null && knownContext(ai) !== null && knownContext(ai) > ctx.mainContext,
    prefer: [largestContext], fallback: 'none',
    why: (ai, ctx) => `known context of ${knownContext(ai)} tokens exceeds the main agent's ${ctx.mainContext}`
  }
];

function routeVia(ai, primary) {
  if (ai.id === primary?.id) return 'main-agent';
  if (ai.facts.runsLocally === true) return 'local';
  if (ai.facts.cliRun === true) return 'cli-run';
  // Agent definitions belong to their own main agent. A different selected AI
  // gets no subagent route merely because it can store such definitions.
  return 'manual';
}

export function assignRoles({ selected, primary, detected = new Set(), plans = {}, level = 2 }) {
  // PATH detection and stated plan headroom are advisory, not role qualifiers.
  void detected;
  void plans;
  const ctx = { primary, level, mainFamily: primary?.facts.modelFamily ?? null, mainContext: primary?.facts.contextWindow?.tokens ?? null };
  const roles = {};
  for (const spec of ROLE_SPECS) {
    const pool = selected.filter((ai) => spec.requires(ai, ctx));
    if (!pool.length) {
      if (spec.conditional) continue;
      if (spec.fallback === 'main' && primary) {
        const why = spec.id === 'research'
          ? 'No selected AI states live web tools; capability is unverified. The main agent carries it; verify it has the required tools.'
          : 'No separate lane qualifies; the main agent carries it.';
        roles[spec.id] = { ai: primary.id, via: 'main-agent', tier: spec.tier, why };
      } else {
        roles[spec.id] = { ai: null, via: 'none', tier: spec.tier, why: (spec.noneReason || noMain)(ctx) };
      }
      continue;
    }
    pool.sort((a, b) => {
      for (const key of spec.prefer) {
        const x = key(a, ctx), y = key(b, ctx);
        if (x != null && y != null && x !== y) return x < y ? -1 : 1;
      }
      return selected.indexOf(a) - selected.indexOf(b);
    });
    const winner = pool[0];
    roles[spec.id] = { ai: winner.id, via: routeVia(winner, primary), tier: spec.tier, why: spec.why(winner, ctx) };
  }
  return { roles, unassigned: Object.entries(roles).filter(([, role]) => role.ai === null).map(([id]) => id) };
}

// `agents` is the installer's role -> installed definition name map. Keeping
// that explicit means this pure module never guesses whether a file was written.
export function roleRoute(roleId, assignment, { selected = [], primary = null, agents = {} } = {}) {
  const role = assignment.roles[roleId];
  if (!role) return null;
  const out = { ...role };
  const ai = selected.find((item) => item.id === role.ai);
  if (role.ai === null) {
    out.reason = role.why;
  } else if (role.via === 'cli-run' && ai?.facts.cliRun === true) {
    out.command = `cli-run ${ai.bin}${['review', 'verify'].includes(roleId) && ai.facts.readOnlyMode === true ? ' --audit' : ''}`;
    // The host knows its connected tools. The standalone CLI command remains
    // usable without an MCP installation; it cannot call host-owned tools.
    if (ai.id === 'claude-code') out.preferredTransport = 'mcp';
  } else if (role.ai === primary?.id && primary.facts.agentDefinitions && agents[roleId]) {
    out.agent = agents[roleId];
  }
  return out;
}

export function manifestRoles(assignment, context = {}) {
  return Object.fromEntries(Object.keys(assignment.roles).map((id) => [id, roleRoute(id, assignment, context)]));
}

export function roleHow(role, { selected = [], primary = null } = {}) {
  if (role.ai === null) return role.reason?.startsWith('Nothing in your stack') ? 'keep it off every lane here' : 'fresh-context self-check on your main agent';
  const ai = selected.find((item) => item.id === role.ai);
  const tier = `${role.tier} tier`;
  if (role.preferredTransport === 'mcp') return `connected Claude worker MCP when available; fallback \`aunx ${role.command}\`, ${tier}`;
  if (role.command) return `\`aunx ${role.command}\`, ${tier}`;
  if (role.via === 'local') return `${ai?.bin ? `\`${ai.bin}\`` : 'local runtime'} on your machine, ${tier}`;
  if (ai?.facts.kind === 'chat') return `paste the work into your ${role.ai === primary?.id ? 'main agent' : 'chat app'}, ${tier}`;
  if (role.agent) return `\`${role.agent}\` on your main agent, ${tier}`;
  if (role.via === 'main-agent') return `on your main agent, ${tier}`;
  return `manual handoff, ${tier}`;
}

export function roleTable(assignment, { selected = [], primary = null, detected = new Set(), agents = {} } = {}) {
  const context = { selected, primary, agents };
  const rows = ROLE_SPECS.filter((spec) => assignment.roles[spec.id]).map((spec) => {
    const role = roleRoute(spec.id, assignment, context);
    const ai = selected.find((item) => item.id === role.ai);
    const name = ai ? `${ai.name}${detected.has(ai.id) ? ' (detected on PATH)' : ''}` : 'none selected';
    return `| ${[spec.job, name, roleHow(role, context), role.why].map(markdownCell).join(' | ')} |`;
  });
  return [
    '## Your stack: who does what', '',
    'Assigned from the AIs you selected and what each one can do. Re-run the installer to reassign.', '',
    '| Job | Goes to | How | Why this one |', '|---|---|---|---|', ...rows
  ].join('\n');
}

export function inferPrimary(candidates) {
  const rank = (ai) => ai.facts.loadsProjectRules === true && ai.facts.agentDefinitions ? 0
    : ai.facts.agentDefinitions ? 1
      : ai.facts.kind === 'agent-cli' && ai.rulesFile ? 2
        : ai.facts.kind === 'agent-cli' ? 3 : 4;
  return [...candidates].sort((a, b) => rank(a) - rank(b) || candidates.indexOf(a) - candidates.indexOf(b))[0];
}
