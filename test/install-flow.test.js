import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { AIS, agentCandidates } from '../src/catalog.js';
import { inferPrimary } from '../src/roles.js';
import { inferSetup } from '../bin/cli.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
function fixture(binaries = []) {
  const root = mkdtempSync(join(tmpdir(), 'mo-flow-'));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  const marker = join(root, 'vendor-executed');
  for (const binary of binaries) {
    const file = join(bin, binary + (process.platform === 'win32' ? '.cmd' : ''));
    const script = join(bin, binary + '.mjs');
    writeFileSync(script, `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(marker)}, JSON.stringify([${JSON.stringify(binary)}, ...process.argv.slice(2)]) + '\\n');\n`);
    writeFileSync(file, process.platform === 'win32' ? `@ECHO off\r\n"%_prog%" "%dp0%\\${binary}.mjs" %*\r\n` : `#!${process.execPath}\n// CommonJS on purpose: Node 18 runs an extensionless file as CommonJS.\nimport(require('node:url').pathToFileURL(require('node:path').join(__dirname, ${JSON.stringify(binary + '.mjs')})).href);\n`, { mode: 0o755 });
  }
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (['PATH', 'HOME', 'USERPROFILE'].includes(key.toUpperCase())) delete env[key];
  const home = join(root, 'home');
  mkdirSync(home);
  Object.assign(env, { PATH: bin, HOME: home, USERPROFILE: home });
  const dir = join(root, 'ai');
  return {
    root, dir, marker,
    run(args = [], input = '', project = root) {
      return spawnSync(process.execPath, [CLI, '--dir', dir, '--project', project, ...args], { cwd: root, env, input, encoding: 'utf8', timeout: 15000 });
    },
    manifest() { return JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')); },
    close() { rmSync(root, { recursive: true, force: true }); }
  };
}

test('default flow asks one question and runs only the reliable read-only sign-in status', () => {
  const f = fixture(['claude', 'codex']);
  try {
    const r = f.run([], 'y\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal((r.stdout.match(/\[Y\/n\/e\]/g) || []).length, 1);
    assert.doesNotMatch(r.stdout, /\[y\/N\]|\[1\]|\[none\]|Which level\?|Which one is your main/);
    assert.match(r.stdout, /Looking for AI tools on your PATH/);
    assert.match(r.stdout, /Your stack: who does what/);
    // Q1: Claude Code also carries a reliable, catalogued status command now
    // (`claude auth status`, positive-only trust), so it runs alongside
    // Codex's; selected order is claude-code, codex.
    assert.deepEqual(readFileSync(f.marker, 'utf8').trim().split('\n').map(JSON.parse), [['claude', 'auth', 'status'], ['codex', 'login', 'status']]);
    const m = f.manifest();
    assert.deepEqual(m.ais, ['claude-code', 'codex']);
    assert.deepEqual(m.detected, ['claude-code', 'codex']);
    assert.equal(m.level, 2);
    assert.equal(m.primary, 'claude-code');
    assert.deepEqual(m.tools, []);
    assert.deepEqual(m.apis, []);
    assert.deepEqual(m.plans || {}, {});
    assert.deepEqual(m.effortAuto || [], []);
  } finally { f.close(); }
});

test('no detection asks two questions: access and confirmation', () => {
  const f = fixture();
  try {
    const r = f.run([], '1\ny\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal((r.stdout.match(/Your picks/g) || []).length, 1);
    assert.equal((r.stdout.match(/\[Y\/n\/e\]/g) || []).length, 1);
    assert.doesNotMatch(r.stdout, /\[y\/N\]|\[1\]|\[none\]|Which level\?|Main agent \[/);
    assert.deepEqual(f.manifest().ais, ['claude-code']);
    assert.equal(f.manifest().level, 1);
  } finally { f.close(); }
});

test('interactive AI picks accept catalog IDs mixed with numbers', () => {
  const f = fixture();
  try {
    const r = f.run([], 'claude-code,2\ny\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.deepEqual(f.manifest().ais, ['claude-code', 'codex']);
  } finally { f.close(); }
});

test('interactive AI picks retry once after invalid input', () => {
  const f = fixture();
  try {
    const r = f.run([], 'not-an-ai\nclaude-code\ny\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal((r.stdout.match(/Your picks/g) || []).length, 2);
    assert.deepEqual(f.manifest().ais, ['claude-code']);
    const refused = fixture();
    try {
      assert.equal(refused.run([], 'wrong\nalso-wrong\n').status, 2);
      assert.equal(existsSync(refused.dir), false);
    } finally { refused.close(); }
  } finally { f.close(); }
});

test('dry and real installs refuse home-level configuration with one matching message', () => {
  const f = fixture();
  try {
    const home = join(f.root, 'home');
    const args = ['--yes', '--level', '2', '--ais', 'claude-code'];
    const preview = f.run([...args, '--dry'], '', home);
    const actual = f.run(args, '', home);
    assert.equal(preview.status, 2, preview.stdout + preview.stderr);
    assert.equal(actual.status, 2, actual.stdout + actual.stderr);
    assert.equal(preview.stderr, actual.stderr);
    assert.equal((actual.stderr.match(/global agent configuration/g) || []).length, 1);
    assert.ok(actual.stderr.includes(home));
    assert.equal(existsSync(f.dir), false);
  } finally { f.close(); }
});

test('level requirement grammar follows the number of selected AIs', () => {
  const f = fixture();
  try {
    const one = f.run(['--yes', '--level', '1', '--ais', 'hermes']);
    assert.match(one.stderr, /hermes needs level 2 or higher/);
    const many = f.run(['--yes', '--level', '1', '--ais', 'hermes,ollama']);
    assert.match(many.stderr, /hermes, ollama need level/);
  } finally { f.close(); }
});

test('vendor script fallback is labelled as an install script', () => {
  const f = fixture();
  try {
    const r = f.run(['--yes', '--level', '2', '--ais', 'agy,grok']);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /install script: https:\/\//);
    assert.doesNotMatch(r.stdout, /official guide: .*install\.sh/);
  } finally { f.close(); }
});

test('interactive flags override inference and are marked in the summary', () => {
  const f = fixture(['claude', 'codex']);
  try {
    const r = f.run(['--level', '1', '--ais', 'codex', '--primary', 'codex', '--tools', 'context7', '--plans', 'codex=plus'], 'y\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const key of ['level', 'ais', 'primary', 'tools', 'plans', 'dir', 'project']) assert.match(r.stdout, new RegExp(`from --${key}`));
    assert.equal((r.stdout.match(/\[Y\/n\/e\]/g) || []).length, 1);
    assert.deepEqual(f.manifest().ais, ['codex']);
    assert.deepEqual(f.manifest().tools, ['context7']);
    assert.deepEqual(f.manifest().plans, { codex: 'plus' });
  } finally { f.close(); }
});

test('edit screen changes one setting then returns to the summary', () => {
  const f = fixture(['claude', 'codex']);
  try {
    const r = f.run([], 'e\n1\n3\ny\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Change what\?/);
    assert.equal((r.stdout.match(/\[Y\/n\/e\]/g) || []).length, 2);
    assert.equal(f.manifest().level, 3);
    assert.deepEqual(f.manifest().apis, []);
  } finally { f.close(); }
});

test('interactive rerun preserves prior plans and effort consent without new questions', () => {
  const f = fixture(['claude', 'codex']);
  try {
    const setup = f.run(['--yes', '--level', '2', '--ais', 'claude-code,codex', '--plans', 'codex=pro-20x', '--effort-auto']);
    assert.equal(setup.status, 0, setup.stdout + setup.stderr);
    const r = f.run([], 'y\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal((r.stdout.match(/\[Y\/n\/e\]/g) || []).length, 1);
    assert.deepEqual(f.manifest().plans, { codex: 'pro-20x' });
    assert.deepEqual(f.manifest().effortAuto, ['codex']);
  } finally { f.close(); }
});

test('edit screen exposes selection, main agent, companions, plans and API keys only on request', () => {
  for (const [args, input, check] of [
    [[], 'e\n2\n2,4\ny\n', (m) => assert.deepEqual(m.ais, ['codex', 'grok'])],
    [[], 'e\n3\n2\ny\n', (m) => assert.equal(m.primary, 'codex')],
    [[], 'e\n4\n1,3\ny\n', (m) => assert.deepEqual(m.tools, ['codecalc', 'context7'])],
    [['--ais', 'codex'], 'e\n6\n3\ny\ny\n', (m) => {
      assert.deepEqual(m.plans, { codex: 'pro-20x' });
      assert.deepEqual(m.effortAuto, ['codex']);
    }],
    [['--level', '3'], 'e\n7\n2\ny\n', (m) => assert.deepEqual(m.apis, ['openai'])]
  ]) {
    const f = fixture(['claude', 'codex']);
    try {
      const r = f.run(args, input);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      check(f.manifest());
    } finally { f.close(); }
  }
});

test('edit values are validated before anything is written', () => {
  for (const input of ['e\n1\n4\n', 'e\n2\n999\n', 'e\n3\n999\n', 'e\n4\n999\n', 'e\n6\n999\n', 'e\n7\n']) {
    const f = fixture(['claude', 'codex']);
    try {
      assert.equal(f.run([], input).status, 2);
      assert.equal(existsSync(f.dir), false);
    } finally { f.close(); }
  }
});

test('later edits preserve an explicitly edited level and subscription consent', () => {
  const f = fixture(['claude', 'codex']);
  try {
    const dir = join(f.root, 'changed');
    const r = f.run(['--ais', 'codex'], `e\n1\n3\ne\n2\n2\ne\n6\n3\ny\ne\n5\n${dir}\n${f.root}\ny\n`);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const m = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
    assert.equal(m.level, 3);
    assert.deepEqual(m.plans, { codex: 'pro-20x' });
    assert.deepEqual(m.effortAuto, ['codex']);
  } finally { f.close(); }
});

test('inference follows detected capabilities and never infers level 3', () => {
  for (let mask = 0; mask < 2 ** AIS.length; mask++) {
    const found = AIS.filter((ai, index) => ai.bin && mask & (1 << index));
    const setup = inferSetup({ detect: (bin) => found.some((ai) => ai.bin === bin) ? '/example/' + bin : null });
    assert.deepEqual(setup.selected.map((ai) => ai.id), found.map((ai) => ai.id));
    assert.deepEqual([...setup.detected], found.map((ai) => ai.id));
    assert.ok([1, 2].includes(setup.level));
    assert.equal(setup.primary, inferPrimary(agentCandidates(found)) || null);
  }
});

test('inferPrimary matches the specified facts rank for every catalog-order subset', () => {
  let legacyDifferences = 0;
  for (let mask = 0; mask < 2 ** AIS.length; mask++) {
    const candidates = agentCandidates(AIS.filter((_, index) => mask & (1 << index)));
    const rank = (ai) => ai.facts.loadsProjectRules && ai.facts.agentDefinitions ? 0
      : ai.facts.agentDefinitions ? 1 : ai.facts.kind === 'agent-cli' && ai.rulesFile ? 2
        : ai.facts.kind === 'agent-cli' ? 3 : 4;
    const expected = [...candidates].sort((a, b) => rank(a) - rank(b))[0];
    assert.equal(inferPrimary(candidates), expected);
    const legacy = candidates.find((ai) => ai.id === 'claude-code') || candidates.find((ai) => ai.facts.agentDefinitions) || candidates[0];
    if (legacy !== expected) {
      legacyDifferences++;
      assert.equal(expected.id, 'qwen');
      assert.ok(['grok', 'hermes'].includes(legacy.id));
    }
  }
  // The spec's claimed equivalence misses QWEN.md: that rules file raises its
  // rank above earlier selected agents without a rules file.
  assert.equal(legacyDifferences, 48);
});

test('--yes stays strict and primary auto-picking retains the existing choices', () => {
  const f = fixture(['claude', 'codex']);
  try {
    for (const args of [['--yes'], ['--yes', '--level', '2'], ['--yes', '--ais', 'codex']]) assert.equal(f.run(args).status, 2);
    for (const [ais, primary] of [['codex,agy', 'agy'], ['codex,agy,claude-code', 'claude-code'], ['codex,grok', 'codex'], ['claude-app', 'claude-app']]) {
      const r = f.run(['--yes', '--level', '2', '--ais', ais, '--dry']);
      assert.equal(r.status, 0, r.stdout + r.stderr);
      assert.match(r.stdout, new RegExp(`primary\\s+${primary}`));
      assert.doesNotMatch(r.stdout, /\[Y\/n\/e\]/);
    }
  } finally { f.close(); }
});

test('default confirmation refuses EOF and no without writing files', () => {
  const f = fixture(['claude']);
  try {
    assert.equal(f.run().status, 2);
    const r = f.run([], 'n\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Nothing written/);
    assert.equal(existsSync(f.dir), false);
  } finally { f.close(); }
});
