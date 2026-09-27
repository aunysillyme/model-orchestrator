import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { suggestRoute } from '../src/aunx.js';
import { planFiles } from '../src/install.js';
import { byId } from '../src/catalog.js';

const CLI = resolve('bin/aunx.js');
const run = (args, cwd, extra = {}) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', timeout: 10000, ...extra });
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'aunx-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('aunx help lists the installer and every public command', () => {
  const result = run(['--help']);
  assert.equal(result.status, 0);
  for (const command of ['cli-run', 'route-metrics', 'brief', 'context', 'checks', 'route']) assert.ok(result.stdout.includes(`aunx ${command}`));
});

test('aunx passes installer flags and error codes through unchanged', t => {
  const cwd = temp(t);
  const args = ['--yes', '--level', '2', '--ais', 'claude-code,codex', '--primary', 'claude-code', '--dir', join(cwd, 'out'), '--project', cwd, '--dry'];
  const direct = spawnSync(process.execPath, [resolve('bin/cli.js'), ...args], { cwd, encoding: 'utf8' });
  const alias = run(args, cwd);
  assert.equal(alias.status, direct.status);
  assert.equal(alias.stdout, direct.stdout);
  assert.equal(alias.stderr, direct.stderr);
  assert.equal(run(['--bad-option'], cwd).status, 2);
});

test('aunx cli-run uses the packaged runner by default, never a project-local one (R1)', t => {
  const cwd = temp(t);
  mkdirSync(join(cwd, 'ai-orchestrator', 'bin'), { recursive: true });
  writeFileSync(join(cwd, 'ai-orchestrator', 'bin', 'cli-run.mjs'), 'console.log("LOCAL-RUNNER-RAN"); process.exit(66);');
  const result = run(['cli-run', 'codex', 'quotes " spaces & $(literal)'], cwd);
  assert.notEqual(result.status, 66, 'a planted project runner must not run without --dir');
  assert.doesNotMatch(result.stdout, /LOCAL-RUNNER-RAN/);
});

test('aunx cli-run honors custom --dir and uses package fallback', t => {
  const cwd = temp(t);
  const custom = join(cwd, 'custom rules');
  mkdirSync(join(custom, 'bin'), { recursive: true });
  writeFileSync(join(custom, 'bin', 'cli-run.mjs'), 'console.log(JSON.stringify(process.argv.slice(2))); process.exit(18);');
  for (const args of [['--dir', custom], [`--dir=${custom}`]]) {
    const r = run(['cli-run', ...args, 'grok', 'task'], cwd);
    assert.equal(r.status, 18);
    assert.deepEqual(JSON.parse(r.stdout), ['grok', 'task']);
  }
  assert.equal(run(['cli-run', '--dir', custom, '--dir', custom], cwd).status, 2);
  const fallback = run(['cli-run', '--dir', join(cwd, 'absent'), '--help'], cwd);
  assert.equal(fallback.status, 2); // The existing runner reports its usage with exit 2.
  assert.match(fallback.stderr, /cli-run/);
});

test('aunx brief prints the package template and scaffold never overwrites', t => {
  const cwd = temp(t);
  const printed = run(['brief'], cwd);
  assert.equal(printed.status, 0);
  assert.equal(printed.stdout, readFileSync('templates/common/TASK_BRIEF.md', 'utf8'));
  for (const [command, filename] of [['brief', 'TASK_BRIEF.md'], ['context', 'CONTEXT.md'], ['checks', 'ACCEPTANCE_CHECKS.json']]) {
    assert.equal(run([command, 'new', filename], cwd).status, 0);
    const before = readFileSync(join(cwd, filename), 'utf8');
    assert.equal(run([command, 'new', filename], cwd).status, 2);
    assert.equal(readFileSync(join(cwd, filename), 'utf8'), before);
  }
  assert.equal(run(['checks', 'run'], cwd).status, 1, 'the placeholder check must start red');
});

test('aunx scaffold rejects symlink parents', t => {
  const cwd = temp(t);
  mkdirSync(join(cwd, 'real'));
  symlinkSync(join(cwd, 'real'), join(cwd, 'link'), process.platform === 'win32' ? 'junction' : 'dir');
  const r = run(['context', join(cwd, 'link', 'file.md')], cwd);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /real directory/);
});

test('aunx route covers the decision tree and explicitly labels suggestions', () => {
  const cases = [
    ['rename this file', 'bulk-worker'], ['format the files', 'bulk-worker'],
    ['read many files', 'reader'], ['reading many files', 'reader'], ['summarize the notes', 'reader'],
    ['search the latest docs', 'live-researcher'], ['review this diff', 'code-reviewer'],
    ['verify the review findings', 'finding-verifier'], ['check the definition of done', 'done-verifier'], ['definition-of-done check', 'done-verifier'],
    ['design the auth system', 'deep-planner'], ['plan the architecture', 'deep-planner'], ['find why this silently drops rows', 'deep-planner'], ['build this feature', 'builder']
  ];
  for (const [task, agent] of cases) assert.equal(suggestRoute(task)?.agent, agent, task);
  const tiers = planFiles({ level: 2, selected: [byId['claude-code']], primary: byId['claude-code'] })
    .find(file => file.rel === 'TIERS.md').content;
  for (const [task] of cases) {
    const result = suggestRoute(task);
    assert.ok(tiers.includes(`| ${result.agent} | ${result.tier} | ${result.effort}`), `suggestion agrees with TIERS.md: ${task}`);
  }
  assert.equal(suggestRoute('hello there'), null);
  const r = run(['route', 'rename this file']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Suggestion: bulk-worker.*cheap model.*low/);
  assert.match(run(['route', 'hello there']).stdout, /unknown.*ROUTING.md/);
  assert.equal(run(['route']).status, 2);
});

test('aunx checks run executes all checks and returns 1 on any failure', t => {
  const cwd = temp(t);
  const file = join(cwd, 'checks.json');
  writeFileSync(file, JSON.stringify({ version: 1, checks: [
    { id: 'passes', command: ['node', '-e', 'process.exit(0)'] },
    { id: 'fails', command: ['node', '-e', 'process.exit(7)'] },
    { id: 'after', command: ['node', '-e', 'console.log("ran after failure")'] }
  ] }));
  const r = run(['checks', 'run', file], cwd);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PASS passes: exit 0/);
  assert.match(r.stdout, /FAIL fails: exit 7/);
  assert.match(r.stdout, /ran after failure/);
});

test('aunx checks resolves cwd from the checks file and supports explicit shell commands', t => {
  const cwd = temp(t);
  mkdirSync(join(cwd, 'checks'));
  writeFileSync(join(cwd, 'marker'), 'present');
  writeFileSync(join(cwd, 'checks', 'pass.json'), JSON.stringify({ version: 1, checks: [
    { id: 'relative', cwd: '..', command: ['node', '-e', 'require("node:fs").accessSync("marker")'] },
    { id: 'shell', command: 'echo local-check' }
  ] }));
  assert.equal(run(['checks', 'run', 'checks/pass.json'], cwd).status, 0);
});

test('aunx checks rejects empty/malformed input before executing any command', t => {
  const cwd = temp(t);
  const file = join(cwd, 'invalid.json');
  for (const config of [
    { version: 1, checks: [] },
    { version: 1, checks: [{ id: 'first', command: ['node', '-e', 'console.log("MUST_NOT_RUN")'] }, { id: 'broken', command: [] }] },
    { version: 1, checks: [{ id: 'duplicate', command: 'echo x' }, { id: 'duplicate', command: 'echo y' }] }
  ]) {
    writeFileSync(file, JSON.stringify(config));
    const r = run(['checks', 'run', file], cwd);
    assert.equal(r.status, 2);
    assert.doesNotMatch(r.stdout, /MUST_NOT_RUN/);
  }
});

test('aunx checks treats missing programs, timeout and manual evidence as failures', t => {
  const cwd = temp(t);
  writeFileSync(join(cwd, 'checks.json'), JSON.stringify({ version: 1, checks: [
    { id: 'missing', command: ['aunx-nonexistent-fixture-program'] },
    { id: 'timeout', timeoutMs: 50, command: ['node', '-e', 'setInterval(() => {}, 1000)'] },
    { id: 'manual', manual: true }
  ] }));
  const r = run(['checks', 'run', 'checks.json'], cwd);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FAIL missing: ENOENT/);
  assert.match(r.stdout, /FAIL timeout: ETIMEDOUT/);
  assert.match(r.stdout, /FAIL manual: manual check is UNVERIFIED/);
});

test('aunx route-metrics passes --summary through without writing a hook event', t => {
  const cwd = temp(t);
  const r = run(['route-metrics', '--summary'], cwd, { env: { ...process.env, HOME: cwd, USERPROFILE: cwd } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /route-metrics: no data yet/);
});
