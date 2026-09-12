import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AIS } from '../src/catalog.js';
import { AUTO_EFFORT, gitChangedLines, laneConfig, resolveAutoEffort } from '../bin/cli-run.mjs';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const CLI_RUN = fileURLToPath(new URL('../bin/cli-run.mjs', import.meta.url));
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
const git = (dir, args) => {
  const r = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};

function committedRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'orch-auto-git-'));
  git(dir, ['init']);
  writeFileSync(join(dir, 'tracked'), 'base\n');
  git(dir, ['add', 'tracked']);
  git(dir, ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'base']);
  return dir;
}

function writeCodexStub(bin) {
  mkdirSync(bin);
  const body = [
    "const { writeFileSync } = require('node:fs');",
    "const output = process.argv[process.argv.indexOf('-o') + 1];",
    "writeFileSync(output, 'complete');",
    "console.log('{\\\"type\\\":\\\"turn.completed\\\"}');"
  ].join('\n');
  if (process.platform === 'win32') {
    writeFileSync(join(bin, 'codex.cjs'), body);
    writeFileSync(join(bin, 'codex.cmd'), '"%_prog%" "%dp0%codex.cjs" %*\r\n');
  } else {
    const stub = join(bin, 'codex');
    writeFileSync(stub, '#!' + process.execPath + '\n' + body);
    chmodSync(stub, 0o755);
  }
}

test('catalog subscription plans are complete, dated, and use bounded headroom', () => {
  for (const ai of AIS.filter((a) => a.plans)) {
    for (const plan of ai.plans) {
      assert.match(plan.id, /^[a-z0-9-]+$/);
      assert.ok(plan.name);
      assert.ok(['base', 'high', 'max'].includes(plan.headroom));
      assert.match(plan.source, /^https:\/\//);
      assert.match(plan.checked, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

test('grok plans include SuperGrok Plus as high headroom, sourced from the xAI pricing page', () => {
  const grok = AIS.find((a) => a.id === 'grok');
  const plus = grok.plans.find((p) => p.id === 'supergrok-plus');
  assert.ok(plus, 'supergrok-plus plan missing');
  assert.equal(plus.headroom, 'high');
  assert.equal(plus.source, 'https://x.ai/pricing');
  assert.equal(grok.plans.some((p) => /heavy/i.test(p.id)), false, 'SuperGrok Heavy states no Build usage; keep it out until it does');
});

test('auto effort stays bounded at the prompt boundary and audits hold high', () => {
  for (const lane of Object.keys(AUTO_EFFORT)) {
    assert.equal(resolveAutoEffort(lane, 'auto', 'x'.repeat(3999), false).resolved, 'medium');
    assert.equal(resolveAutoEffort(lane, 'auto', 'x'.repeat(4000), false).resolved, 'high');
    assert.equal(resolveAutoEffort(lane, 'auto', 'x', true).resolved, 'high');
    assert.notEqual(resolveAutoEffort(lane, 'auto', 'x'.repeat(100000), false).resolved, 'xhigh');
  }
});

test('audit auto effort uses the larger prompt or git scope in a clean committed repo', () => {
  const dir = committedRepo();
  try {
    const sized = resolveAutoEffort('codex', 'auto', 'x'.repeat(100000), true, dir);
    assert.deepEqual(
      { resolved: sized.resolved, basis: sized.basis, scope: sized.scope },
      { resolved: 'high', basis: 'audit_floor', scope: 100000 }
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a real auto-effort run logs a complete record with a fixed basis code', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-auto-log-'));
  const bin = join(dir, 'bin');
  try {
    writeCodexStub(bin);
    const r = spawnSync(process.execPath, [CLI_RUN, 'codex', 'prompt', '--effort', 'auto', '--quiet'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, PATH: bin, HOME: dir, USERPROFILE: dir }
    });
    assert.equal(r.status, 0, r.stderr);
    const record = JSON.parse(readFileSync(join(dir, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8').trim());
    assert.equal(record.effort_requested, 'auto');
    assert.equal(typeof record.effort_resolved, 'string');
    assert.ok(new Set(['explicit', 'prompt_chars', 'audit_floor', 'none']).has(record.effort_basis));
    assert.ok(Number.isInteger(record.effort_scope));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('qwen rejects --effort auto as a usage error', () => {
  const r = spawnSync(process.execPath, [CLI_RUN, 'qwen', 'prompt', '--effort', 'auto'], { encoding: 'utf8' });
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /qwen has no reasoning-effort flag/);
});

test('git changed-line sizing treats binary numstat rows as zero lines', () => {
  const dir = committedRepo();
  try {
    const binary = join(dir, 'binary');
    writeFileSync(binary, Buffer.from([0, 1, 2]));
    git(dir, ['add', 'binary']);
    git(dir, ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'binary']);
    writeFileSync(binary, Buffer.from([0, 1, 3]));
    assert.deepEqual(gitChangedLines(dir), { lines: 0, truncated: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('git changed-line sizing never opens untracked FIFOs or outside symlinks', { skip: process.platform === 'win32' ? 'no mkfifo on Windows' : false }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-auto-special-'));
  const outside = mkdtempSync(join(tmpdir(), 'orch-auto-outside-'));
  try {
    writeFileSync(join(outside, 'large'), 'x'.repeat(3 * 1024 * 1024));
    symlinkSync(join(outside, 'large'), join(dir, 'outside-link'));
    execFileSync('mkfifo', [join(dir, 'untracked-fifo')]);
    const bin = join(dir, 'fake-bin');
    mkdirSync(bin);
    const fakeGit = join(bin, 'git');
    writeFileSync(fakeGit, '#!' + process.execPath + `
      if (process.argv[2] === 'diff') process.stdout.write('');
      else process.stdout.write('untracked-fifo\\0outside-link\\0');
    `);
    chmodSync(fakeGit, 0o755);
    const started = Date.now();
    const r = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      import { gitChangedLines } from ${JSON.stringify(pathToFileURL(CLI_RUN).href)};
      console.log(JSON.stringify(gitChangedLines(process.cwd())));
    `], { cwd: dir, encoding: 'utf8', env: { ...process.env, PATH: bin + ':' + process.env.PATH }, timeout: 5000 });
    assert.equal(r.status, 0, r.error && r.error.message);
    assert.ok(Date.now() - started < 5000, 'a FIFO open blocked the bounded probe');
    assert.deepEqual(JSON.parse(r.stdout), { lines: 0, truncated: false });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('git changed-line sizing bounds a large untracked single line', () => {
  const dir = committedRepo();
  try {
    writeFileSync(join(dir, 'large-single-line'), 'x'.repeat(3 * 1024 * 1024));
    assert.deepEqual(gitChangedLines(dir), { lines: 1, truncated: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('unborn git uses prompt evidence, and untracked scanning is bounded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-auto-'));
  try {
    spawnSync('git', ['init'], { cwd: dir, encoding: 'utf8' });
    assert.equal(gitChangedLines(dir), null, 'an unborn HEAD is unavailable evidence');
    const sized = resolveAutoEffort('codex', 'auto', 'x'.repeat(4000), true, dir);
    assert.deepEqual({ resolved: sized.resolved, basis: sized.basis, scope: sized.scope }, { resolved: 'high', basis: 'audit_floor', scope: 4000 });
    writeFileSync(join(dir, 'tracked'), 'first\n');
    spawnSync('git', ['add', 'tracked'], { cwd: dir, encoding: 'utf8' });
    spawnSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'base'], { cwd: dir, encoding: 'utf8' });
    for (let i = 0; i < 300; i++) writeFileSync(join(dir, `untracked-${i}`), 'line\n');
    const measured = gitChangedLines(dir);
    assert.ok(measured && measured.truncated, 'more than 200 untracked files is explicitly truncated');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lanes.json accepts auto only on effort lanes and rejects qwen or invalid values', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-lanes-'));
  try {
    writeFileSync(join(dir, 'lanes.json'), JSON.stringify({ enabled: ['codex'], defaults: { codex: { effort: 'auto' } } }));
    assert.equal(laneConfig(dir).defaults.codex.effort, 'auto');
    writeFileSync(join(dir, 'lanes.json'), JSON.stringify({ enabled: ['codex'], defaults: { codex: { effort: 'autox' } } }));
    assert.equal(laneConfig(dir), null);
    writeFileSync(join(dir, 'lanes.json'), JSON.stringify({ enabled: ['qwen'], defaults: { qwen: { effort: 'auto' } } }));
    assert.equal(laneConfig(dir), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('plans validate before writing and effort auto affects only eligible cli-run lanes', () => {
  const root = mkdtempSync(join(tmpdir(), 'orch-plans-'));
  const dir = join(root, 'out');
  const project = join(root, 'project');
  try {
    for (const args of [
      ['--yes', '--level', '2', '--ais', 'codex', '--plans', 'nope=plus', '--dir', dir, '--project', project],
      ['--yes', '--level', '2', '--ais', 'codex', '--plans', 'agy=ai-pro', '--dir', dir, '--project', project],
      ['--yes', '--level', '2', '--ais', 'codex', '--plans', 'codex=nope', '--dir', dir, '--project', project],
      ['--yes', '--level', '2', '--ais', 'codex', '--plans', 'codex=plus,codex=pro-5x', '--dir', dir, '--project', project]
    ]) assert.equal(run(args).status, 2, args.join(' '));
    const ok = run(['--yes', '--level', '2', '--ais', 'claude-code,codex,agy', '--plans', 'claude-code=max-20x,codex=pro-20x,agy=ai-pro', '--effort-auto', '--dir', dir, '--project', project, '--no-install']);
    assert.equal(ok.status, 0, ok.stderr);
    const lanes = JSON.parse(readFileSync(join(dir, 'bin', 'lanes.json'), 'utf8'));
    assert.deepEqual(lanes.defaults, { codex: { effort: 'auto' } });
    const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
    assert.deepEqual(manifest.plans, { agy: 'ai-pro', 'claude-code': 'max-20x', codex: 'pro-20x' });
    assert.deepEqual(manifest.effortAuto, ['codex']);
    const routing = readFileSync(join(dir, 'ROUTING.md'), 'utf8');
    assert.match(routing, /\| Plan \|/);
    assert.match(routing, /Plan guidance/);
    const kept = run(['--yes', '--level', '2', '--ais', 'claude-code,codex,agy', '--plans', 'agy=ai-pro,codex=pro-20x,claude-code=max-20x', '--dir', dir, '--project', project, '--no-install']);
    assert.equal(kept.status, 0, kept.stderr);
    assert.match(kept.stdout, /selection identical/);
    const reset = run(['--yes', '--level', '2', '--ais', 'claude-code,codex,agy', '--plans', 'none', '--dir', dir, '--project', project, '--no-install']);
    assert.equal(reset.status, 0, reset.stderr);
    const resetManifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
    assert.equal(resetManifest.plans, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
