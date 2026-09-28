import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
function setup(t) {
  const home = mkdtempSync(join(tmpdir(), 'mo-global-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  // Q1: claude-code now carries a reliable sign-in status command too. An
  // unstubbed PATH would let signInStatus resolve and run the real `claude`
  // binary, which writes its own config under $HOME as a side effect
  // unrelated to model-orchestrator; these tests check only OUR writes, so
  // PATH is emptied to keep every vendor CLI unresolved.
  const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000, env: { ...process.env, HOME: home, USERPROFILE: home, PATH: '' } });
  return { home, run };
}

for (const id of ['claude-code', 'codex', 'agy', 'qwen']) {
  test(`global config: ${id} activation refuses the home project before writing`, (t) => {
    const { home, run } = setup(t);
    const args = ['--yes', '--level', '2', '--ais', id, '--apply-snippets', '--project', home, '--dir', join(home, 'router')];
    for (const extra of [[], ['--dry']]) {
      const result = run([...args, ...extra]);
      assert.equal(result.status, 2, result.stderr);
      assert.match(result.stderr, /global agent configuration/);
      assert.deepEqual(readdirSync(home), []);
    }
  });
}

test('global config: --yes without activation also refuses global agent definitions', (t) => {
  const { home, run } = setup(t);
  const result = run(['--yes', '--level', '1', '--ais', 'claude-code', '--project', home, '--dir', join(home, 'router')]);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /global agent configuration/);
  assert.deepEqual(readdirSync(home), []);
});

test('global config: explicit install folders within global host config are refused', (t) => {
  const { home, run } = setup(t);
  for (const host of ['.claude', '.codex', '.grok', '.qwen', '.gemini', '.agents', '.antigravity', '.hermes']) {
    const result = run(['--yes', '--level', '1', '--ais', 'claude-app', '--project', join(home, 'project'), '--dir', join(home, host, 'router')]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /global agent configuration/);
    assert.deepEqual(readdirSync(home), []);
  }
});

test('global config: projects below home still receive local activation', (t) => {
  const { home, run } = setup(t);
  const project = join(home, 'project');
  const result = run(['--yes', '--level', '1', '--ais', 'claude-code', '--apply-snippets', '--project', project, '--dir', join(project, 'router')]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(join(project, 'CLAUDE.md')));
  assert.ok(existsSync(join(project, '.claude', 'settings.json')));
  assert.equal(existsSync(join(home, '.claude')), false);
});

test('global config: a global folder symlink stays protected at its canonical target', (t) => {
  const { home, run } = setup(t);
  const outside = mkdtempSync(join(tmpdir(), 'mo-global-target-'));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(outside, join(home, '.claude'), 'junction');
  const result = run(['--yes', '--level', '1', '--ais', 'claude-app', '--project', join(home, 'project'), '--dir', join(outside, 'router')]);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /global agent configuration/);
  assert.deepEqual(readdirSync(outside), []);
  assert.deepEqual(readdirSync(home), ['.claude']);
});

test('global config: uninstall refuses an older manifest targeting global config', (t) => {
  const { home, run } = setup(t);
  const dir = join(home, 'router');
  mkdirSync(dir);
  mkdirSync(join(home, '.claude'));
  const file = join(home, '.claude', 'owned.md');
  writeFileSync(file, 'previously installed\n');
  const manifest = { generator: 'model-orchestrator', dir, project: home, files: { '[project] .claude/owned.md': createHash('sha256').update(readFileSync(file)).digest('hex') } };
  writeFileSync(join(dir, 'MANIFEST.json'), JSON.stringify(manifest));
  for (const extra of [[], ['--dry']]) {
    const result = run(['--uninstall', '--dir', dir, '--project', home, ...extra]);
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /global agent configuration/);
    assert.equal(readFileSync(file, 'utf8'), 'previously installed\n');
    assert.equal(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'), JSON.stringify(manifest));
  }
});
