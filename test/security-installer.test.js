import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { byId } from '../src/catalog.js';
import { dirProblems, planFiles, readManifest, writeFiles } from '../src/install.js';
import { planSnippetApplication } from '../src/apply-snippets.js';
import { uninstallFiles } from '../src/uninstall.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = join(root, '.test-work', 'tmp-dry-run');
mkdirSync(scratch, { recursive: true });
function setup(t) {
  const base = mkdtempSync(join(scratch, 'security-installer-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const project = join(base, 'project');
  const dir = join(project, 'ai-orchestrator');
  mkdirSync(project);
  return { base, project, dir, level: 2, primary: byId['claude-code'], selected: [byId['claude-code'], byId.codex] };
}
function appliedFiles(s) {
  const files = planFiles({ ...s, applySnippets: true });
  files.push(...planSnippetApplication({ ...s, files }));
  return files;
}
function tree(path, manifest = false) {
  const out = {};
  for (const name of readdirSync(path).sort()) {
    const target = join(path, name);
    if (lstatSync(target).isDirectory()) out[name] = tree(target, manifest);
    else if (!manifest || name !== 'MANIFEST.json') out[name] = { bytes: readFileSync(target).toString('base64'), mtime: lstatSync(target).mtimeMs };
  }
  return out;
}

test('security: activation refuses an unverified pre-existing hook before registering it', (t) => {
  const s = setup(t);
  const hook = join(s.project, '.claude', 'hooks', 'route-gate.mjs');
  mkdirSync(join(s.project, '.claude', 'hooks'), { recursive: true });
  writeFileSync(hook, 'process.exit(73);\n');
  const before = tree(s.project);
  assert.throws(() => writeFiles(appliedFiles(s), { ...s, backupExisting: true }), /refusing.*hook|hook.*unverified/is);
  assert.deepEqual(tree(s.project), before, 'refusal leaves all project files unchanged');
  assert.equal(existsSync(s.dir), false);
});

test('security: activation replaces an unverified hook only with explicit runtime upgrade', (t) => {
  const s = setup(t);
  const hook = join(s.project, '.claude', 'hooks', 'route-gate.mjs');
  mkdirSync(join(s.project, '.claude', 'hooks'), { recursive: true });
  writeFileSync(hook, 'process.exit(73);\n');
  const files = appliedFiles(s);
  const generated = files.find((file) => file.rel === join('.claude', 'hooks', 'route-gate.mjs')).content;
  const result = writeFiles(files, { ...s, upgradeRuntime: true, backupExisting: true });
  assert.equal(readFileSync(hook, 'utf8'), generated);
  assert.ok(result.upgraded.includes('[project] .claude/hooks/route-gate.mjs'));
  assert.ok(JSON.parse(readFileSync(join(s.project, '.claude', 'settings.json'))).hooks.UserPromptSubmit.length);
});

test('security: owned hook runtime upgrades are applied but edited hooks refuse activation', (t) => {
  const s = setup(t);
  writeFiles(appliedFiles(s), { ...s, backupExisting: true });
  const previous = readManifest(s.dir);
  const changed = appliedFiles(s);
  const hook = changed.find((file) => file.rel === join('.claude', 'hooks', 'route-gate.mjs'));
  hook.content += '\n// Updated generated hook.\n';
  const upgraded = writeFiles(changed, { ...s, prevManifest: previous, backupExisting: true });
  assert.ok(upgraded.upgraded.includes('[project] .claude/hooks/route-gate.mjs'));
  const path = join(s.project, hook.rel);
  assert.equal(readFileSync(path, 'utf8'), hook.content);
  writeFileSync(path, 'process.exit(74);\n');
  const before = tree(s.project);
  assert.throws(() => writeFiles(appliedFiles(s), { ...s, prevManifest: readManifest(s.dir), backupExisting: true }), /edited or unverified hook/);
  assert.deepEqual(tree(s.project), before);
});

test('security: a double quote in the target path is refused before systemd installation', (t) => {
  const s = setup(t);
  const dir = join(s.project, 'rules " extra');
  assert.match(dirProblems(dir).join(' '), /double quote/);
  assert.throws(() => writeFiles(planFiles({ ...s, level: 3, dir }), { ...s, dir }), /double quote/);
  assert.equal(existsSync(dir), false);
});

for (const identical of [false, true]) {
  test(`security: installer ${identical ? 'keeps an identical hard link without writes, then safely replaces it' : 'detaches a changed hard-linked machine file'}`, (t) => {
    const s = setup(t);
    const original = 'outside bytes\n';
    const outside = join(s.base, 'outside.json');
    const target = join(s.dir, 'bin', 'lanes.json');
    mkdirSync(join(s.dir, 'bin'), { recursive: true });
    writeFileSync(outside, original);
    linkSync(outside, target);
    const content = identical ? original : 'generated lanes\n';
    const result = writeFiles([{ rel: 'bin/lanes.json', content, mode: 0o644 }], { ...s, backupExisting: true });
    assert.equal(readFileSync(outside, 'utf8'), original, 'the file outside the target root must retain its bytes');
    assert.equal(readFileSync(target, 'utf8'), content);
    if (identical) {
      assert.deepEqual(result.written, []);
      assert.deepEqual(result.backups, []);
      writeFiles([{ rel: 'bin/lanes.json', content: 'new lanes\n', mode: 0o644 }], s);
      assert.equal(readFileSync(outside, 'utf8'), original);
      assert.equal(readFileSync(target, 'utf8'), 'new lanes\n');
    }
    assert.notEqual(lstatSync(target).ino, lstatSync(outside).ino, 'the generated path must no longer share the outside inode');
    assert.equal(lstatSync(target).nlink, 1);
  });
}

test('rerun: identical activation makes no backups, preserves mtimes and permits clean uninstall', (t) => {
  const s = setup(t);
  writeFiles(appliedFiles(s), { ...s, backupExisting: true });
  const stamp = new Date('2001-01-01T00:00:00Z');
  const touch = (path) => { for (const name of readdirSync(path)) { const target = join(path, name); if (lstatSync(target).isDirectory()) touch(target); else utimesSync(target, stamp, stamp); } };
  touch(s.project);
  const before = tree(s.project, true);
  const result = writeFiles(appliedFiles(s), { ...s, prevManifest: readManifest(s.dir), backupExisting: true });
  assert.deepEqual(result.backups, [], 'an identical rerun must create no backup');
  assert.deepEqual(tree(s.project, true), before, 'only the manifest timestamp may change');
  uninstallFiles(s);
  assert.equal(existsSync(s.dir), false, 'a clean install must leave no rules folder');
});

test('rerun: changed machine-owned files never receive backups', (t) => {
  const s = setup(t);
  const first = planFiles(s);
  writeFiles(first, s);
  const next = planFiles({ ...s, selected: [byId['claude-code']] });
  const result = writeFiles(next, { ...s, prevManifest: readManifest(s.dir), backupExisting: true });
  assert.equal(result.backups.some((path) => /(?:MANIFEST\.json|lanes\.json)\.bak-/.test(path)), false);
  assert.deepEqual(readdirSync(join(s.dir, 'bin')).filter((name) => name.includes('.bak-')), []);
});

test('rerun: clean uninstall removes the rules folder after an identical apply', (t) => {
  const s = setup(t);
  writeFiles(appliedFiles(s), { ...s, backupExisting: true });
  writeFiles(appliedFiles(s), { ...s, prevManifest: readManifest(s.dir), backupExisting: true });
  uninstallFiles(s);
  assert.equal(existsSync(s.dir), false, 'the rules folder must be removed after a clean rerun');
});

test('preflight: home-level refusal reports the refused root once', (t) => {
  const s = setup(t);
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', 'import { preflight } from "./src/install.js"; import { homedir } from "node:os"; console.log(JSON.stringify(preflight([{ rel: ".claude/hooks/a.mjs" }, { rel: ".claude/hooks/b.mjs" }, { rel: "CLAUDE.md" }], homedir())));'], { cwd: root, encoding: 'utf8', env: { ...process.env, HOME: s.project, USERPROFILE: s.project } });
  assert.equal(result.status, 0, result.stderr);
  const problems = JSON.parse(result.stdout);
  assert.equal(problems.length, 1);
  assert.ok(problems[0].includes(s.project));
  assert.match(problems[0], /global agent configuration/);
});
