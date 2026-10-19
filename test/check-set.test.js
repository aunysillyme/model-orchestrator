import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../scripts/check-set.mjs', import.meta.url));

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'check-set-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.repo-build'));
  mkdirSync(join(root, 'scripts'));
  for (const file of ['README.md', 'llms.txt', 'package.json', '.repo-build/render-set.mjs',
    '.repo-build/set.json', '.repo-build/set.lock.json', 'scripts/check-set.mjs']) {
    copyFileSync(new URL('../' + file, import.meta.url), join(root, file));
  }
  return root;
}

function run(root, args = ['--root', root], script = checker) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', cwd: root, timeout: 10000 });
}

test('set checker accepts the clean checkout and a temp copy', t => {
  const root = fixture(t);
  for (const args of [[], ['--root', root]]) {
    const result = run(root, args);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'Set blocks and pinned hashes match.\n');
    assert.equal(result.stderr, '');
  }
});

for (const file of ['README.md', 'llms.txt', '.repo-build/render-set.mjs', '.repo-build/set.json']) {
  test(`set checker reports SET_DRIFT for edited ${file}`, t => {
    const root = fixture(t);
    const path = join(root, file);
    const before = readFileSync(path, 'utf8');
    const start = before.indexOf('<!-- set:start -->');
    const after = file === 'README.md' || file === 'llms.txt'
      ? before.slice(0, start) + before.slice(start).replace('AI custom instructions from approved entries:', 'Edited set description:')
      : before + '\n';
    assert.notEqual(after, before);
    writeFileSync(path, after);
    const result = run(root);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, `SET_DRIFT: ${file}: run npx repo-build-skill@0.1.1 set sync (maintainer-run, outside CI)\n`);
    assert.equal(readFileSync(path, 'utf8'), after);
  });
}

test('set checker names both changed pinned files before loading altered renderer code', t => {
  const root = fixture(t);
  writeFileSync(join(root, '.repo-build/render-set.mjs'), 'invalid JavaScript');
  writeFileSync(join(root, '.repo-build/set.json'), 'invalid JSON');
  const result = run(root, [], join(root, 'scripts/check-set.mjs'));
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /^SET_DRIFT: \.repo-build\/render-set\.mjs:/m);
  assert.match(result.stderr, /^SET_DRIFT: \.repo-build\/set\.json:/m);
});

test('set checker exits 2 for missing or unreadable required files', async t => {
  for (const file of ['README.md', 'llms.txt', 'package.json', '.repo-build/render-set.mjs',
    '.repo-build/set.json', '.repo-build/set.lock.json']) {
    await t.test(file, t => {
      const root = fixture(t);
      rmSync(join(root, file));
      const result = run(root);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /^SET_CHECK:/);
      mkdirSync(join(root, file));
      assert.equal(run(root).status, 2);
    });
  }
});

test('set checker exits 2 for invalid lock data and usage', t => {
  const root = fixture(t);
  for (const args of [['--root'], ['--unknown'], ['--root', root, 'extra'], ['--root', '--check']]) {
    const result = run(root, args);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /Usage: node scripts\/check-set.mjs/);
  }
  for (const data of ['{', '{}', '{"renderer_sha256": 42}', 'null']) {
    writeFileSync(join(root, '.repo-build/set.lock.json'), data);
    assert.equal(run(root).status, 2);
  }
});
