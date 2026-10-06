import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { gitChangedLines, laneConfig, resolveAutoEffort } from '../bin/cli-run.mjs';

const RUNNER = resolve('bin/cli-run.mjs');
const POSIX = process.platform !== 'win32';
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'runner-security-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return dir;
}
function envFor(dir, bin) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (['PATH', 'HOME', 'USERPROFILE'].includes(key.toUpperCase())) delete env[key];
  return { ...env, PATH: bin, HOME: dir, USERPROFILE: dir };
}
function writeLane(bin, lane, body) {
  mkdirSync(bin, { recursive: true });
  if (POSIX) writeFileSync(join(bin, lane), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  else {
    writeFileSync(join(bin, `${lane}.cjs`), body);
    writeFileSync(join(bin, `${lane}.cmd`), `"%_prog%" "%dp0%${lane}.cjs" %*\r\n`);
  }
}

// Minimal valid repository fixture, created without committing into any repository.
function repoWithMonitor(dir, monitor) {
  const git = join(dir, '.git');
  mkdirSync(join(git, 'refs', 'heads'), { recursive: true });
  mkdirSync(join(git, 'objects'), { recursive: true });
  const object = (kind, body) => {
    const bytes = Buffer.concat([Buffer.from(`${kind} ${Buffer.byteLength(body)}\0`), Buffer.from(body)]);
    const sha = createHash('sha1').update(bytes).digest('hex');
    mkdirSync(join(git, 'objects', sha.slice(0, 2)), { recursive: true });
    writeFileSync(join(git, 'objects', sha.slice(0, 2), sha.slice(2)), deflateSync(bytes));
    return sha;
  };
  const tree = object('tree', '');
  const commit = object('commit', `tree ${tree}\nauthor Test <test@example.invalid> 1 +0000\ncommitter Test <test@example.invalid> 1 +0000\n\nfixture\n`);
  writeFileSync(join(git, 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(join(git, 'refs', 'heads', 'main'), `${commit}\n`);
  writeFileSync(join(git, 'config'), `[core]\nrepositoryformatversion = 0\nfsmonitor = ${JSON.stringify(monitor)}\n`);
  const index = Buffer.alloc(12);
  index.write('DIRC'); index.writeUInt32BE(2, 4);
  writeFileSync(join(git, 'index'), Buffer.concat([index, createHash('sha1').update(index).digest()]));
}

test('security: audit effort never executes a repository fsmonitor helper', { skip: !POSIX && 'POSIX fsmonitor executable fixture' }, t => {
  const dir = temp(t);
  const marker = join(dir, 'monitor-ran');
  const monitor = join(dir, 'fsmonitor');
  writeFileSync(monitor, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); process.stdout.write('token\\n');`, { mode: 0o755 });
  repoWithMonitor(dir, monitor);
  const result = resolveAutoEffort('codex', 'auto', 'audit', true, dir);
  assert.equal(result.resolved, 'high');
  assert.equal(existsSync(marker), false, 'audit effort executed the repository fsmonitor helper');
  assert.ok(gitChangedLines(dir), 'remaining Git probes must still measure the valid repository');
  assert.equal(existsSync(marker), false, 'remaining Git probes executed the repository fsmonitor helper');
});

test('security: provider failure diagnostics escape terminal controls in every lane', t => {
  const dir = temp(t);
  const bin = join(dir, 'stubs');
  const message = '400 invalid_request_error: unknown model \u001b]2;changed-title\u0007 \u009b31m';
  const bodies = {
    grok: `console.log(JSON.stringify({stopReason:${JSON.stringify(message)},text:''}));`,
    agy: `console.log(JSON.stringify({event:'result',result:{status:${JSON.stringify(message)}}}));`,
    qwen: `console.log(JSON.stringify([{type:'result',subtype:'error',error:{message:${JSON.stringify(message)}}}]));`,
    codex: `console.log(JSON.stringify({type:'error',message:${JSON.stringify(message)}}));`,
    claude: `console.log(JSON.stringify({type:'result',subtype:'error_during_execution',is_error:true,errors:[${JSON.stringify(message)}],result:''}));`,
    hermes: `process.stderr.write(${JSON.stringify(message)}); process.exitCode=2;`
  };
  const unsafe = [];
  for (const [lane, body] of Object.entries(bodies)) {
    writeLane(bin, lane, body);
    const result = spawnSync(process.execPath, [RUNNER, lane, 'probe'], { env: envFor(dir, bin), encoding: 'utf8', timeout: 5000 });
    assert.ok(result.status > 0, `${lane}: ${result.stderr}`);
    if (/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/.test(result.stderr)) unsafe.push(lane);
  }
  assert.deepEqual(unsafe, [], `failure diagnostics emitted terminal controls: ${unsafe.join(', ')}`);
});

test('security: non-regular or oversized lanes configuration fails closed without blocking', { skip: !POSIX && 'FIFO fixture needs mkfifo' }, t => {
  const dir = temp(t);
  const fifo = join(dir, 'lanes.json');
  const created = spawnSync('mkfifo', [fifo], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  const code = `import { laneConfig } from ${JSON.stringify(pathToFileURL(RUNNER).href)}; console.log(JSON.stringify(laneConfig(${JSON.stringify(dir)})));`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], { encoding: 'utf8', timeout: 1500 });
  assert.equal(result.error, undefined, 'FIFO lanes configuration blocked before runner timeout');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'null');
  rmSync(fifo);
  mkdirSync(fifo);
  assert.equal(laneConfig(dir), null, 'a directory is not configuration');
  rmSync(fifo, { recursive: true });
  writeFileSync(fifo, ' '.repeat(1024 * 1024 + 1));
  assert.equal(laneConfig(dir), null, 'configuration exceeds the fixed read cap');
  rmSync(fifo);
  const target = join(dir, 'target.json');
  writeFileSync(target, JSON.stringify({ enabled: ['codex'] }));
  symlinkSync(target, fifo);
  assert.equal(laneConfig(dir), null, 'a symlink is not trusted configuration');
  rmSync(target);
  assert.equal(laneConfig(dir), null, 'a broken link must not re-enable every lane');
});

test('runner prints separate provider, model and effort fields without changing the run record', t => {
  const dir = temp(t);
  const bin = join(dir, 'stubs');
  writeLane(bin, 'hermes', 'console.log("complete");');
  const result = spawnSync(process.execPath, [RUNNER, 'hermes', 'probe', '--provider', 'openrouter', '--model', 'foo/bar', '--effort', 'high'], { env: envFor(dir, bin), encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /route=provider:openrouter model:foo\/bar effort:high ::/);
  const record = JSON.parse(readFileSync(join(dir, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8').trim());
  assert.equal(record.provider_requested, 'openrouter');
  assert.equal(record.model_requested, 'foo/bar');
  assert.equal(record.effort_requested, 'high');
  assert.equal(record.provider_source, 'flag');
  assert.equal(record.model_source, 'flag');
  assert.equal(record.effort_source, 'flag');
  assert.equal(record.class, 'ok');
  assert.deepEqual(Object.keys(record).sort(), [
    'lane', 'prompt_sha256_12', 'prompt_chars', 'model_requested', 'provider_requested',
    'provider_source', 'effort_requested', 'model_source', 'effort_source', 'effort_resolved',
    'effort_basis', 'effort_scope', 'effort_truncated', 'verdict', 'class', 'rc', 'cli_rc',
    'signal', 'refused', 'seconds', 'raw_bytes', 'deliverable_bytes', 'reason'
  ].sort());
});
