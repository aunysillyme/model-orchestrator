import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { briefVerifyCommands, LANES, readFallbackConfig, REASONS, runVerifyCommands, selectFallback } from '../bin/cli-run.mjs';
import { planAgensiFiles } from '../src/agensi.js';
import { planFiles } from '../src/install.js';
import { byId } from '../src/catalog.js';

const RUNNER = fileURLToPath(new URL('../bin/cli-run.mjs', import.meta.url));
const POSIX = process.platform !== 'win32';
const QUOTA = 'process.stderr.write("you\\\'ve hit your usage limit\\n"); process.exit(1);';

function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'runner-audit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return dir;
}
function lane(dir, name, body) {
  const bin = join(dir, 'stubs');
  mkdirSync(bin, { recursive: true });
  if (POSIX) writeFileSync(join(bin, name), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  else {
    writeFileSync(join(bin, `${name}.cjs`), body);
    writeFileSync(join(bin, `${name}.cmd`), `"%_prog%" "%dp0%${name}.cjs" %*\r\n`);
  }
}
function envFor(dir, extra = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (['PATH', 'HOME', 'USERPROFILE', 'CLI_RUN_FALLBACKS', 'CLI_RUN_NO_FALLBACK'].includes(key.toUpperCase())) delete env[key];
  }
  return { ...env, PATH: join(dir, 'stubs'), HOME: dir, USERPROFILE: dir, ...extra };
}
function run(dir, args, extra = {}) {
  return spawnSync(process.execPath, [RUNNER, ...args], { cwd: dir, env: envFor(dir, extra), encoding: 'utf8', timeout: 10000 });
}
function records(dir) {
  return readFileSync(join(dir, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
}
function fallbacks(dir, config) {
  const path = join(dir, 'fallbacks.json');
  writeFileSync(path, JSON.stringify(config));
  return { CLI_RUN_FALLBACKS: path };
}
function script(dir, body) {
  const path = join(dir, 'verify.cjs');
  writeFileSync(path, body);
  return `${JSON.stringify(process.execPath)} ${JSON.stringify(path)}`;
}
async function until(predicate) {
  for (let i = 0; i < 150; i++) {
    if (predicate()) return true;
    await delay(20);
  }
  return false;
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    // Linux can retain a killed orphan as a zombie until init reaps it.
    if (process.platform === 'linux' && /\) Z /.test(readFileSync(`/proc/${pid}/stat`, 'utf8'))) return false;
    return true;
  } catch { return false; }
}
function verifyTree(t, dir, wait = false) {
  const path = join(dir, 'verify-pids');
  t.after(() => {
    if (!existsSync(path)) return;
    const [group, pid] = readFileSync(path, 'utf8').trim().split(' ').map(Number);
    try { process.kill(-group, 'SIGKILL'); } catch { /* already gone */ }
    try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
  });
  return { path, command: `/bin/sleep 30 >/dev/null 2>&1 & echo "$$ $!" > ${JSON.stringify(path)}${wait ? '; wait' : ''}` };
}

for (const section of ['**Verify commands.**', '## Verify commands']) {
  for (const end of ['**Exit parameters.** one pass', '# Next', '## Next', '### Next']) {
    test(`verify section ${section} ends at ${end}`, () => {
      assert.deepEqual(briefVerifyCommands(`${section}\n$ npm test\n${end}\n## Diff under audit\necho outside`), ['npm test']);
    });
  }
}

test('audit quota keeps read-only high effort and returns 15 without a writable hop', t => {
  const dir = temp(t);
  const seen = join(dir, 'audit-argv');
  const hopped = join(dir, 'hopped');
  lane(dir, 'codex', `require('node:fs').writeFileSync(${JSON.stringify(seen)}, JSON.stringify(process.argv)); ${QUOTA}`);
  lane(dir, 'hermes', `require('node:fs').writeFileSync(${JSON.stringify(hopped)}, 'yes'); console.log('complete');`);
  const result = run(dir, ['codex', 'probe', '--audit', '--effort', 'auto'], fallbacks(dir, {
    lanes: { codex: [{ lane: 'hermes', pool: 'other' }] }
  }));
  assert.equal(result.status, 15, result.stderr);
  assert.equal(existsSync(hopped), false);
  const argv = JSON.parse(readFileSync(seen, 'utf8'));
  assert.equal(argv[argv.indexOf('--sandbox') + 1], 'read-only');
  assert.ok(argv.some(arg => arg.includes('model_reasoning_effort="high"')));
  assert.equal(records(dir).length, 1);
});

for (const layout of ['level 2', 'Agensi']) {
  test(`fallback discovery follows the generated ${layout} layout`, t => {
    const dir = temp(t);
    const files = layout === 'Agensi' ? planAgensiFiles() : planFiles({
      level: 2, selected: [byId.codex], primary: byId.codex, dir, project: dir
    });
    const runner = files.find(file => file.rel.endsWith('bin/cli-run.mjs'));
    const config = files.find(file => file.rel.endsWith('fallbacks.json'));
    assert.ok(runner && config);
    const target = join(dir, config.rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, config.content);
    assert.deepEqual(readFallbackConfig(dirname(join(dir, runner.rel)), {}).config, JSON.parse(config.content));
  });
}

test('exhausted quota chain writes one complete schema-valid record per attempt', t => {
  const dir = temp(t);
  lane(dir, 'codex', QUOTA);
  const result = run(dir, ['codex', 'probe'], fallbacks(dir, {
    pools: { codex: 'shared' }, lanes: { codex: [{ lane: 'hermes', pool: 'shared' }] }
  }));
  assert.equal(result.status, 15, result.stderr);
  const lines = records(dir);
  assert.equal(lines.length, 1);
  assert.ok(REASONS.has(lines[0].reason));
  for (const field of ['cli_rc', 'signal', 'seconds', 'raw_bytes', 'deliverable_bytes', 'effort_resolved']) {
    assert.ok(Object.hasOwn(lines[0], field), field);
  }
  assert.ok(lines[0].hops.some(hop => hop.lane === 'hermes' && hop.exit === 'skipped'));
});

test('verify normal exit kills a background sleep descendant', { skip: !POSIX }, async t => {
  const dir = temp(t);
  lane(dir, 'hermes', "console.log('complete');");
  const tree = verifyTree(t, dir);
  const result = run(dir, ['hermes', 'probe', '--verify', tree.command]);
  assert.equal(result.status, 0, result.stderr);
  const pid = Number(readFileSync(tree.path, 'utf8').trim().split(' ')[1]);
  assert.equal(await until(() => !alive(pid)), true, 'background verify descendant survived');
});

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
  test(`verify ${signal} kills its process group and exits ${code}`, { skip: !POSIX }, async t => {
    const dir = temp(t);
    lane(dir, 'hermes', "console.log('complete');");
    const tree = verifyTree(t, dir, true);
    const child = spawn(process.execPath, [RUNNER, 'hermes', 'probe', '--verify', tree.command], {
      cwd: dir, env: envFor(dir), stdio: 'ignore'
    });
    t.after(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } });
    const closed = new Promise(resolve => child.once('close', (status, sig) => resolve({ status, sig })));
    assert.ok(await until(() => existsSync(tree.path)), 'verify process started');
    const pid = Number(readFileSync(tree.path, 'utf8').trim().split(' ')[1]);
    child.kill(signal);
    const result = await closed;
    assert.equal(await until(() => !alive(pid)), true, 'interrupted verify descendant survived');
    assert.equal(result.status, code);
    assert.equal(records(dir).at(-1).class, 'interrupted');
  });
}

test('verify redacts a synthetic token split at the output cap before clipping', async t => {
  const dir = temp(t);
  const command = script(dir, `
    process.stdout.write('x'.repeat(1024 * 1024 - 5) + 'sk-zz');
    setTimeout(() => process.stdout.write('z'.repeat(30) + '\\n'), 50);
  `);
  const result = await runVerifyCommands([command], { cwd: dir, home: dir, quiet: true });
  assert.equal(result.failed, false);
  const body = readFileSync(result.logPath, 'utf8');
  assert.equal(body.includes('sk-'), false, 'partial synthetic token reached the verify log');
  assert.match(body, /\[REDACTED\]/);
});

test('verify waits for stream close and retains the final output', async t => {
  const dir = temp(t);
  const command = script(dir, "process.stdout.write('x'.repeat(200000) + 'FINAL-OUTPUT');");
  const result = await runVerifyCommands([command], { cwd: dir, home: dir, quiet: true });
  assert.equal(result.failed, false);
  assert.match(readFileSync(result.logPath, 'utf8'), /FINAL-OUTPUT/);
});

test('fallback validates unknown lanes before exhausted pools', () => {
  const picked = selectFallback({ lanes: { codex: [{ lane: 'unknown', pool: 'shared' }] } }, 'codex', new Set(['shared']));
  assert.equal(picked.skips[0].reason, 'unknown lane');
});

test('fallback diagnostics escape lane and pool controls and hops contain only known lanes', t => {
  const dir = temp(t);
  lane(dir, 'codex', QUOTA);
  const control = '\x1b[31m';
  const result = run(dir, ['codex', 'probe', '--quiet'], fallbacks(dir, {
    pools: { codex: `shared${control}` },
    lanes: { codex: [{ lane: `unknown${control}`, pool: `shared${control}` }, { lane: 'hermes', pool: `shared${control}` }] }
  }));
  assert.equal(result.status, 15, result.stderr);
  assert.equal(result.stderr.includes('\x1b'), false);
  assert.ok(result.stderr.includes('\\x1b'));
  assert.ok(records(dir).every(record => (record.hops || []).every(hop => LANES.includes(hop.lane))));
});

test('fallback file diagnostics escape terminal controls', t => {
  const dir = temp(t);
  lane(dir, 'codex', QUOTA);
  const result = run(dir, ['codex', 'probe', '--quiet'], { CLI_RUN_FALLBACKS: join(dir, 'missing\x1b[31m.json') });
  assert.equal(result.status, 15, result.stderr);
  assert.equal(result.stderr.includes('\x1b'), false);
  assert.ok(result.stderr.includes('\\x1b'));
});

test('verify diagnostics escape terminal controls in commands', t => {
  const dir = temp(t);
  lane(dir, 'hermes', "console.log('complete');");
  const result = run(dir, ['hermes', 'probe', '--verify', `${script(dir, 'process.exit(3);')} # \x1b[31m`]);
  assert.equal(result.status, 24, result.stderr);
  assert.equal(result.stderr.includes('\x1b'), false);
  assert.ok(result.stderr.includes('\\x1b'));
});
