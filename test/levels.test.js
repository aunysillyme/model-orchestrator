import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { planFiles, activationSteps } from '../src/install.js';
import { byId } from '../src/catalog.js';

const filesFor = (level, ids, primary = ids[0]) => planFiles({
  level, selected: ids.map(id => byId[id]), primary: byId[primary],
  dir: '/tmp/level-check/ai', project: '/tmp/level-check'
});
const content = (files, rel) => files.find(file => file.rel === rel).content;
const agentNames = /\b(?:deep-planner|code-reviewer|finding-verifier|done-verifier|bulk-worker|live-researcher|reader)\b/;

test('levels #1: routing names only installed agents and gives main-agent role fallbacks', () => {
  const files = filesFor(2, ['codex', 'agy']);
  assert.equal(files.some(file => file.root === 'project'), false);
  const routing = content(files, 'ROUTING.md');
  assert.doesNotMatch(routing, agentNames);
  assert.match(routing, /reading role on the main agent/);
  assert.match(routing, /planning role on the main agent/);
  assert.match(routing, /review role on the main agent/);
  for (const primary of ['claude-code', 'agy']) {
    const installed = filesFor(2, [primary]);
    const names = [...content(installed, 'ROUTING.md').matchAll(new RegExp(agentNames, 'g'))].map(match => match[0]);
    for (const name of names) assert.ok(installed.some(file => file.root === 'project' && file.rel.endsWith(join('agents', name + '.md'))), `${primary}: ${name} was not installed`);
  }
});

test('levels #2: independent review is relative to the main agent model family', () => {
  const codex = content(filesFor(2, ['codex', 'agy']), 'ROUTING.md');
  assert.match(codex, /cli-run agy[^\n]*different model family/);
  assert.doesNotMatch(codex, /cli-run codex --audit[^\n]*(?:second|different) model family/);
  const alone = filesFor(2, ['codex']);
  for (const rel of ['ROUTING.md', 'RESEARCH_TRIAGE.md']) {
    assert.match(content(alone, rel), /no different-family reviewer is selected/i);
    assert.doesNotMatch(content(alone, rel), /cli-run codex --audit[^\n]*(?:second|different) model family/);
  }
  assert.match(content(filesFor(2, ['claude-code', 'codex']), 'ROUTING.md'), /cli-run codex --audit[^\n]*different model family/);
});

test('levels #3: generated smoke command executes a runner path containing spaces', () => {
  const root = mkdtempSync(join(tmpdir(), 'orchestrator level smoke '));
  try {
    const dir = join(root, 'rules with spaces');
    mkdirSync(join(dir, 'bin'), { recursive: true });
    writeFileSync(join(dir, 'bin', 'cli-run.mjs'), 'console.log(JSON.stringify(process.argv.slice(2)));\n');
    const smoke = activationSteps({ level: 2, selected: [byId.codex], primary: byId.codex, dir, project: root }).find(step => step.startsWith('smoke test:'));
    const command = smoke.slice('smoke test: '.length).split('   (or ')[0];
    const run = spawnSync('bash', ['-c', command], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(JSON.parse(run.stdout), ['--doctor']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('levels #13: the first-read README row matches the installed level', () => {
  for (const level of [1, 2, 3]) {
    const readme = content(filesFor(level, ['codex']), 'README.md');
    const firstRows = readme.split('\n').filter(line => /^\| .* \| First\./.test(line));
    assert.equal(firstRows.length, 1);
    assert.ok(firstRows[0].includes(level === 1 ? '`ORCHESTRATOR.md`' : '`ROUTING.md`'), `level ${level}: ${firstRows[0]}`);
  }
});

test('levels #14: inactive delegation defers the output-contract test', () => {
  const inactive = content(filesFor(2, ['claude-code']), 'README.md');
  assert.match(inactive, /delegation is inactive[^\n]*exit 13/i);
  assert.match(inactive, /defer the output-contract test until[^\n]*supported CLI lane/i);
  assert.doesNotMatch(inactive, /--expect-json/);
  const active = content(filesFor(2, ['claude-code', 'codex']), 'README.md');
  assert.match(active, /--expect-json/);
  assert.doesNotMatch(active, /defer the output-contract test/i);
});

test('levels #1: tier and single-agent routing also use installed roles', () => {
  const files = filesFor(2, ['codex', 'agy']);
  for (const rel of ['ORCHESTRATOR.md', 'TIERS.md']) {
    assert.doesNotMatch(content(files, rel), agentNames, rel);
    assert.match(content(files, rel), /reading role on the main agent/);
  }
});

test('levels #2: provider-configurable lanes require a model-family check', () => {
  for (const ids of [['codex'], ['codex', 'hermes', 'qwen'], ['qwen', 'codex']]) {
    const routing = content(filesFor(2, ids), 'ROUTING.md');
    assert.match(routing, /No different-family reviewer is selected/);
    assert.doesNotMatch(routing, /cli-run (?:hermes|qwen)[^\n]*different model family/);
  }
});
