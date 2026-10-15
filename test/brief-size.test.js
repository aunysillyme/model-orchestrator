import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { argvSizeProblem, LINUX_ARG_BYTES, REASONS, WINDOWS_CMDLINE_CHARS } from '../bin/cli-run.mjs';

const RUNNER = resolve('bin/cli-run.mjs');
const POSIX = process.platform !== 'win32';
// macOS and other POSIX systems have no single-argument cap, only the total ARG_MAX, so an
// oversized brief runs there; the E2BIG fixture needs a known, finite Linux ARG_MAX to exceed.
const SKIP_BRIEF_CAP_OFF_LINUX_WINDOWS = !['linux', 'win32'].includes(process.platform) && 'the cap applies on Linux and Windows only';
const ARG_MAX = process.platform === 'linux' ? Number(spawnSync('getconf', ['ARG_MAX'], { encoding: 'utf8' }).stdout) : NaN;
const SKIP_E2BIG_OFF_LINUX = !(ARG_MAX > 0 && ARG_MAX <= 64 * 1024 * 1024) && 'the E2BIG fixture needs a finite Linux ARG_MAX';
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'brief-size-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  return dir;
}
function envFor(dir, bin) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (['PATH', 'HOME', 'USERPROFILE'].includes(key.toUpperCase())) delete env[key];
  return { ...env, PATH: bin, HOME: dir, USERPROFILE: dir };
}
// A lane that leaves a marker if it ever starts, so a refused run is provably never spawned.
function writeLane(bin, lane, marker) {
  const body = `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran'); console.log(JSON.stringify({ stopReason: 'end_turn', text: 'OK' }));`;
  mkdirSync(bin, { recursive: true });
  if (POSIX) writeFileSync(join(bin, lane), `#!${process.execPath}\n${body}`, { mode: 0o755 });
  else {
    writeFileSync(join(bin, `${lane}.cjs`), body);
    writeFileSync(join(bin, `${lane}.cmd`), `"%_prog%" "%dp0%${lane}.cjs" %*\r\n`);
  }
}
const lastRecord = dir => {
  const lines = readFileSync(join(dir, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8').trim().split('\n');
  return JSON.parse(lines[lines.length - 1]);
};

test('argvSizeProblem applies the Linux single-argument cap and the Windows command-line cap (#71)', () => {
  assert.equal(LINUX_ARG_BYTES, 131071);
  assert.equal(WINDOWS_CMDLINE_CHARS, 32767);
  assert.equal(argvSizeProblem(['grok', '-p', 'x'.repeat(LINUX_ARG_BYTES)], 'linux'), null);
  assert.match(argvSizeProblem(['grok', '-p', 'x'.repeat(LINUX_ARG_BYTES + 1)], 'linux'), /131072 bytes.*128 KiB/);
  // Bytes, not characters: 50,000 three-byte characters are 150,000 bytes.
  assert.match(argvSizeProblem(['grok', '-p', '\u20ac'.repeat(50000)], 'linux'), /150000 bytes/);
  assert.equal(argvSizeProblem(['grok.exe', '-p', 'x'.repeat(30000)], 'win32'), null);
  assert.match(argvSizeProblem(['grok.exe', '-p', 'x'.repeat(WINDOWS_CMDLINE_CHARS)], 'win32'), /Windows caps it at 32767/);
  assert.equal(argvSizeProblem(['grok', '-p', 'x'.repeat(200 * 1024)], 'darwin'), null, 'other platforms rely on the spawn error');
  assert.ok(REASONS.has('prompt_too_large'));
});

test('cli-run refuses an oversized --brief before spawning and does not blame a missing CLI (#71)', { skip: SKIP_BRIEF_CAP_OFF_LINUX_WINDOWS }, t => {
  const dir = temp(t);
  const bin = join(dir, 'stubs');
  const marker = join(dir, 'lane-ran');
  writeLane(bin, 'grok', marker);
  const brief = join(dir, 'BRIEF.md');
  writeFileSync(brief, 'x'.repeat(200 * 1024));
  const result = spawnSync(process.execPath, [RUNNER, 'grok', '--brief', brief], { env: envFor(dir, bin), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 16, result.stderr);
  assert.match(result.stderr, /prompt too large for the command line/);
  assert.match(result.stderr, /fix: save the brief to a file and pass a short prompt that names its path/);
  assert.doesNotMatch(result.stderr, /install the grok CLI|unavailable/);
  assert.equal(existsSync(marker), false, 'the lane must never start');
  const record = lastRecord(dir);
  assert.equal(record.reason, 'prompt_too_large');
  assert.equal(record.class, 'rejected');
  assert.equal(record.rc, 16);
  assert.equal(record.prompt_chars, 200 * 1024);
});

test('cli-run still runs a brief under the cap (#71)', t => {
  const dir = temp(t);
  const bin = join(dir, 'stubs');
  const marker = join(dir, 'lane-ran');
  writeLane(bin, 'grok', marker);
  const brief = join(dir, 'BRIEF.md');
  writeFileSync(brief, 'x'.repeat(20 * 1024));
  const result = spawnSync(process.execPath, [RUNNER, 'grok', '--brief', brief], { env: envFor(dir, bin), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(marker), true);
});

test('cli-run reports a spawn E2BIG as prompt_too_large, not as an unavailable CLI (#71)', { skip: SKIP_E2BIG_OFF_LINUX }, t => {
  const dir = temp(t);
  const bin = join(dir, 'stubs');
  const marker = join(dir, 'lane-ran');
  writeLane(bin, 'grok', marker);
  // Each prompt and environment string stays under the single-argument cap,
  // but the environment the lane inherits pushes argv + env past ARG_MAX.
  const pad = 100 * 1024;
  const count = Math.ceil(ARG_MAX / pad) + 4;
  const code = `for (let i = 0; i < ${count}; i++) process.env['PAD_' + i] = 'x'.repeat(${pad});
const { main } = await import(${JSON.stringify(pathToFileURL(RUNNER).href)});
process.exitCode = await main(['grok', 'x'.repeat(${pad})]);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], { env: envFor(dir, bin), encoding: 'utf8', timeout: 10000 });
  assert.equal(result.status, 16, result.stderr);
  assert.match(result.stderr, /prompt too large for the command line .*spawn E2BIG/);
  assert.doesNotMatch(result.stderr, /install the grok CLI/);
  assert.equal(existsSync(marker), false);
  assert.equal(lastRecord(dir).reason, 'prompt_too_large');
});
