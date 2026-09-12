// The Claude Code plugin bundle under plugin/ (0.1.20). Generated from the installer's templates by
// scripts/gen-plugin.js; these tests hold the bundle to the same bar a plugin marketplace review does,
// without a network clone: the verifier rules below are ported from the public plugin verification
// methodology the bundle was gated on before release, and each one is proved red against a real file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { planPluginFiles, pluginManifest, PLUGIN_DIR, ROOT, PLUGIN_HOOKS, HAND_OWNED, DEFAULT_RULES, PLUGIN_NAME } from '../src/plugin.js';
import { claudeAgentIds, planFiles, TEMPLATES } from '../src/install.js';
import { byId } from '../src/catalog.js';

function walkRel(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkRel(p));
    else out.push(p);
  }
  return out;
}
const pluginFiles = () => walkRel(PLUGIN_DIR).map((p) => relative(PLUGIN_DIR, p).split(sep).join('/'));
const readPlugin = (rel) => readFileSync(join(PLUGIN_DIR, ...rel.split('/')), 'utf8');

// ---- generator drift ----

test('the committed plugin/ bundle is byte-for-byte what npm run gen:plugin generates', () => {
  const plan = planPluginFiles();
  for (const f of plan) {
    assert.ok(existsSync(join(PLUGIN_DIR, ...f.rel.split('/'))), `plugin/${f.rel} is missing; run npm run gen:plugin`);
    assert.equal(readPlugin(f.rel), f.content, `plugin/${f.rel} drifted from its template; run npm run gen:plugin`);
  }
  // The loud negative: a file in plugin/ that neither the generator nor a person owns is a stray copy.
  const known = new Set([...plan.map((f) => f.rel), ...HAND_OWNED]);
  for (const rel of pluginFiles()) assert.ok(known.has(rel), `plugin/${rel} is neither generated nor hand-owned (src/plugin.js HAND_OWNED)`);
});

test('the drift check can go red', () => {
  const plan = planPluginFiles();
  const hook = plan.find((f) => f.rel === 'hooks/route-gate.mjs');
  assert.notEqual(hook.content + '\n// hand edit', hook.content);
  assert.ok(plan.some((f) => f.rel === 'agents/builder.md'), 'the plan must include the agents it is meant to guard');
});

test('plugin.json version is package.json version, and the marketplace entry points at plugin/', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const manifest = JSON.parse(readPlugin('.claude-plugin/plugin.json'));
  assert.equal(manifest.version, pkg.version, 'bump the version, then npm run gen:plugin');
  assert.equal(manifest.name, PLUGIN_NAME);
  for (const k of ['name', 'version', 'license', 'description']) assert.ok(manifest[k], `plugin.json lacks ${k}`);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const entry = market.plugins.find((p) => p.name === manifest.name);
  assert.ok(entry, 'marketplace.json has no entry named ' + manifest.name);
  assert.equal(resolve(ROOT, entry.source), PLUGIN_DIR, 'the marketplace entry must resolve to plugin/');
  assert.ok(!('version' in entry), 'the version lives in plugin.json only; a second copy here would drift');
  assert.deepEqual(pluginManifest(), manifest);
});

// ---- hooks.json and hook safety ----

function hookCommands() {
  const config = JSON.parse(readPlugin('hooks/hooks.json'));
  const cmds = [];
  for (const groups of Object.values(config.hooks)) for (const g of groups) for (const h of g.hooks) cmds.push(h);
  return cmds;
}

test('every ${CLAUDE_PLUGIN_ROOT} reference in hooks.json resolves to a shipped hook, in exec form', () => {
  const refs = new Set();
  for (const h of hookCommands()) {
    assert.equal(h.type, 'command');
    assert.equal(h.command, 'node', 'exec form with node: no shell, and it runs on Windows');
    assert.ok(Array.isArray(h.args), 'exec form needs args');
    for (const a of h.args) {
      if (!a.includes('${CLAUDE_PLUGIN_ROOT}')) continue;
      const rel = a.replace('${CLAUDE_PLUGIN_ROOT}/', '');
      assert.ok(existsSync(join(PLUGIN_DIR, ...rel.split('/'))), `hooks.json references ${rel}, which is not in plugin/`);
      refs.add(rel);
    }
  }
  assert.deepEqual([...refs].sort(), PLUGIN_HOOKS.map((h) => 'hooks/' + h).sort(), 'hooks.json must wire exactly the shipped hooks');
  assert.ok(!pluginFiles().some((f) => f.includes('route-metrics')), 'route-metrics is npm-only; it writes to disk');
});

// Ported from the plugin verification methodology's hook-safety rules: an advisory hook makes no
// network call, writes nothing, touches no credential store, evaluates no dynamic code, runs no
// subprocess, and carries a catch plus an exit(0).
const HOOK_FORBIDDEN = [
  [/\bfetch\s*\(|\bXMLHttpRequest\b|\bhttps?\.request\b|\bnet\.connect\b|\bWebSocket\b/, 'network call'],
  [/\bwriteFileSync?\s*\(|\bappendFileSync?\s*\(|\bcreateWriteStream\b|\bunlinkSync?\s*\(|\brmSync\s*\(/, 'filesystem write'],
  [/(?<!process)(?<!import\.meta)\.env\b|\bid_rsa\b|\.aws\b|credentials/i, 'credential/env access'],
  [/\beval\s*\(|\bFunction\s*\(/, 'dynamic code evaluation'],
  [/\bchild_process\b|\bexecSync?\s*\(|\bspawnSync?\s*\(|\bexecFile\b/, 'subprocess']
];
function hookProblems(src) {
  const problems = HOOK_FORBIDDEN.filter(([re]) => re.test(src)).map(([, label]) => label);
  if (!/process\.exit\(\s*(?:0|[A-Za-z_$][\w$]*)\s*\)/.test(src)) problems.push('no exit(0)');
  if (!/catch/.test(src)) problems.push('no catch');
  return problems;
}

test('plugin hooks contain no forbidden token: no network, no writes, no credentials, no eval, no subprocess', () => {
  for (const hook of PLUGIN_HOOKS) assert.deepEqual(hookProblems(readPlugin('hooks/' + hook)), [], `hooks/${hook}`);
});

test('the hook-safety check can go red, on the real route-metrics hook it keeps out', () => {
  const metrics = readFileSync(join(TEMPLATES, 'agents', 'snippets', 'route-metrics.mjs'), 'utf8');
  assert.ok(hookProblems(metrics).includes('filesystem write'));
  assert.deepEqual(hookProblems('fetch("x"); try {} catch {} process.exit(0)'), ['network call']);
  assert.deepEqual(hookProblems('const x = 1;'), ['no exit(0)', 'no catch']);
});

// ---- agents ----

function toolsLine(raw) {
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const m = fm && fm[1].match(/^tools:\s*(.*)$/m);
  return m ? m[1].trim() : '';
}
const ANALYSIS = /audit|analyz|review|scan|report|read-only|checker/i;
const REMEDIATOR = /reconcil|migrat|remediat|fix|harden|writer|writ(e|ing)|generat|author|apply/i;
function agentProblems(file, raw) {
  const tools = toolsLine(raw);
  if (!tools) return ['no tools: line'];
  const desc = (raw.match(/^description:\s*(.*)$/m) || [])[1] || '';
  if (ANALYSIS.test(file + desc) && !REMEDIATOR.test(file + desc) && /\b(Write|Edit)\b/.test(tools)) return ['analysis agent carries Write or Edit'];
  return [];
}

test('every plugin agent declares tools:, and no analysis agent carries Write or Edit', () => {
  const agents = readdirSync(join(PLUGIN_DIR, 'agents')).filter((f) => f.endsWith('.md'));
  assert.deepEqual(agents.map((f) => f.replace(/\.md$/, '')).sort(), [...claudeAgentIds()].sort(), 'plugin agents must be exactly the shipped claude-code agents');
  for (const f of agents) assert.deepEqual(agentProblems(f, readPlugin('agents/' + f)), [], f);
  // Least privilege on the three that had no tools line before 0.1.20.
  assert.doesNotMatch(toolsLine(readPlugin('agents/deep-planner.md')), /\b(Write|Edit|Bash)\b/, 'deep-planner plans; it does not edit or run');
  assert.doesNotMatch(toolsLine(readPlugin('agents/live-researcher.md')), /\b(Write|Edit|Bash|Read)\b/, 'live-researcher answers from the web');
});

test('the agent tool-scope check can go red', () => {
  assert.deepEqual(agentProblems('builder.md', '---\nname: builder\n---\nbody'), ['no tools: line']);
  assert.deepEqual(agentProblems('code-reviewer.md', '---\ndescription: review code\ntools: Read, Edit\n---\n'), ['analysis agent carries Write or Edit']);
});

// ---- README ----

test('plugin README carries the install commands, names every agent, and says where route-metrics went', () => {
  const readme = readPlugin('README.md');
  assert.ok(readme.length >= 500);
  assert.match(readme, /\/plugin install /);
  assert.match(readme, /\/plugin marketplace add aunysillyme\/model-orchestrator/);
  assert.match(readme, /npx model-orchestrator/);
  assert.match(readme, /route-metrics/);
  for (const id of claudeAgentIds()) assert.ok(readme.includes('`' + id + '`'), `plugin README does not name ${id}`);
  for (const rel of DEFAULT_RULES) assert.ok(readme.includes(rel), `plugin README does not name ${rel}`);
});

// ---- the plugin's route-gate, run for real ----

function runPluginHook(hook, project, args = []) {
  const env = { ...process.env };
  if (project === null) delete env.CLAUDE_PROJECT_DIR;
  else env.CLAUDE_PROJECT_DIR = project;
  return spawnSync('node', [join(PLUGIN_DIR, 'hooks', hook), ...args], { input: '', encoding: 'utf8', env });
}
function withProject(fn) {
  const project = mkdtempSync(join(tmpdir(), 'orch-plugin-'));
  try {
    return fn(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}
function writeRulesAt(project, rel, body) {
  const abs = join(project, ...rel.split('/'));
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, body);
}
const TABLE = (lane) => `<!-- route-gate:start -->\n| Task | Lane |\n|---|---|\n| ${lane} | builder |\n<!-- route-gate:end -->\n`;

test('plugin route-gate: ROUTING.md wins, its table is injected, with the namespacing note', () => {
  withProject((project) => {
    writeRulesAt(project, 'ai-orchestrator/ROUTING.md', TABLE('from routing'));
    writeRulesAt(project, 'ai-orchestrator/ORCHESTRATOR.md', TABLE('from orchestrator'));
    const r = runPluginHook('route-gate.mjs', project);
    assert.equal(r.status, 0, r.stderr);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /from routing/);
    assert.doesNotMatch(ctx, /from orchestrator/);
    assert.match(ctx, /model-orchestrator:builder/);
  });
});

test('plugin route-gate: a level 1 project with only ORCHESTRATOR.md is read', () => {
  withProject((project) => {
    writeRulesAt(project, 'ai-orchestrator/ORCHESTRATOR.md', TABLE('level one'));
    const r = runPluginHook('route-gate.mjs', project);
    assert.equal(r.status, 0);
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /level one/);
  });
});

test('plugin route-gate: no rules file gives the next step on every prompt and a notice at session start', () => {
  withProject((project) => {
    const r = runPluginHook('route-gate.mjs', project);
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(out.hookSpecificOutput.additionalContext, /npx model-orchestrator/);
    assert.match(out.hookSpecificOutput.additionalContext, /ROUTING\.md/);
    assert.match(out.hookSpecificOutput.additionalContext, /ORCHESTRATOR\.md/);

    const s = runPluginHook('route-gate.mjs', project, ['--session-start']);
    assert.equal(s.status, 0);
    assert.match(JSON.parse(s.stdout).systemMessage, /npx model-orchestrator/);
  });
});

test('plugin route-gate: session start says nothing when rules exist or the project is unknown', () => {
  withProject((project) => {
    writeRulesAt(project, 'ai-orchestrator/ROUTING.md', TABLE('x'));
    const s = runPluginHook('route-gate.mjs', project, ['--session-start']);
    assert.equal(s.status, 0);
    assert.equal(s.stdout, '');
  });
  const none = runPluginHook('route-gate.mjs', null, ['--session-start']);
  assert.equal(none.status, 0);
  assert.equal(none.stdout, '');
});

test('plugin route-gate: something that is not a file at ROUTING.md is reported, not skipped for ORCHESTRATOR.md', () => {
  withProject((project) => {
    mkdirSync(join(project, 'ai-orchestrator', 'ROUTING.md'), { recursive: true });
    writeRulesAt(project, 'ai-orchestrator/ORCHESTRATOR.md', TABLE('should not be read'));
    const r = runPluginHook('route-gate.mjs', project);
    assert.equal(r.status, 0);
    const ctx = JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
    assert.match(ctx, /not a regular file/);
    assert.doesNotMatch(ctx, /should not be read/);
  });
});

test('plugin route-gate: CLAUDE_PROJECT_DIR unset exits 0 with a fallback', () => {
  const r = runPluginHook('route-gate.mjs', null);
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /CLAUDE_PROJECT_DIR is not set/);
});

test('plugin subagent-context: valid SubagentStart JSON naming the default rules path', () => {
  const r = runPluginHook('subagent-context.mjs', '/nowhere');
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.match(out.hookSpecificOutput.additionalContext, /ai-orchestrator\/ROUTING\.md/);
});

test('an installer render keeps one rules path and no plugin text', () => {
  const p = planFiles({ level: 2, selected: [byId['claude-code']], primary: byId['claude-code'], dir: 'ai-orchestrator', project: '.' });
  const gate = p.find((f) => f.rel === join('.claude', 'hooks', 'route-gate.mjs')).content;
  assert.match(gate, /const RULES_CANDIDATES = \["ai-orchestrator\/ROUTING\.md"\];/);
  assert.match(gate, /const SETUP_HINT = "";/);
  assert.match(gate, /const SETUP_NOTICE = "";/);
  assert.match(gate, /const CONTEXT_SUFFIX = "";/);
});
