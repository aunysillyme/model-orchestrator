import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { suggestRoute } from '../../src/aunx.js';
import { MODEL_POLICY } from '../../src/catalog.js';
import { renderPage } from './render.js';
import { clean, entry, fixtureEnv, isMain, readResults, RESULTS, ROOT, run, scratch, stubLane } from './lib.js';

const RATE_BY_FAMILY = Object.fromEntries(
  Object.entries(MODEL_POLICY.tiers).map(([tier, cfg]) => [cfg.family, { tier, ...cfg }])
);
const TIER_BY_LABEL = Object.fromEntries(
  Object.entries(MODEL_POLICY.tiers).map(([tier, cfg]) => [cfg.label, { tier, ...cfg }])
);
const PRICING_PER_M = Object.fromEntries(
  Object.entries(MODEL_POLICY.tiers).map(([, cfg]) => [cfg.family, { in: cfg.price_in, out: cfg.price_out }])
);

const CHANGELOG_TEXT = [
  'a: Stop CLI timeouts from leaving orphaned background child processes',
  'b: Reject unpinned container tags during advisory validation',
  'c: Drop legacy v0 installer alias flag from usage banner',
  'd: Print per-lane token totals alongside summary',
  'e: Move project backups directory inside rules folder'
].join('\n');

const CLI_HELP_TEXT = [
  'Usage: tool [--yes] [--dir PATH] [--dry]',
  'Options:',
  '  --yes       accept confirmation prompt',
  '  --dir PATH  write configuration into PATH',
  '  --dry       preview planned writes without disk writes',
  'Exits 16 when the prompt exceeds command limits.'
].join('\n');

const STDERR_SNIPPETS = [
  'a: HTTP 429 rate limit exceeded: try again in 12 minutes',
  'b: Error: expired login session; sign in again to continue',
  'c: Error: model foo is invalid for this endpoint (HTTP 400)',
  'd: Process exceeded 30000 ms deadline and was terminated'
].join('\n');

const DOC_LINES = [
  '1: Install with npx model-orchestrator@1.1.3 --yes.',
  '2: Set CONFIG_DIR=/Users/alex/project/rules before running.',
  '3: The command prints JSON on stdout when passed --json.',
  '4: Integration checks cover Linux, macOS and Windows.',
  '5: The suite covers 412 cases with zero external calls.',
  '6: Pin exact version with npx tool-cli@next.',
  '7: Run npm test from the repository root after editing.'
].join('\n');

const WEBHOOK_CODE = [
  '1: export function handleWebhook(req, signingKey) {',
  '2:   const payload = JSON.parse(req.rawBody);',
  '3:   const expected = hmacSha256Hex(signingKey, req.rawBody);',
  '4:   if (req.headers["x-sig"] !== expected) return 401;',
  '5:   return processEvent(payload);',
  '6: }'
].join('\n');

const ROLLOUT_STEPS = [
  'a: Remove fallback reads and dual writes for the old field name.',
  'b: Enable dual writes and fallback reads supporting both old and new fields.',
  'c: Switch primary reads to prefer the new field name after parity passes.',
  'd: Backfill existing stored records so every record carries the new field.'
].join('\n');

export const TASKS = [
  {
    id: 'changelog-classify',
    prompt: [
      'Classify each release entry (a..e) into exactly one Keep a Changelog category:',
      'Added, Changed, Fixed, Security, Removed.',
      CHANGELOG_TEXT,
      'Return ONLY a JSON object with keys a, b, c, d, e.'
    ].join('\n'),
    expected: { a: 'Fixed', b: 'Security', c: 'Removed', d: 'Added', e: 'Changed' },
    grade(obj) {
      return Boolean(obj) && ['a', 'b', 'c', 'd', 'e'].every(k => obj[k] === this.expected[k]);
    }
  },
  {
    id: 'flag-extract',
    prompt: [
      'Read these CLI reference documents and return ONLY JSON matching:',
      '{"options":[{"flag":"--name","takesValue":true}],"limitExit":0}',
      'List all 3 options in order with accurate types and exit code.',
      CLI_HELP_TEXT
    ].join('\n'),
    expected: {
      options: [
        { flag: '--yes', takesValue: false },
        { flag: '--dir', takesValue: true },
        { flag: '--dry', takesValue: false }
      ],
      limitExit: 16
    },
    grade(obj) {
      if (!obj || obj.limitExit !== 16 || !Array.isArray(obj.options) || obj.options.length !== 3) return false;
      return this.expected.options.every((exp, i) => obj.options[i]?.flag === exp.flag &&
        obj.options[i]?.takesValue === exp.takesValue);
    }
  },
  {
    id: 'failure-triage',
    prompt: [
      'Classify each stderr snippet (a..d) into one label: expired-session, quota, rejected, timeout.',
      STDERR_SNIPPETS,
      'Return ONLY a JSON object with keys a, b, c, d.'
    ].join('\n'),
    expected: { a: 'quota', b: 'expired-session', c: 'rejected', d: 'timeout' },
    grade(obj) {
      return Boolean(obj) && ['a', 'b', 'c', 'd'].every(k => obj[k] === this.expected[k]);
    }
  },
  {
    id: 'prose-audit',
    prompt: [
      'Verify acceptance checks on these 7 doc lines (no /Users/ path, no "N cases" count, no @next tag).',
      'Return ONLY JSON {"violations":[...]} with offending 1-based line numbers sorted ascending.',
      DOC_LINES
    ].join('\n'),
    expected: { violations: [2, 5, 6] },
    grade(obj) {
      return Boolean(obj) && Array.isArray(obj.violations) && obj.violations.length === 3 &&
        obj.violations[0] === 2 && obj.violations[1] === 5 && obj.violations[2] === 6;
    }
  },
  {
    id: 'webhook-review',
    prompt: [
      'Review this numbered JS webhook handler and identify its two validation defects.',
      WEBHOOK_CODE,
      'Return ONLY JSON {"defectLines":[n1,n2],"safeCompareFn":"name"} using 1-based line numbers',
      'sorted ascending and the Node crypto constant-time comparison function name.'
    ].join('\n'),
    expected: { defectLines: [2, 4], safeCompareFn: 'timingSafeEqual' },
    grade(obj) {
      if (!obj || !Array.isArray(obj.defectLines) || typeof obj.safeCompareFn !== 'string') return false;
      const linesOk = obj.defectLines.length === 2 && obj.defectLines[0] === 2 && obj.defectLines[1] === 4;
      const fnOk = obj.safeCompareFn.toLowerCase().includes('timingsafeequal');
      return linesOk && fnOk;
    }
  },
  {
    id: 'rollout-plan',
    prompt: [
      'Design and plan the safe zero-downtime rollout sequence for renaming a persisted config field.',
      ROLLOUT_STEPS,
      'Return ONLY JSON {"order":["a|b|c|d",...]} ordering all 4 step letters from first to last.'
    ].join('\n'),
    expected: { order: ['b', 'd', 'c', 'a'] },
    grade(obj) {
      if (!obj || !Array.isArray(obj.order) || obj.order.length !== 4) return false;
      return ['b', 'd', 'c', 'a'].every((letter, i) => obj.order[i] === letter);
    }
  }
];

export function routeForTask(task) {
  const suggestion = suggestRoute(task.prompt);
  if (!suggestion || !TIER_BY_LABEL[suggestion.tier]) {
    throw new Error(`No tier mapping from aunx route for task ${task.id}`);
  }
  return { suggestion, tierCfg: TIER_BY_LABEL[suggestion.tier] };
}

function extractJson(text) {
  if (typeof text !== 'string') return null;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(candidate.slice(start, end + 1)); } catch { return null; }
}

function tierForModelId(modelId) {
  for (const [family, info] of Object.entries(RATE_BY_FAMILY)) {
    if (typeof modelId === 'string' && modelId.includes(family)) return info;
  }
  return null;
}

function installHookContext(dir) {
  const project = join(dir, 'proj');
  const rulesDir = join(project, 'ai-orchestrator');
  const inst = run([
    join(ROOT, 'bin', 'cli.js'), '--yes', '--level', '1', '--ais', 'claude-code',
    '--primary', 'claude-code', '--project', project, '--dir', rulesDir, '--apply-snippets'
  ]);
  if (inst.status !== 0) throw new Error(`Installer setup failed: ${inst.stderr}`);
  const hookEnv = { ...process.env, CLAUDE_PROJECT_DIR: project };
  const rg = spawnSync(process.execPath, [join(project, '.claude', 'hooks', 'route-gate.mjs')], {
    input: '', encoding: 'utf8', env: hookEnv, timeout: 10000
  });
  if (rg.status !== 0) throw new Error(`route-gate hook failed: ${rg.stderr}`);
  const sc = spawnSync(process.execPath, [join(project, '.claude', 'hooks', 'subagent-context.mjs')], {
    input: '', encoding: 'utf8', env: hookEnv, timeout: 10000
  });
  if (sc.status !== 0) throw new Error(`subagent-context hook failed: ${sc.stderr}`);
  const routeGateText = JSON.parse(rg.stdout).hookSpecificOutput.additionalContext;
  const subagentText = JSON.parse(sc.stdout).hookSpecificOutput.additionalContext;
  return {
    project,
    routeGateText,
    subagentText,
    routeTableBytes: Buffer.byteLength(routeGateText, 'utf8'),
    subagentContextBytes: Buffer.byteLength(subagentText, 'utf8')
  };
}

function callClaude({ bin, prompt, family, cwd, env }) {
  const args = [
    '-p', prompt, '--model', family, '--output-format', 'json', '--setting-sources', '',
    '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--tools', ''
  ];
  const exec = bin.endsWith('.cjs') ? process.execPath : bin;
  const execArgs = bin.endsWith('.cjs') ? [bin, ...args] : args;
  const res = spawnSync(exec, execArgs, { cwd, env, encoding: 'utf8', timeout: 60000 });
  if (res.error) throw res.error;
  if (res.status !== 0) throw new Error(`claude exited ${res.status}: ${(res.stderr || res.stdout).slice(0, 300)}`);
  const parsed = JSON.parse(res.stdout);
  if (parsed.is_error) throw new Error(`claude returned error: ${parsed.result}`);
  const fallbackRates = PRICING_PER_M[family];
  let inputTokens = 0;
  let cacheCreationTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let listUsd = 0;
  const tiersUsed = new Set();
  for (const [modelKey, stats] of Object.entries(parsed.modelUsage || {})) {
    const tierInfo = tierForModelId(modelKey);
    const rates = tierInfo ? { in: tierInfo.price_in, out: tierInfo.price_out } : fallbackRates;
    tiersUsed.add(tierInfo ? tierInfo.tier : RATE_BY_FAMILY[family].tier);
    const inp = stats.inputTokens || 0;
    const cc = stats.cacheCreationInputTokens || 0;
    const cr = stats.cacheReadInputTokens || 0;
    const out = stats.outputTokens || 0;
    inputTokens += inp;
    cacheCreationTokens += cc;
    cacheReadTokens += cr;
    outputTokens += out;
    listUsd += ((inp + cc + cr) * rates.in + out * rates.out) / 1e6;
  }
  const totalTokens = inputTokens + cacheCreationTokens + cacheReadTokens + outputTokens;
  return {
    answer: extractJson(parsed.result),
    tiersUsed: [...tiersUsed],
    inputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    outputTokens,
    totalTokens,
    listUsd,
    reportedUsd: typeof parsed.total_cost_usd === 'number' ? parsed.total_cost_usd : 0
  };
}

function summarizeArm(runs) {
  const sum = key => runs.reduce((acc, r) => acc + r[key], 0);
  const passed = runs.filter(r => r.passed).length;
  return {
    passed,
    totalTasks: runs.length,
    inputTokens: sum('inputTokens'),
    cacheCreationTokens: sum('cacheCreationTokens'),
    cacheReadTokens: sum('cacheReadTokens'),
    outputTokens: sum('outputTokens'),
    totalTokens: sum('totalTokens'),
    listUsd: Number(sum('listUsd').toFixed(6)),
    reportedUsd: Number(sum('reportedUsd').toFixed(6))
  };
}

function pctChange(base, next) {
  return Number((((next - base) / base) * 100).toFixed(2));
}

export function measureRoutingAb({ bin = 'claude', env = process.env, live = true } = {}) {
  const dir = scratch();
  try {
    const hooks = installHookContext(dir);
    const controlRuns = [];
    const routedRuns = [];
    const deep = MODEL_POLICY.tiers.deep;
    const fast = MODEL_POLICY.tiers.fast;

    const runOne = (task, arm) => {
      const routed = arm === 'routed';
      const { suggestion, tierCfg } = routeForTask(task);
      const selectedCfg = routed ? tierCfg : deep;
      const prefix = routed
        ? (selectedCfg.tier !== 'deep' ? `${hooks.routeGateText}\n${hooks.subagentText}\n\n` : `${hooks.routeGateText}\n\n`)
        : '';
      const fullPrompt = `${prefix}Follow only the task specification below.\n${task.prompt}`;
      const call = callClaude({ bin, prompt: fullPrompt, family: selectedCfg.family, cwd: hooks.project, env });
      return {
        taskId: task.id,
        routedTier: selectedCfg.tier,
        routedAgent: suggestion.agent,
        passed: task.grade(call.answer),
        promptBytes: Buffer.byteLength(fullPrompt, 'utf8'),
        inputTokens: call.inputTokens,
        cacheCreationTokens: call.cacheCreationTokens,
        cacheReadTokens: call.cacheReadTokens,
        outputTokens: call.outputTokens,
        totalTokens: call.totalTokens,
        listUsd: call.listUsd,
        reportedUsd: call.reportedUsd
      };
    };

    TASKS.forEach((task, i) => {
      if (i % 2 === 0) {
        controlRuns.push(runOne(task, 'control'));
        routedRuns.push(runOne(task, 'routed'));
      } else {
        routedRuns.push(runOne(task, 'routed'));
        controlRuns.push(runOne(task, 'control'));
      }
    });

    const control = summarizeArm(controlRuns);
    const routed = summarizeArm(routedRuns);
    const listCostChangePct = pctChange(control.listUsd, routed.listUsd);
    const reportedCostChangePct = control.reportedUsd > 0 ? pctChange(control.reportedUsd, routed.reportedUsd) : null;
    const totalTokenChangePct = pctChange(control.totalTokens, routed.totalTokens);
    const tierCounts = routedRuns.reduce((acc, r) => { acc[r.routedTier] = (acc[r.routedTier] || 0) + 1; return acc; }, {});
    const scope = live
      ? 'Single-turn print-mode A/B against claude CLI'
      : 'Synthetic offline fixture (single-turn stub)';

    const method = [
      `${scope} across ${TASKS.length} fixed tasks: control runs every task on the planning tier; routed`,
      `classifies each prompt with aunx route (${tierCounts.fast || 0} cheap, ${tierCounts.standard || 0} working,`,
      `${tierCounts.deep || 0} planning), prepends installed route-gate (${hooks.routeTableBytes} B on all prompts)`,
      `and subagent-context (${hooks.subagentContextBytes} B on delegated tiers), and runs single-turn on the`,
      'suggested tier (excludes multi-turn subagent handoff turns). Alternating order per task. Counts every token',
      `(input + cache write + cache read + output), uncached MODEL_POLICY list prices ($${deep.price_in}/$${deep.price_out}`,
      `vs $${fast.price_in.toFixed(2)}/$${fast.price_out.toFixed(2)} per MTok): control ${control.totalTokens} tokens`,
      `($${control.listUsd.toFixed(4)} list, $${control.reportedUsd.toFixed(4)} reported,`,
      `${control.passed}/${control.totalTasks} pass) vs routed ${routed.totalTokens} tokens`,
      `($${routed.listUsd.toFixed(4)} list, $${routed.reportedUsd.toFixed(4)} reported,`,
      `${routed.passed}/${routed.totalTasks} pass).`
    ].join(' ');

    const base = entry(
      'routing-ab-cost-pct',
      'Routing A/B whole-run list-price cost',
      listCostChangePct,
      '% list-price USD change',
      TASKS.length,
      method,
      'routing-ab.js',
      {
        overhead: {
          routeTableBytes: hooks.routeTableBytes,
          subagentContextBytes: hooks.subagentContextBytes
        },
        control,
        routed,
        deltas: {
          totalTokenChangePct,
          listCostChangePct,
          reportedCostChangePct,
          passRateControl: `${control.passed}/${control.totalTasks}`,
          passRateRouted: `${routed.passed}/${routed.totalTasks}`
        },
        tasks: controlRuns.map((c, idx) => ({
          id: c.taskId,
          routedTier: routedRuns[idx].routedTier,
          routedAgent: routedRuns[idx].routedAgent,
          controlTokens: c.totalTokens,
          routedTokens: routedRuns[idx].totalTokens,
          controlListUsd: Number(c.listUsd.toFixed(6)),
          routedListUsd: Number(routedRuns[idx].listUsd.toFixed(6)),
          controlPassed: c.passed,
          routedPassed: routedRuns[idx].passed
        }))
      }
    );
    base.kind = live ? 'author-setup' : 'reproducible';
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + 30);
    base.expiresAt = now.toISOString().slice(0, 10);
    return base;
  } finally {
    clean(dir);
  }
}

export function measureRoutingAbFixture() {
  const dir = scratch();
  try {
    const answers = Object.fromEntries(TASKS.map(t => [t.id, t.expected]));
    const { deep, standard, fast } = MODEL_POLICY.tiers;
    const stubSource = `
      const args = process.argv.slice(2);
      const prompt = args[args.indexOf('-p') + 1] || '';
      const family = args[args.indexOf('--model') + 1] || '${deep.family}';
      const answers = ${JSON.stringify(answers)};
      let pick = null;
      if (prompt.includes(${JSON.stringify(CHANGELOG_TEXT.slice(0, 20))})) pick = answers['changelog-classify'];
      else if (prompt.includes('CLI reference documents')) pick = answers['flag-extract'];
      else if (prompt.includes('rate limit exceeded')) pick = answers['failure-triage'];
      else if (prompt.includes('CONFIG_DIR=')) pick = answers['prose-audit'];
      else if (prompt.includes('handleWebhook')) pick = answers['webhook-review'];
      else if (prompt.includes('zero-downtime')) pick = answers['rollout-plan'];
      const hasOverhead = prompt.includes('route-gate:start');
      const inp = hasOverhead ? 1400 : 900;
      const out = family === '${fast.family}' ? 90 : family === '${standard.family}' ? 150 : 220;
      const rateIn = family === '${fast.family}' ? ${fast.price_in} : family === '${standard.family}' ? ${standard.price_in} : ${deep.price_in};
      const rateOut = family === '${fast.family}' ? ${fast.price_out} : family === '${standard.family}' ? ${standard.price_out} : ${deep.price_out};
      const usd = (inp * rateIn + out * rateOut) / 1e6;
      const key = 'fixture-' + family;
      process.stdout.write(JSON.stringify({
        is_error: false,
        result: JSON.stringify(pick),
        total_cost_usd: usd,
        modelUsage: {
          [key]: {
            inputTokens: inp,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
            outputTokens: out,
            costUSD: usd
          }
        }
      }));
    `;
    const bin = stubLane(dir, 'claude', stubSource);
    return measureRoutingAb({ bin, env: fixtureEnv(dir), live: false });
  } finally {
    clean(dir);
  }
}

if (isMain(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const live = args.has('--live');
  const write = args.has('--write');
  if (write && !live) {
    console.error('routing-ab: --write requires --live so synthetic fixtures never overwrite live proof data');
    process.exit(2);
  }
  const item = live ? measureRoutingAb({ live: true }) : measureRoutingAbFixture();
  if (write) {
    let data = { schemaVersion: 1, environment: { node: process.version, platform: process.platform, arch: process.arch }, entries: [] };
    if (existsSync(RESULTS)) data = readResults();
    data.entries = [...data.entries.filter(e => e.id !== item.id), item];
    writeFileSync(resolve(RESULTS), JSON.stringify(data, null, 2) + '\n');
    renderPage();
  }
  console.log(JSON.stringify(item, null, 2));
}
