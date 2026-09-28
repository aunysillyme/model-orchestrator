import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readManifest } from '../src/install.js';
import { uninstallFiles } from '../src/uninstall.js';

const cli = resolve('bin/aunx.js');
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'security-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const run = (args, cwd) => spawnSync(process.execPath, [cli, ...args], {
  cwd, env: { ...process.env, HOME: cwd, USERPROFILE: cwd }, encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL'
});

test('metrics never executes a project implementation, with or without summary flag', t => {
  const dir = temp(t);
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'hooks', 'route-metrics.mjs'), "console.log('PROJECT_EXECUTED');process.exitCode=73;");
  for (const args of [['route-metrics'], ['route-metrics', '--summary']]) {
    const result = run(args, dir);
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stdout, /PROJECT_EXECUTED/);
    assert.match(result.stdout, /no data yet/);
  }
});

test('metrics never follows a project hook symlink', { skip: process.platform === 'win32' && 'creating symlinks requires privileges' }, t => {
  const dir = temp(t);
  mkdirSync(join(dir, '.claude', 'hooks'), { recursive: true });
  const source = join(dir, 'payload.mjs');
  writeFileSync(source, "console.log('PROJECT_EXECUTED');process.exitCode=73;");
  symlinkSync(source, join(dir, '.claude', 'hooks', 'route-metrics.mjs'));
  const result = run(['route-metrics', '--summary'], dir);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /PROJECT_EXECUTED/);
});

test('manifest reader preserves normal and absent data but refuses oversized input', t => {
  const dir = temp(t), path = join(dir, 'MANIFEST.json');
  assert.equal(readManifest(dir), null);
  writeFileSync(path, '{"generator":"model-orchestrator"}');
  assert.equal(readManifest(dir).generator, 'model-orchestrator');
  writeFileSync(path, JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }));
  assert.throws(() => readManifest(dir), /limit|large|1 MiB|1048576/);
  assert.throws(() => uninstallFiles({ dir, project: dir }), /limit|large|1 MiB|1048576/);
});

test('manifest reader refuses symlinks and FIFOs without blocking', { skip: process.platform === 'win32' && 'POSIX FIFO and symlink fixture' }, t => {
  const dir = temp(t), target = join(dir, 'target.json'), path = join(dir, 'MANIFEST.json');
  writeFileSync(target, '{}');
  symlinkSync(target, path);
  assert.throws(() => readManifest(dir), /regular|symlink/);
  rmSync(path);
  assert.equal(spawnSync('mkfifo', [path]).status, 0);
  const module = pathToFileURL(resolve('src/install.js')).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import {readManifest} from ${JSON.stringify(module)};try {readManifest(${JSON.stringify(dir)});} catch {process.exit(2);}`], { timeout: 1500, killSignal: 'SIGKILL' });
  assert.equal(result.error, undefined, 'reader must refuse, not rely on the outer timeout');
  assert.equal(result.status, 2);
});

for (const shell of [false, true]) {
  test(`check timeout terminates descendants (${shell ? 'shell' : 'argv'})`, { skip: shell && process.platform === 'win32' && 'POSIX shell fixture; argv case covers Windows' }, async t => {
    const dir = temp(t), marker = join(dir, 'late-write');
    const program = join(dir, 'parent.cjs');
    writeFileSync(program, `const {spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'late'),900)`)}],{stdio:'ignore'});setTimeout(()=>process.exit(),1800);`);
    const command = shell ? `'${process.execPath.replaceAll("'", "'\\''")}' '${program.replaceAll("'", "'\\''")}'; :` : ['node', program];
    writeFileSync(join(dir, 'checks.json'), JSON.stringify({ version: 1, checks: [{ id: 'timeout', command, timeoutMs: 400 }] }));
    const result = run(['checks', 'run', 'checks.json'], dir);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /ETIMEDOUT/);
    await new Promise(resolveWait => setTimeout(resolveWait, 1100));
    assert.equal(existsSync(marker), false, 'descendant must not write after timeout');
  });
}
