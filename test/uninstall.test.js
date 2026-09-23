import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const cli = join(root, 'bin', 'cli.js');
// Keep transient installs under the existing prose-check scratch exclusion so
// the parallel repository scan cannot race fixture cleanup.
const scratch = join(root, '.test-work', 'tmp-dry-run');
mkdirSync(scratch, { recursive: true });
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 });
const sha = (s) => createHash('sha256').update(s).digest('hex');

function setup(t, { preexisting = false } = {}) {
  const base = mkdtempSync(join(scratch, 'uninstall-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const project = join(base, 'project');
  const dir = join(project, 'ai-orchestrator');
  mkdirSync(project);
  if (preexisting) {
    mkdirSync(join(project, '.claude', 'agents'), { recursive: true });
    mkdirSync(join(project, '.claude', 'hooks'));
    mkdirSync(dir);
  }
  const install = (extra = []) => run(['--yes', '--level', '2', '--ais', 'claude-code,codex,grok', '--no-tools', '--no-install', '--dir', dir, '--project', project, ...extra]);
  const first = install();
  assert.equal(first.status, 0, first.stderr);
  const manifestPath = join(dir, 'MANIFEST.json');
  const manifest = () => JSON.parse(readFileSync(manifestPath, 'utf8'));
  const changeManifest = (fn) => {
    const m = manifest();
    fn(m);
    writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n');
  };
  const uninstall = (extra = []) => run(['--uninstall', '--dir', dir, '--project', project, ...extra]);
  return { base, dir, project, install, manifestPath, manifest, changeManifest, uninstall };
}

function snapshot(dir) {
  const out = {};
  function visit(p, rel) {
    const st = lstatSync(p);
    if (st.isSymbolicLink()) out[rel] = 'symlink';
    else if (st.isDirectory()) {
      out[rel] = 'directory';
      for (const name of readdirSync(p).sort()) visit(join(p, name), rel + '/' + name);
    } else out[rel] = sha(readFileSync(p));
  }
  visit(dir, '.');
  return out;
}

test('uninstall: removes unedited managed files, the manifest last, and created empty directories', (t) => {
  const s = setup(t);
  const paths = Object.keys(s.manifest().files).map((key) => key.startsWith('[project] ')
    ? join(s.project, key.slice('[project] '.length)) : join(s.dir, key));
  const r = s.uninstall();
  assert.equal(r.status, 0, r.stderr);
  for (const p of paths) assert.equal(existsSync(p), false, p);
  assert.equal(existsSync(s.manifestPath), false);
  assert.equal(existsSync(s.dir), false, 'the installer-created docs directory is empty');
  assert.equal(existsSync(join(s.project, '.claude')), false, 'created project directories are empty');
  const removed = r.stdout.split('\n').filter((line) => line.startsWith('  remove file '));
  assert.equal(removed.at(-1), '  remove file ' + s.manifestPath, 'manifest is the last file removed');
  assert.match(r.stdout, /CLAUDE\.md/);
  assert.match(r.stdout, /settings\.json/);
});

test('uninstall: keeps and names an edited managed file and retains its manifest for a retry', (t) => {
  const s = setup(t);
  const path = join(s.dir, 'ROUTING.md');
  const original = readFileSync(path);
  writeFileSync(path, 'my routing changes\n');
  const r = s.uninstall();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(path, 'utf8'), 'my routing changes\n');
  assert.ok(r.stdout.includes('keep edited ' + path), r.stdout);
  assert.equal(existsSync(s.manifestPath), true);
  assert.equal(existsSync(join(s.dir, 'TIERS.md')), false);
  writeFileSync(path, original);
  const retry = s.uninstall();
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(existsSync(s.manifestPath), false);
});

test('uninstall: foreign files in shared agents, hooks and docs directories stay', (t) => {
  const s = setup(t);
  const foreign = [join(s.project, '.claude', 'agents', 'custom.md'), join(s.project, '.claude', 'hooks', 'custom.js'), join(s.dir, 'personal.txt')];
  for (const p of foreign) writeFileSync(p, 'user-owned\n');
  const r = s.uninstall();
  assert.equal(r.status, 0, r.stderr);
  for (const p of foreign) assert.equal(readFileSync(p, 'utf8'), 'user-owned\n');
  assert.equal(existsSync(s.manifestPath), false);
});

test('uninstall: preexisting empty directories stay and are absent from directory ownership', (t) => {
  const s = setup(t, { preexisting: true });
  assert.ok(Array.isArray(s.manifest().directories));
  for (const key of ['.', '[project] .claude', '[project] .claude/agents', '[project] .claude/hooks']) {
    assert.ok(!s.manifest().directories.includes(key), key);
  }
  const r = s.uninstall();
  assert.equal(r.status, 0, r.stderr);
  for (const p of [s.dir, join(s.project, '.claude', 'agents'), join(s.project, '.claude', 'hooks')]) {
    assert.equal(existsSync(p), true, p);
    assert.deepEqual(readdirSync(p), []);
  }
});

test('uninstall: directory ownership survives a repeated install', (t) => {
  const s = setup(t);
  assert.equal(s.install().status, 0);
  const r = s.uninstall();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(existsSync(s.dir), false);
  assert.equal(existsSync(join(s.project, '.claude')), false);
});

test('uninstall: moving an install to another project preserves that project\'s existing files and directories', (t) => {
  const s = setup(t);
  const project = join(s.base, 'other-project');
  const agents = join(project, '.claude', 'agents');
  const hooks = join(project, '.claude', 'hooks');
  mkdirSync(agents, { recursive: true });
  mkdirSync(hooks);
  const custom = join(agents, 'deep-planner.md');
  const content = readFileSync(join(s.project, '.claude', 'agents', 'deep-planner.md'));
  writeFileSync(custom, content);
  const install = run(['--yes', '--level', '2', '--ais', 'claude-code,codex,grok', '--no-tools', '--no-install', '--dir', s.dir, '--project', project]);
  assert.equal(install.status, 0, install.stderr);
  assert.equal(Object.hasOwn(s.manifest().files, '[project] .claude/agents/deep-planner.md'), false, 'a kept file in another project has no previous ownership hash');
  for (const key of ['[project] .claude', '[project] .claude/agents', '[project] .claude/hooks']) {
    assert.equal(s.manifest().directories.includes(key), false, key + ' preexisted in the new project');
  }
  const r = run(['--uninstall', '--dir', s.dir, '--project', project]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readFileSync(custom), content);
  assert.ok(existsSync(hooks));
});

test('uninstall: legacy manifests remove managed files and leave unrecorded directories', (t) => {
  const s = setup(t);
  s.changeManifest((m) => { delete m.directories; });
  const r = s.uninstall();
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readdirSync(s.dir), ['bin', 'protocols']);
  assert.deepEqual(readdirSync(join(s.project, '.claude', 'agents')), []);
});

for (const [name, mutate] of [
  ['traversal entry', (m) => { m.files['../../outside.txt'] = sha('outside\n'); }],
  ['project traversal entry', (m) => { m.files['[project] ../outside.txt'] = sha('outside\n'); }],
  ['absolute entry', (m, s) => { m.files[join(s.base, 'outside.txt')] = sha('outside\n'); }],
  ['Windows absolute entry', (m) => { m.files['C:\\outside.txt'] = sha('outside\n'); }],
  ['backslash traversal entry', (m) => { m.files['..\\..\\outside.txt'] = sha('outside\n'); }],
  ['object path entry', (m) => { m.files['untrusted'] = { path: '../../outside.txt' }; }],
  ['array path entry', (m) => { m.files = [{ path: '../../outside.txt' }]; }],
  ['directory traversal entry', (m) => { m.directories = ['../../outside']; }],
  ['manifest self entry', (m) => { m.files['MANIFEST.json'] = sha('manifest'); }],
  ['invalid hash', (m) => { m.files['ROUTING.md'] = 'invalid'; }],
]) {
  test('uninstall: refuses ' + name + ' before removing anything', (t) => {
    const s = setup(t);
    writeFileSync(join(s.base, 'outside.txt'), 'outside\n');
    s.changeManifest((m) => mutate(m, s));
    const before = snapshot(s.base);
    const r = s.uninstall();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /refusing to uninstall/i, r.stderr);
    assert.deepEqual(snapshot(s.base), before, 'refusal is atomic');
  });
}

for (const shape of ['file', 'parent', 'manifest']) {
  test('uninstall: refuses a symlinked ' + shape + ' before removing anything', (t) => {
    const s = setup(t);
    const target = shape === 'file' ? join(s.dir, 'ROUTING.md') : shape === 'parent' ? join(s.project, '.claude', 'agents') : s.manifestPath;
    const outside = join(s.base, 'outside-' + shape);
    if (shape === 'parent') mkdirSync(outside);
    else writeFileSync(outside, readFileSync(target));
    rmSync(target, { recursive: true });
    symlinkSync(outside, target, shape === 'parent' ? 'junction' : 'file');
    const before = snapshot(s.base);
    const r = s.uninstall();
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /refusing to uninstall.*symlink/is, r.stderr);
    assert.deepEqual(snapshot(s.base), before);
  });
}

test('uninstall: dry run previews exactly the later removals and changes no bytes or directories', (t) => {
  const s = setup(t);
  writeFileSync(join(s.dir, 'ROUTING.md'), 'edited\n');
  writeFileSync(join(s.project, '.claude', 'agents', 'foreign.md'), 'foreign\n');
  const before = snapshot(s.base);
  const dry = s.uninstall(['--dry']);
  assert.equal(dry.status, 0, dry.stderr);
  assert.deepEqual(snapshot(s.base), before);
  const alias = s.uninstall(['--dry-run']);
  assert.equal(alias.status, 0, alias.stderr);
  assert.equal(alias.stdout, dry.stdout);
  const actual = s.uninstall();
  assert.equal(actual.status, 0, actual.stderr);
  const actions = (text) => text.split('\n').filter((line) => /^  (remove|keep|missing) /.test(line));
  assert.deepEqual(actions(actual.stdout), actions(dry.stdout));
});

test('uninstall: missing manifest exits 2 and names the expected path', (t) => {
  const s = setup(t);
  rmSync(s.manifestPath);
  const before = snapshot(s.base);
  const r = s.uninstall();
  assert.equal(r.status, 2);
  assert.ok(r.stderr.includes(s.manifestPath), r.stderr);
  assert.match(r.stderr, /manifest.*missing|missing.*manifest/i);
  assert.deepEqual(snapshot(s.base), before);
});

test('uninstall: help lists the flag and standalone usage', () => {
  const r = run(['--help']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /--uninstall\s+.*managed/i);
  assert.match(r.stdout, /--uninstall --dir <dir> --project <project>/);
});

test('uninstall: refuses a mismatched project root before removing anything', (t) => {
  const s = setup(t);
  const other = join(s.base, 'other-project');
  mkdirSync(other);
  const before = snapshot(s.base);
  const r = run(['--uninstall', '--dir', s.dir, '--project', other]);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /refusing to uninstall.*project/is);
  assert.deepEqual(snapshot(s.base), before);
});

test('uninstall: a conflicting install flag is refused before removing anything', (t) => {
  const s = setup(t);
  const before = snapshot(s.base);
  const r = s.uninstall(['--force']);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--force.*--uninstall|--uninstall.*--force/);
  assert.deepEqual(snapshot(s.base), before);
});
