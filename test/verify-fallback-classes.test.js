import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { briefVerifyCommands, parseFallbacks, selectFallback } from '../bin/cli-run.mjs';
import { formatClassRoute, parseClasses, resolveCapabilityClass, takeClassFlags } from '../src/classes.js';
import { resolveClassModel, resolveModels } from '../src/models.js';
import { planFiles } from '../src/install.js';
import { byId } from '../src/catalog.js';

const RUNNER = fileURLToPath(new URL('../bin/cli-run.mjs', import.meta.url));
const AUNX = fileURLToPath(new URL('../bin/aunx.js', import.meta.url));
const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const POSIX = process.platform !== 'win32';

function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'verify-fallback-classes-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return dir;
}
function envFor(dir, bin, extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (['PATH', 'HOME', 'USERPROFILE'].includes(key.toUpperCase())) delete env[key];
  return { ...env, PATH: bin, HOME: dir, USERPROFILE: dir, ...extra };
}
function writeLane(bin, lane, body) {
  mkdirSync(bin, { recursive: true });
  if (POSIX) writeFileSync(join(bin, lane), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  else {
    writeFileSync(join(bin, `${lane}.cjs`), body);
    writeFileSync(join(bin, `${lane}.cmd`), `"%_prog%" "%dp0%${lane}.cjs" %*\r\n`);
  }
}
function shellNode(script) {
  if (process.platform === 'win32') return `"${process.execPath}" -e "${script.replace(/"/g, '\\"')}"`;
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}
function run(dir, args, extra) {
  const bin = join(dir, 'stubs');
  return spawnSync(process.execPath, [RUNNER, ...args], { encoding: 'utf8', env: envFor(dir, bin, extra), timeout: 15000, cwd: dir });
}
function logLines(dir) {
  return readFileSync(join(dir, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
}
const lineup = () => Object.fromEntries([['opus', 4, 20], ['sonnet', 2, 10], ['haiku', .1, .5]].map(([family, price_in, price_out]) => [family, {
   id: `claude-${family}-5-5`, price_in, price_out }]));
const snapshot = () => resolveModels(lineup(), { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-5-5' });

test('brief verify field skips none, fences, placeholders and a leading dollar', () => {
  const template = readFileSync(fileURLToPath(new URL('../templates/common/TASK_BRIEF.md', import.meta.url)), 'utf8');
  assert.deepEqual(briefVerifyCommands(template), []);
  const text = [
    '## Verify commands',
    '',
    'none',
    'none with a reason',
    '<One shell command per line. Write `none` when this task has no command. A leading `$ ` is optional.>',
    '```',
    'process.exit(9)',
    '```',
    '$ npm test',
    '## Resource inventory',
    'npm run ignored'
  ].join('\n');
  assert.deepEqual(briefVerifyCommands(text), ['npm test']);
  assert.deepEqual(briefVerifyCommands('**Verify commands.**\n$ npm test\n**Purpose.**\nnope'), ['npm test']);
});

test('selectFallback skips an exhausted pool and a missing CLI, and names the next lane', () => {
  const shipped = parseClasses(readFileSync(fileURLToPath(new URL('../templates/intermediate/classes.json', import.meta.url)), 'utf8'));
  assert.deepEqual(Object.keys(shipped.classes).sort(), ['fast', 'frontier', 'swarm']);
  const config = parseFallbacks(readFileSync(fileURLToPath(new URL('../templates/intermediate/fallbacks.json', import.meta.url)), 'utf8'));
  assert.ok(config.lanes.codex.length);
  const skipped = selectFallback(config, 'codex', new Set(['openai']), {
    installed: (lane) => lane === 'grok',
    enabled: ['codex', 'agy', 'grok', 'claude']
  });
  assert.equal(skipped.next.lane, 'grok');
  assert.ok(skipped.skips.some((skip) => skip.lane === 'agy' && skip.reason === 'not installed'));
  const exhausted = selectFallback(config, 'codex', new Set(['openai', 'google', 'xai', 'anthropic']), { installed: () => true });
  assert.equal(exhausted.next, null);
  assert.ok(exhausted.skips.every((skip) => /already exhausted/.test(skip.reason)));
});

test('resolveClassModel uses the snapshot tier and otherwise the family', () => {
  const snap = snapshot();
  assert.equal(resolveClassModel('standard', snap), 'claude-sonnet-5-5');
  assert.equal(resolveClassModel('deep', snap), 'opus');
  assert.equal(resolveClassModel('standard', null), 'sonnet');
  assert.equal(resolveClassModel('lane-default', snap), null);
  assert.equal(resolveClassModel('fast', null), 'haiku');
});

test('verify commands pass, and a positional prompt is not scanned', t => {
  const dir = temp(t);
  writeLane(join(dir, 'stubs'), 'hermes', 'console.log("complete");');
  const brief = join(dir, 'TASK_BRIEF.md');
  writeFileSync(brief, `## Verify commands\n\n${shellNode('console.log("verify-ok")')}\n`);
  const ok = run(dir, ['hermes', '--brief', brief]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /complete/);
  assert.match(ok.stderr, /cli-run verify: PASS/);
  assert.match(readFileSync(join(dir, '.ai-orchestrator', 'cli-run-verify.log'), 'utf8'), /verify-ok/);
  const record = logLines(dir).at(-1);
  assert.equal(record.rc, 0);
  assert.equal(record.verify.length, 1);
  assert.equal(record.verify[0].exit, 0);
  const positional = run(dir, ['hermes', '## Verify commands\nprocess.exit(9)']);
  assert.equal(positional.status, 0, positional.stderr);
  assert.equal(logLines(dir).at(-1).verify, undefined);
});

test('a failing verify command exits 24, keeps the lane output, and stops the list', t => {
  const dir = temp(t);
  const marker = join(dir, 'second-ran');
  writeLane(join(dir, 'stubs'), 'hermes', 'console.log("complete");');
  const failed = run(dir, ['hermes', 'probe', '--quiet', '--verify', shellNode('process.exit(3)'), '--verify', shellNode(`require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'x')`)]);
  assert.equal(failed.status, 24, failed.stderr);
  assert.match(failed.stdout, /complete/);
  assert.match(failed.stderr, /cli-run verify: failing command exited 3:/);
  assert.equal(existsSync(marker), false);
  const record = logLines(dir).at(-1);
  assert.equal(record.class, 'verify');
  assert.equal(record.rc, 24);
  assert.equal(record.reason, 'verify_failed');
});

test('verify none and a timeout keep the documented outcomes', t => {
  const dir = temp(t);
  writeLane(join(dir, 'stubs'), 'hermes', 'console.log("complete");');
  const brief = join(dir, 'TASK_BRIEF.md');
  writeFileSync(brief, '## Verify commands\n\nnone\n');
  const none = run(dir, ['hermes', '--brief', brief, '--quiet']);
  assert.equal(none.status, 0, none.stderr);
  assert.equal(logLines(dir).at(-1).verify, undefined);
  const timed = run(dir, ['hermes', 'probe', '--verify', shellNode('setTimeout(() => {}, 20000)'), '--verify-timeout', '1']);
  assert.equal(timed.status, 24, timed.stderr);
  assert.match(timed.stdout, /complete/);
  assert.match(timed.stderr, /cli-run verify: failing command exited timeout:/);
});

test('quota with no fallbacks file is unchanged, and an explicit missing file is named', t => {
  const dir = temp(t);
  writeLane(join(dir, 'stubs'), 'codex', 'process.stderr.write("you\'ve hit your usage limit\\n"); process.exit(1);');
  const same = run(dir, ['codex', 'probe', '--quiet']);
  assert.equal(same.status, 15, same.stderr);
  assert.doesNotMatch(same.stderr, /hop:|FALLBACK/);
  const lines = logLines(dir);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].hops, undefined);
  const missing = run(dir, ['codex', 'probe', '--quiet'], { CLI_RUN_FALLBACKS: join(dir, 'missing.json') });
  assert.equal(missing.status, 15, missing.stderr);
  assert.match(missing.stderr, /cli-run fallback: cannot read/);
});

test('a quota walk hops to the next installed pool and records the lane that ran', t => {
  const dir = temp(t);
  const seen = join(dir, 'argv.json');
  const bin = join(dir, 'stubs');
  writeLane(bin, 'codex', 'process.stderr.write("you\'ve hit your usage limit\\n"); process.exit(1);');
  writeLane(bin, 'hermes', `require('node:fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify(process.argv));\nconsole.log('complete');\n`);
  const file = join(dir, 'fallbacks.json');
  writeFileSync(file, JSON.stringify({
    pools: { codex: 'openai', agy: 'google', hermes: 'hermes' },
    lanes: { codex: [{ lane: 'agy', pool: 'google' }, { lane: 'hermes', pool: 'hermes' }] }
  }));
  const result = run(dir, ['codex', 'same-prompt-token', '--model', 'pin-model', '--effort', 'high'], { CLI_RUN_FALLBACKS: file });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /complete/);
  assert.match(result.stderr, /cli-run hop: agy reason=not installed exit=skipped/);
  assert.match(result.stderr, /cli-run FALLBACK hermes/);
  const argv = JSON.parse(readFileSync(seen, 'utf8'));
  assert.ok(argv.includes('same-prompt-token'));
  assert.ok(!argv.includes('pin-model'));
  const last = logLines(dir).at(-1);
  assert.equal(last.lane, 'hermes');
  assert.equal(last.model_requested, null);
  assert.equal(last.model_source, 'lane_default');
  assert.ok(last.hops.some((hop) => hop.lane === 'codex' && hop.reason === 'quota' && hop.exit === 15));
  assert.ok(last.hops.some((hop) => hop.lane === 'agy' && hop.exit === 'skipped'));
  assert.ok(last.hops.some((hop) => hop.lane === 'hermes' && hop.exit === 0));
});

test('an exhausted pool is skipped, and switches can be turned off', t => {
  const dir = temp(t);
  const bin = join(dir, 'stubs');
  writeLane(bin, 'codex', 'process.stderr.write("you\'ve hit your usage limit\\n"); process.exit(1);');
  writeLane(bin, 'hermes', 'process.stderr.write("limit\\n"); process.exit(1);');
  writeLane(bin, 'grok', 'console.log(JSON.stringify({stopReason:"end_turn", text:"done"}));');
  const file = join(dir, 'fallbacks.json');
  writeFileSync(file, JSON.stringify({
    pools: { codex: 'openai', hermes: 'hermes', agy: 'google', grok: 'xai' },
    lanes: {
      codex: [{ lane: 'hermes', pool: 'hermes' }],
      hermes: [{ lane: 'agy', pool: 'hermes' }, { lane: 'grok', pool: 'xai' }]
    }
  }));
  const walked = run(dir, ['codex', 'probe', '--quiet'], { CLI_RUN_FALLBACKS: file });
  assert.equal(walked.status, 0, walked.stderr);
  assert.match(walked.stderr, /cli-run hop: agy reason=pool hermes already exhausted exit=skipped/);
  assert.match(walked.stderr, /cli-run FALLBACK grok/);
  const off = run(dir, ['codex', 'probe', '--quiet', '--no-fallback'], { CLI_RUN_FALLBACKS: file });
  assert.equal(off.status, 15, off.stderr);
  assert.doesNotMatch(off.stderr, /hop:|FALLBACK/);
  const envOff = run(dir, ['codex', 'probe', '--quiet'], { CLI_RUN_FALLBACKS: file, CLI_RUN_NO_FALLBACK: '1' });
  assert.equal(envOff.status, 15, envOff.stderr);
  assert.doesNotMatch(envOff.stderr, /hop:|FALLBACK/);
});

test('--class prints the first installed eligible lane and names earlier skips', t => {
  const dir = temp(t);
  const bin = join(dir, 'bin');
  mkdirSync(bin, { recursive: true });
  const mark = (name) => {
    if (POSIX) writeFileSync(join(bin, name), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    else writeFileSync(join(bin, `${name}.cmd`), '@echo off\r\n');
  };
  mark('claude');
  writeFileSync(join(dir, 'classes.json'), JSON.stringify({
    eligibility: {
      public: ['codex', 'claude', 'qwen', 'hermes'],
      private: ['codex', 'claude'],
      read: ['codex', 'claude', 'qwen', 'hermes'],
      write: ['codex', 'claude']
    },
    classes: {
      frontier: [{ lane: 'codex', model: 'lane-default', effort: 'high' }, { lane: 'claude', model: 'standard', effort: 'high' }],
      fast: [{ lane: 'qwen', model: 'lane-default', effort: null }, { lane: 'hermes', model: 'lane-default', effort: 'low' }]
    }
  }));
  const route = (args, cwd = dir) => spawnSync(process.execPath, [AUNX, 'route', ...args], { encoding: 'utf8', cwd, env: envFor(dir, bin), timeout: 15000 });
  const plain = route(['--class', 'frontier']);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /claude model=sonnet effort=high/);
  assert.match(plain.stdout, /skipped codex: not installed/);
  writeFileSync(join(dir, 'MANIFEST.json'), JSON.stringify({ models: snapshot() }));
  const resolved = route(['--class', 'frontier', '--json']);
  assert.equal(resolved.status, 0, resolved.stderr);
  const body = JSON.parse(resolved.stdout);
  assert.equal(body.lane, 'claude');
  assert.equal(body.model, 'claude-sonnet-5-5');
  assert.equal(body.effort, 'high');
  assert.equal(body.skipped[0].reason, 'not installed');
  mark('qwen');
  const pub = route(['--class', 'fast', '--data', 'public']);
  assert.equal(pub.status, 0, pub.stderr);
  assert.match(pub.stdout, /qwen model=default effort=none/);
  const priv = route(['--class', 'fast']);
  assert.equal(priv.status, 13, priv.stderr);
  assert.match(priv.stdout, /skipped qwen: not eligible for private data/);
  assert.match(priv.stdout, /no eligible lane/);
  mark('hermes');
  const writing = route(['--class', 'fast', '--data', 'public', '--write', '--json']);
  assert.equal(writing.status, 13, writing.stderr);
  const denied = JSON.parse(writing.stdout);
  assert.equal(denied.lane, null);
  assert.ok(denied.skipped.some((skip) => skip.lane === 'hermes' && skip.reason === 'not eligible to write'));
  assert.match(writing.stderr, /no eligible lane/);
  const empty = join(dir, 'empty');
  mkdirSync(empty);
  const absent = route(['--class', 'frontier'], empty);
  assert.equal(absent.status, 2, absent.stderr);
  assert.match(absent.stderr, /classes.json not found/);
  assert.throws(() => takeClassFlags(['--class', 'frontier', 'extra']), /usage/);
  const local = resolveCapabilityClass(parseClasses(readFileSync(join(dir, 'classes.json'), 'utf8')), {
    name: 'frontier', installed: (lane) => lane === 'codex'
  });
  assert.equal(formatClassRoute(local, false), 'codex model=default effort=high');
});

test('level 2 dry run lists fallbacks.json and classes.json', () => {
  const files = planFiles({ level: 2, selected: [byId.codex], primary: byId.codex, dir: '/tmp/verify-fallback-classes', project: '/tmp/verify-fallback-classes' });
  assert.ok(files.some((file) => file.rel === 'fallbacks.json'));
  assert.ok(files.some((file) => file.rel === 'classes.json'));
  const dry = spawnSync(process.execPath, [CLI, '--yes', '--level', '2', '--ais', 'codex', '--no-tools', '--dry'], { encoding: 'utf8', timeout: 20000 });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /fallbacks\.json/);
  assert.match(dry.stdout, /classes\.json/);
});
