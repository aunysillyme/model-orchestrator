import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, renameSync, symlinkSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readRegularFile } from '../src/bounded-file.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const ARGS = ['--yes', '--level', '1', '--ais', 'claude-code', '--primary', 'claude-code'];

// S2 (1.0.1 audit): rerunning over a symlinked MANIFEST.json is refused, and the
// refusal names the file and the fix instead of a bare "expected a regular file".
test('S2: a symlinked manifest refusal names the file and how to fix it', { skip: process.platform === 'win32' }, (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mo-s2-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'ai');
  mkdirSync(join(root, 'home'));
  const env = { ...process.env, HOME: join(root, 'home') };
  const run = () => spawnSync(process.execPath, [CLI, ...ARGS, '--project', root, '--dir', dir], { encoding: 'utf8', env, input: '' });
  assert.equal(run().status, 0);
  renameSync(join(dir, 'MANIFEST.json'), join(root, 'real.json'));
  symlinkSync(join(root, 'real.json'), join(dir, 'MANIFEST.json'));
  const r = run();
  assert.notEqual(r.status, 0);
  const out = r.stdout + r.stderr;
  assert.match(out, /MANIFEST\.json: expected a regular file, not a symlink/);
  assert.match(out, /replace the link with the file it points to/);
  // Audit of 1.0.2: a crafted link name must not reach the terminal as raw escape bytes.
  writeFileSync(join(root, 'target.json'), '{}');
  const evil = join(root, 'c-\u001b[2J-x.json');
  symlinkSync(join(root, 'target.json'), evil);
  assert.throws(() => readRegularFile(evil, 1024), (e) => !/\u001b/.test(e.message) && e.message.includes('c-\\x1b[2J-x.json'));
});

// Audit of 1.0.2: a directory (or FIFO) is not a symlink, so it gets no symlink advice.
test('a non-file path is refused without symlink advice', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'mo-dir-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  assert.throws(() => readRegularFile(root, 1024), (e) => /expected a regular file; point the command at a file/.test(e.message) && !/symlink/.test(e.message));
});

// S1 (1.0.1 audit): the timeout reaches the process group only; the protocol
// says plainly that a descendant in its own session keeps running.
test('S1: the acceptance-check protocol names the setsid limit', () => {
  const doc = readFileSync(new URL('../templates/common/protocols/acceptance-checks.md', import.meta.url), 'utf8');
  assert.match(doc, /starts its own session \(for example with `setsid`\)/);
});
