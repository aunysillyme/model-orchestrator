import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { render } from '../render.js';
import { assignRoles, manifestRoles } from '../roles.js';
import { LANE_FLAGS } from '../../bin/cli-run.mjs';
import { MODEL_POLICY } from '../catalog.js';
import { validateSnapshot } from '../models.js';
import { GENERATOR_VERSION, sha256, TEMPLATES, CLI_RUN_SRC } from './shared.js';
import { stackContext } from './routing.js';
import { vars } from './docs.js';

export function walk(dir, base = dir) {
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
export function installable(sub, rel) {
  if (rel !== 'README.md') return true;
  return sub === 'common';
}

// Build the list of files this run would write. Pure: touches no disk except
// reading templates, so tests and --dry can inspect it.
export function planFiles(opts) {
  const { level, selected, primary } = opts;
  if (opts.models) {
    validateSnapshot(opts.models);
    if (primary?.id !== 'claude-code') throw new Error('models snapshot requires Claude Code as the main agent');
  }
  const v = vars(opts);
  const files = [];
  // root: 'dir' (the docs folder) or 'project' (where the agent actually looks for subagents)
  const add = (rel, content, mode, root = 'dir') => files.push({ rel, content, mode: mode || 0o644, root });
  const renderAgent = (raw) => {
    let content = render(raw, v);
    const tier = raw.match(/^Tier: ((?:planning|working|cheap) model)\./m)?.[1];
    const resolvedTier = Object.entries(MODEL_POLICY.tiers).find(([, policy]) => policy.label === tier)?.[0];
    const model = opts.models?.tiers[resolvedTier]?.value ?? opts.plans?.[primary?.id]?.tierModels?.[tier];
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
    add(join('.claude', 'hooks', 'subagent-context.mjs'), render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'subagent-context.mjs'),
       'utf8'), v), 0o755, 'project');
    // route-metrics.mjs (0.1.16), claude-code only: five events (UserPromptSubmit,
    // PreToolUse on Agent|Task, SubagentStart, SubagentStop, Stop) turned into one
    // JSON line each under ~/.ai-orchestrator/, so a routing rule nobody measures
    // is not a rule nobody knows is followed.
    add(join('.claude', 'hooks', 'route-metrics.mjs'), render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'route-metrics.mjs'), 'utf8'), v),
       0o755, 'project');
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
          enabled: selected.filter((a) => a.facts.cliRun).map((a) => a.bin),
          defaults: Object.fromEntries((opts.effortAuto || []).map((id) => [selected.find(a => a.id === id)?.bin || id, { effort: 'auto' }])),
          note: 'Lanes cli-run may call. Edit to enable or disable a lane. A lane not listed here exits 13 (unavailable).',
          defaultsNote: 'Pin what a lane runs with, so the route in your docs is the route that runs: "defaults": {"' + (selected.find(a =>
             a.facts.cliRun)?.bin || '<lane>') + '": ' + JSON.stringify({ model: '<model-id>', ...(LANE_FLAGS[selected.find(a =>
                a.facts.cliRun)?.bin]?.effort ? { effort: 'high' } : {
                  }) }) + ("}. Left empty, a lane inherits its own config file, which cli-run cannot see and does not guess. " +
            "`--model` and `--effort` override this per call, and `--doctor` prints what each lane is pinned to. " +
            "Every enabled lane takes a model; the runner reports which lanes support an effort flag. Hermes also " +
            "takes \"provider\" beside \"model\", so the model goes to a provider that serves it.")
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
  // edited (kept, reported as a conflict). Machine-owned: planned every run.
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
          roles: manifestRoles(assignRoles({ selected, primary, detected: opts.detected, plans: opts.plans, level }), stackContext(selected,
             primary, opts.detected)),
          tools: (opts.tools || []).map((t) => t.id),
          apis: (opts.apis || []).map((p) => p.id),
          ...(Object.keys(opts.plans || {}).length ? { plans: Object.fromEntries(Object.entries(opts.plans).sort(([a], [b]) =>
             a.localeCompare(b)).map(([id, p]) => [id, p.id])) } : {}),
          ...((opts.effortAuto || []).length ? { effortAuto: [...opts.effortAuto].sort() } : {}),
          ...(opts.models ? { models: opts.models } : {}),
          dir: resolve(opts.dir || 'ai-orchestrator'),
          project: resolve(opts.project || process.cwd()),
          files: fileHashes,
          note: 'Machine-owned. Refreshed on every run; unchanged bytes are kept. Edit the docs, not this.'
        },
        null,
        2
      ) + '\n'
  });

  return files;
}
