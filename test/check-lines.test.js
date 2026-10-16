import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'line-cap-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const folder of ['bin', 'src', 'templates', 'scripts']) mkdirSync(join(root, folder));
  copyFileSync(new URL('../scripts/check-lines.js', import.meta.url), join(root, 'scripts', 'check-lines.mjs'));
  return root;
}

function run(root) {
  return spawnSync(process.execPath, [join(root, 'scripts', 'check-lines.mjs')], { encoding: 'utf8' });
}

test('line cap accepts 160 characters, CRLF and non-JavaScript files', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'src', 'boundary.js'), 'a'.repeat(160) + '\r\n');
  writeFileSync(join(root, 'templates', 'guide.md'), 'a'.repeat(161));
  const result = run(root);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 over-limit lines/);
});

test('line cap reports every violation in nested JS and MJS across all source roots', t => {
  const root = fixture(t);
  for (const folder of ['bin', 'src', 'templates', 'scripts']) {
    mkdirSync(join(root, folder, 'nested'));
    writeFileSync(join(root, folder, 'nested', 'long.mjs'), 'a'.repeat(160) + '\n' + 'a'.repeat(161));
  }
  writeFileSync(join(root, 'src', 'unicode.js'), '😀'.repeat(81));
  const result = run(root);
  assert.equal(result.status, 1);
  for (const folder of ['bin', 'src', 'templates', 'scripts']) {
    assert.ok(result.stderr.includes(join(folder, 'nested', 'long.mjs') + ':2: 161 characters'));
  }
  assert.match(result.stderr, /unicode.js:1: 162 characters/);
  assert.match(result.stdout, /5 over-limit lines/);
});
