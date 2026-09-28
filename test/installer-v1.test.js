import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { planFiles, writeFiles, readManifest } from '../src/install.js';
import { byId, TOOLS } from '../src/catalog.js';
import { uninstallFiles } from '../src/uninstall.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const legacy = ['TASK', 'BUN' + 'DLE.md'].join('_');
const fixture = JSON.parse(readFileSync(new URL('./fixtures/install-0.1.35.json', import.meta.url), 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
function oldInstall(dir, project, edited = false) {
  mkdirSync(dir, { recursive: true });
  mkdirSync(project, { recursive: true });
  for (const [name, content] of Object.entries(fixture.files)) {
    assert.equal(sha(content), fixture.hashes[name], `historical fixture hash: ${name}`);
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content + (edited && name === legacy ? '\nUser customization\n' : ''));
  }
  writeFileSync(join(dir, 'MANIFEST.json'), JSON.stringify({
    generator: 'model-orchestrator', generatorVersion: fixture.generatorVersion,
    generatedAt: '2026-09-26T00:00:00.000Z', level: 2, ais: ['codex'], primary: 'codex', tools: ['codecalc'], apis: [],
    dir, project, files: fixture.hashes, directories: []
  }));
}
const optsFor = (dir, project) => ({ level: 2, selected: [byId.codex], primary: byId.codex, tools: [], dir, project });

test('every level includes the task brief, context, decision log and executable check scaffold', () => {
  for (const level of [1, 2, 3]) {
    const files = planFiles({ ...optsFor('docs', 'project'), level });
    for (const name of ['TASK_BRIEF.md', 'CONTEXT.md', 'DECISIONS.md', 'ACCEPTANCE_CHECKS.json']) {
      assert.ok(files.some(file => file.rel === name), `${level}: ${name}`);
    }
    const checks = JSON.parse(files.find(file => file.rel === 'ACCEPTANCE_CHECKS.json').content);
    assert.ok(Array.isArray(checks.checks) && checks.checks.length);
    assert.deepEqual(checks.checks[0].command, ['node', '-e', 'process.exit(1)'], 'the untouched example check must fail until customized');
  }
});

test('default interactive and --yes installs select zero companions', () => {
  assert.ok(TOOLS.every(tool => tool.recommended !== true));
  for (const yes of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), 'orch-default-tools-'));
    try {
      const dir = join(root, 'docs'), project = join(root, 'project');
      const args = ['--level', '2', '--ais', 'claude-code,codex', '--primary', 'claude-code', '--plans', 'none', '--dir', dir, '--project', project];
      const result = spawnSync(process.execPath, [CLI, ...(yes ? ['--yes'] : []), ...args], { encoding: 'utf8', input: yes ? '' : '\n\n\ny\n' });
      assert.equal(result.status, 0, result.stderr + result.stdout);
      assert.deepEqual(readManifest(dir).tools, []);
      for (const file of ['CODECALC.md', 'OBSIDIAN-TC.md', 'CONTEXT7.md']) assert.equal(existsSync(join(dir, file)), false, `${yes}: ${file}`);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});

test('0.1.35 upgrade replaces an untouched brief, preserves companions, and retains uninstall hashes', () => {
  const root = mkdtempSync(join(tmpdir(), 'orch-upgrade-v1-'));
  try {
    const dir = join(root, 'docs'), project = join(root, 'project');
    oldInstall(dir, project);
    const result = spawnSync(process.execPath, [CLI, '--yes', '--level', '2', '--ais', 'codex', '--primary', 'codex', '--dir', dir, '--project', project, '--upgrade-runtime', '--update-docs'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr + result.stdout);
    assert.match(result.stdout, /documents renamed:/);
    assert.ok(result.stdout.includes(legacy));
    assert.equal(existsSync(join(dir, legacy)), false);
    assert.ok(existsSync(join(dir, 'TASK_BRIEF.md')));
    assert.equal(readFileSync(join(dir, 'CODECALC.md'), 'utf8'), fixture.files['CODECALC.md']);
    const manifest = readManifest(dir);
    assert.equal(manifest.generatorVersion, JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
    assert.equal(manifest.files[legacy], undefined);
    assert.equal(manifest.files['CODECALC.md'], fixture.hashes['CODECALC.md']);
    assert.ok(manifest.files['TASK_BRIEF.md']);
    assert.equal(readFileSync(join(dir, 'bin', 'cli-run.mjs'), 'utf8'), readFileSync(new URL('../bin/cli-run.mjs', import.meta.url), 'utf8'), 'the real historical runtime was upgraded to the current runner');
    const actions = uninstallFiles({ dir, project });
    assert.ok(actions.some(line => line.includes('CODECALC.md')));
    assert.equal(existsSync(join(dir, 'CODECALC.md')), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('0.1.35 edited brief survives upgrade, is named, and survives uninstall', () => {
  const root = mkdtempSync(join(tmpdir(), 'orch-upgrade-edited-'));
  try {
    const dir = join(root, 'docs'), project = join(root, 'project');
    oldInstall(dir, project, true);
    const before = readFileSync(join(dir, legacy), 'utf8');
    const opts = optsFor(dir, project);
    const result = writeFiles(planFiles(opts), { ...opts, prevManifest: readManifest(dir), upgradeRuntime: true, updateDocs: true });
    assert.ok(result.docsConflict.includes(legacy));
    assert.equal(readFileSync(join(dir, legacy), 'utf8'), before);
    assert.ok(existsSync(join(dir, 'TASK_BRIEF.md')));
    assert.equal(readManifest(dir).files[legacy], fixture.hashes[legacy]);
    uninstallFiles({ dir, project });
    assert.equal(readFileSync(join(dir, legacy), 'utf8'), before);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('runtime-only and dry upgrades preserve the old brief until a document update is requested', () => {
  const root = mkdtempSync(join(tmpdir(), 'orch-upgrade-modes-'));
  try {
    const dir = join(root, 'docs'), project = join(root, 'project');
    oldInstall(dir, project);
    const opts = optsFor(dir, project);
    writeFiles(planFiles(opts), { ...opts, prevManifest: readManifest(dir), upgradeRuntime: true });
    assert.ok(existsSync(join(dir, legacy)));
    const dry = writeFiles(planFiles(opts), { ...opts, prevManifest: readManifest(dir), updateDocs: true, dry: true });
    assert.ok(dry.docsRenamed.length);
    assert.ok(existsSync(join(dir, legacy)));
    writeFiles(planFiles(opts), { ...opts, prevManifest: readManifest(dir), updateDocs: true });
    assert.equal(existsSync(join(dir, legacy)), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('legacy brief ownership requires a matching root and safe regular file', () => {
  const root = mkdtempSync(join(tmpdir(), 'orch-upgrade-root-'));
  try {
    const dir = join(root, 'docs'), project = join(root, 'project');
    oldInstall(dir, project);
    const opts = optsFor(dir, project), previous = readManifest(dir);
    previous.dir = join(root, 'other');
    const result = writeFiles(planFiles(opts), { ...opts, prevManifest: previous, updateDocs: true });
    assert.ok(result.docsUnverifiable.includes(legacy));
    assert.ok(existsSync(join(dir, legacy)));
    if (process.platform !== 'win32') {
      rmSync(join(dir, legacy));
      const elsewhere = join(root, 'outside.md');
      writeFileSync(elsewhere, 'keep');
      symlinkSync(elsewhere, join(dir, legacy));
      assert.throws(() => writeFiles(planFiles(opts), { ...opts, prevManifest: readManifest(dir), updateDocs: true }), /symlink/);
      assert.equal(readFileSync(elsewhere, 'utf8'), 'keep');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a failed manifest write rolls back the legacy brief migration', () => {
  const root = mkdtempSync(join(tmpdir(), 'orch-upgrade-rollback-'));
  try {
    const dir = join(root, 'docs'), project = join(root, 'project');
    oldInstall(dir, project);
    const opts = optsFor(dir, project), files = planFiles(opts);
    files.find(file => file.rel === 'MANIFEST.json').content = '{invalid';
    assert.throws(() => writeFiles(files, { ...opts, prevManifest: readManifest(dir), updateDocs: true }), SyntaxError);
    assert.equal(readFileSync(join(dir, legacy), 'utf8'), fixture.files[legacy]);
    assert.equal(existsSync(join(dir, 'TASK_BRIEF.md')), false);
    assert.equal(readManifest(dir).generatorVersion, '0.1.35');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
