import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { byId } from '../src/catalog.js';
import { planFiles, readManifest, snippetFor, writeFiles } from '../src/install.js';
import { planSnippetApplication } from '../src/apply-snippets.js';

const cli = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const START = '<!-- model-orchestrator:start -->';
const END = '<!-- model-orchestrator:end -->';
const run = (args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 });
function setup(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'orch-apply-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const project = join(base, 'project');
  const dir = join(project, 'rules');
  mkdirSync(join(project, '.claude'), { recursive: true });
  const rules = join(project, 'CLAUDE.md');
  const settings = join(project, '.claude', 'settings.json');
  const args = ['--yes', '--level', '2', '--ais', 'claude-code', '--no-tools', '--no-install', '--project', project, '--dir', dir];
  return { base, project, dir, rules, settings, args, apply: (extra = []) => run([...args, '--apply-snippets', ...extra]) };
}
function snapshot(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isFile()) return readFileSync(path).toString('base64');
  return Object.fromEntries(readdirSync(path).sort().map((name) => [name, snapshot(join(path, name))]));
}
const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));
const backups = (path) => readdirSync(path).filter((name) => name.includes('.bak-'));

test('apply-snippets: create missing rules and settings with applied activation steps', (t) => {
  const s = setup(t);
  const r = s.apply();
  assert.equal(r.status, 0, r.stderr);
  assert.ok(read(s.rules).includes(START));
  assert.ok(json(s.settings).hooks.UserPromptSubmit.length);
  // Q8: a rules file that did not exist before this run is created, not
  // updated, and there is nothing to back up.
  assert.match(r.stdout, /create .*CLAUDE\.md \(new file, marked block/);
  assert.doesNotMatch(r.stdout.split("What's left for you:")[1], /copy the block|merge the hooks/);
  assert.match(read(join(s.dir, 'README.md')), /applied the generated rules/);
  const manifest = json(join(s.dir, 'MANIFEST.json'));
  assert.equal(manifest.activation['[project] CLAUDE.md'].kind, 'rules');
  assert.equal(manifest.activation['[project] .claude/settings.json'].kind, 'hooks');
});

test('apply-snippets: append preserves outside bytes and replacement preserves prefix and suffix', (t) => {
  const s = setup(t);
  const outside = Buffer.from([35, 32, 77, 121, 32, 114, 117, 108, 101, 115, 13, 10, 255]);
  writeFileSync(s.rules, outside);
  assert.equal(s.apply().status, 0);
  assert.deepEqual(readFileSync(s.rules).subarray(0, outside.length), outside);
  const prior = Buffer.concat([readFileSync(s.rules), Buffer.from('\r\nUser footer\r\n')]);
  writeFileSync(s.rules, prior);
  assert.equal(s.apply().status, 0);
  assert.deepEqual(readFileSync(s.rules), prior);
});

test('apply-snippets: rerun replaces the marked block exactly once', (t) => {
  const s = setup(t);
  assert.equal(s.apply().status, 0);
  writeFileSync(s.rules, `before\r\n${START}\nold generated content\n${END}\r\nafter`);
  assert.equal(s.apply().status, 0);
  const text = read(s.rules);
  assert.equal(text.split(START).length - 1, 1);
  assert.ok(text.startsWith('before\r\n' + START));
  assert.ok(text.endsWith(END + '\r\nafter'));
  assert.doesNotMatch(text, /old generated content/);
});

test('apply-snippets: settings merge keeps permissions, foreign keys and hooks and dedupes command plus args', (t) => {
  const s = setup(t);
  const own = { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/route-gate.mjs'], timeout: 19 };
  const foreign = { type: 'command', command: 'echo custom' };
  const existing = { permissions: { allow: ['Bash(ls:*)'] }, custom: { keep: true }, hooks: { UserPromptSubmit: [{ matcher: '', hooks: [own, foreign] }], CustomEvent: [{ hooks: [foreign] }] } };
  writeFileSync(s.settings, JSON.stringify(existing));
  assert.equal(s.apply().status, 0);
  assert.equal(s.apply().status, 0);
  const result = json(s.settings);
  assert.deepEqual(result.permissions.allow, ['Bash(ls:*)']);
  assert.deepEqual(result.custom, existing.custom);
  assert.deepEqual(result.hooks.CustomEvent, existing.hooks.CustomEvent);
  const commands = result.hooks.UserPromptSubmit.flatMap((group) => group.hooks);
  assert.equal(commands.filter((hook) => hook.command === own.command && JSON.stringify(hook.args) === JSON.stringify(own.args)).length, 1);
  assert.deepEqual(commands[0], own);
  assert.deepEqual(commands[1], foreign);
});

test('apply-snippets: a hook under a different matcher still gets the snippet matcher group', (t) => {
  const s = setup(t);
  const metrics = { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/route-metrics.mjs'] };
  writeFileSync(s.settings, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [metrics] }] } }));
  assert.equal(s.apply().status, 0);
  assert.equal(s.apply().status, 0);
  const groups = json(s.settings).hooks.PreToolUse;
  assert.deepEqual(groups[0], { matcher: 'Bash', hooks: [metrics] });
  const agentTask = groups.filter((group) => group.matcher === 'Agent|Task');
  assert.equal(agentTask.length, 1, 'the Agent|Task group is added once, even on a rerun');
  assert.equal(agentTask[0].hooks.filter((hook) => JSON.stringify(hook.args) === JSON.stringify(metrics.args)).length, 1);
});

test('apply-snippets: truncated settings exits 2 and writes nothing anywhere', (t) => {
  const s = setup(t);
  writeFileSync(s.rules, '# Existing rules\r\n');
  writeFileSync(s.settings, '{ "hooks": ');
  const before = snapshot(s.base);
  const r = s.apply();
  assert.equal(r.status, 2, r.stderr);
  assert.ok(r.stderr.includes(s.settings), r.stderr);
  assert.deepEqual(snapshot(s.base), before);
});

test('apply-snippets: backups contain original bytes only for pre-existing changed files', (t) => {
  const s = setup(t);
  assert.equal(s.apply().status, 0);
  assert.deepEqual(backups(s.project), []);
  assert.deepEqual(backups(join(s.project, '.claude')), []);
  writeFileSync(s.rules, 'existing rules');
  writeFileSync(s.settings, '{"permissions":{"allow":["Bash(ls:*)"]}}');
  const rulesBefore = readFileSync(s.rules);
  const settingsBefore = readFileSync(s.settings);
  const r = s.apply();
  assert.equal(r.status, 0, r.stderr);
  for (const [folder, name, before] of [[s.project, 'CLAUDE.md', rulesBefore], [join(s.project, '.claude'), 'settings.json', settingsBefore]]) {
    const saved = backups(folder);
    assert.equal(saved.length, 1);
    assert.match(saved[0], new RegExp('^' + name.replaceAll('.', '\\.') + '\\.bak-\\d{8}T\\d{6}Z$'));
    const path = join(folder, saved[0]);
    assert.deepEqual(readFileSync(path), before);
    assert.ok(r.stdout.includes('backup ' + path));
  }
  assert.deepEqual(json(s.settings).permissions.allow, ['Bash(ls:*)']);
});

test('apply-snippets: both dry aliases preview changes and backups without writing', (t) => {
  const s = setup(t);
  writeFileSync(s.rules, 'my rules');
  for (const alias of ['--dry', '--dry-run']) {
    const before = snapshot(s.base);
    const r = s.apply([alias]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /would write \[project\] CLAUDE\.md/);
    assert.match(r.stdout, /would back up .*CLAUDE\.md\.bak-/);
    assert.deepEqual(snapshot(s.base), before);
  }
});

test('apply-snippets: every catalog rules file receives its main agent marked block', (t) => {
  const s = setup(t);
  for (const [id, file] of [['codex', 'AGENTS.md'], ['agy', 'GEMINI.md'], ['qwen', 'QWEN.md']]) {
    const args = s.args.map((value) => value === 'claude-code' ? id : value);
    const r = run([...args, '--apply-snippets']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(read(join(s.project, file)), /<!-- model-orchestrator:start -->/);
    assert.equal(existsSync(s.settings), false);
  }
});

test('apply-snippets: every primary applies only plain project-relative rules and preserves its manual snippet', (t) => {
  for (const primary of Object.values(byId).filter((ai) => ai.rulesFile)) {
    const s = setup(t);
    for (const dir of [s.dir, join(s.base, 'outside-rules')]) {
      const opts = { ...s, dir, level: 2, selected: [primary], primary };
      const manual = planFiles(opts).find((file) => file.rel === snippetFor(primary)).content;
      const files = planFiles({ ...opts, applySnippets: true });
      assert.equal(files.find((file) => file.rel === snippetFor(primary)).content, manual, 'manual snippet remains the copy guide');
      const applied = planSnippetApplication({ ...opts, files }).find((file) => file.activation.kind === 'rules').content.toString('utf8');
      assert.match(applied, /^<!-- model-orchestrator:start -->\n## Model router/);
      assert.doesNotMatch(applied, /```|^# |copy the block|installer applied|Subagents were written|Three hooks were written/m);
      assert.ok(!applied.includes(s.project), primary.id + ': no absolute project path');
      assert.ok(!applied.includes(dir), primary.id + ': no absolute rules path');
    }
  }
});

for (const upgrade of [false, true]) {
  test(`apply-snippets: ${upgrade ? 'upgrade replaces' : 'uninstall removes'} an unchanged 1.0.9 block`, (t) => {
    const s = setup(t);
    const opts = { ...s, level: 2, selected: [byId['claude-code']], primary: byId['claude-code'] };
    const files = planFiles(opts);
    writeFiles(files, opts);
    const legacy = Buffer.from(`${START}\n# Model orchestrator activation\n\nThe installer applied these rules to the marked block in CLAUDE.md.\n\n${files.find((file) => file.rel === 'CLAUDE.snippet.md').content.trimEnd()}\n${END}`);
    writeFileSync(s.rules, Buffer.concat([Buffer.from('project rules\n\n'), legacy, Buffer.from('\n')]));
    const manifestPath = join(s.dir, 'MANIFEST.json');
    const manifest = readManifest(s.dir);
    manifest.generatorVersion = '1.0.9';
    manifest.activation = { '[project] CLAUDE.md': { kind: 'rules', blockHash: createHash('sha256').update(legacy).digest('hex'), created: false, addedPrefix: '\n', addedSuffix: '\n' } };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    if (upgrade) {
      assert.equal(s.apply().status, 0);
      assert.doesNotMatch(read(s.rules), /```|^# |installer applied/m);
      assert.equal(read(s.rules).split(START).length - 1, 1);
    }
    const result = run(['--uninstall', '--dir', s.dir, '--project', s.project]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(read(s.rules), 'project rules\n');
  });
}

test('apply-snippets: uninstall restores exact original settings bytes when remaining JSON deep-equals its backup', (t) => {
  const s = setup(t);
  const original = '{\r\n "custom": {"two":2, "one":1}, "permissions":{"allow":["Bash(ls:*)"]}\r\n}\r\n';
  writeFileSync(s.settings, original);
  assert.equal(s.apply().status, 0);
  const saved = join(s.project, '.claude', backups(join(s.project, '.claude'))[0]);
  renameSync(saved, saved.slice(0, -1)); // Older installs omitted the UTC suffix.
  assert.equal(s.apply().status, 0);
  const result = run(['--uninstall', '--dir', s.dir, '--project', s.project]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(read(s.settings), original, 'original whitespace, key order and line endings are restored');
});

test('apply-snippets: uninstall preserves added settings instead of restoring an older backup', (t) => {
  const s = setup(t);
  writeFileSync(s.settings, '{"custom":true}');
  assert.equal(s.apply().status, 0);
  const current = json(s.settings);
  current.newSetting = { keep: true };
  writeFileSync(s.settings, JSON.stringify(current));
  assert.equal(run(['--uninstall', '--dir', s.dir, '--project', s.project]).status, 0);
  assert.deepEqual(json(s.settings), { custom: true, newSetting: { keep: true } });
});

test('apply-snippets: flag absent keeps user files and manual activation unchanged', (t) => {
  const s = setup(t);
  writeFileSync(s.rules, 'my rules');
  writeFileSync(s.settings, '{ "hooks": ');
  const r = run(s.args);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(s.rules), 'my rules');
  assert.equal(read(s.settings), '{ "hooks": ');
  assert.match(r.stdout, /copy the block/);
  assert.match(r.stdout, /merge the hooks/);
  assert.deepEqual(backups(s.project), []);
});

test('apply-snippets: uninstall removes applied block and hooks while preserving user content and backups', (t) => {
  const s = setup(t);
  writeFileSync(s.rules, 'my rules');
  writeFileSync(s.settings, JSON.stringify({ permissions: { allow: ['Bash(ls:*)'] }, hooks: { CustomEvent: [{ hooks: [{ type: 'command', command: 'echo own' }] }] } }));
  assert.equal(s.apply().status, 0);
  const rulesBefore = readFileSync(s.rules);
  const r = run(['--uninstall', '--dir', s.dir, '--project', s.project]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(s.rules), 'my rules');
  assert.deepEqual(json(s.settings), { permissions: { allow: ['Bash(ls:*)'] }, hooks: { CustomEvent: [{ hooks: [{ type: 'command', command: 'echo own' }] }] } });
  assert.equal(backups(s.project).length, 2);
  assert.ok(backups(s.project).some((name) => readFileSync(join(s.project, name)).equals(rulesBefore)));
  assert.ok(r.stdout.includes('keep backup ' + join(s.project, backups(s.project)[0])));
});

test('apply-snippets: ambiguous markers and symlink targets refuse before install writes', (t) => {
  const s = setup(t);
  writeFileSync(s.rules, START + '\nunfinished');
  const before = snapshot(s.base);
  let r = s.apply();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /matching/);
  assert.deepEqual(snapshot(s.base), before);
  rmSync(s.rules);
  const target = join(s.base, 'foreign.md');
  writeFileSync(target, 'foreign rules');
  symlinkSync(target, s.rules);
  r = s.apply();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /symlink/);
  assert.equal(read(target), 'foreign rules');
  assert.equal(existsSync(s.dir), false);
});

test('apply-snippets: a target changed after planning refuses before any write', async (t) => {
  const { planFiles, writeFiles } = await import('../src/install.js');
  const { planSnippetApplication } = await import('../src/apply-snippets.js');
  const { byId } = await import('../src/catalog.js');
  const s = setup(t);
  const opts = { level: 2, selected: [byId['claude-code']], primary: byId['claude-code'], project: s.project, dir: s.dir };
  const files = planFiles(opts);
  files.push(...planSnippetApplication({ ...opts, files }));
  writeFileSync(s.rules, 'created while the confirmation prompt was open');
  const before = snapshot(s.base);
  assert.throws(() => writeFiles(files, { ...opts, backupExisting: true }), /changed since snippet planning/);
  assert.deepEqual(snapshot(s.base), before);
});

test('apply-snippets: ownership survives apply reruns and later --yes installs without activation', (t) => {
  const s = setup(t);
  writeFileSync(s.rules, 'existing rules');
  const own = { type: 'command', command: 'node', args: ['${CLAUDE_PROJECT_DIR}/.claude/hooks/route-gate.mjs'] };
  writeFileSync(s.settings, JSON.stringify({ hooks: { UserPromptSubmit: [{ matcher: '', hooks: [own] }] } }));
  assert.equal(s.apply().status, 0);
  assert.equal(s.apply().status, 0);
  assert.equal(run(s.args).status, 0);
  const manifest = json(join(s.dir, 'MANIFEST.json'));
  assert.ok(manifest.activation['[project] .claude/settings.json'].hooks.length);
  const r = run(['--uninstall', '--dir', s.dir, '--project', s.project]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(s.rules), 'existing rules');
  assert.deepEqual(json(s.settings), { hooks: { UserPromptSubmit: [{ matcher: '', hooks: [own] }] } });
});

test('apply-snippets: uninstall preserves edited owned block and hook but removes untouched entries', (t) => {
  const s = setup(t);
  assert.equal(s.apply().status, 0);
  const rules = read(s.rules).replace(START, START + '\nmy edit');
  writeFileSync(s.rules, rules);
  const settings = json(s.settings);
  settings.hooks.UserPromptSubmit[0].hooks[0].timeout = 88;
  writeFileSync(s.settings, JSON.stringify(settings));
  const r = run(['--uninstall', '--dir', s.dir, '--project', s.project]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(read(s.rules), rules);
  assert.deepEqual(Object.keys(json(s.settings).hooks), ['UserPromptSubmit']);
  assert.equal(json(s.settings).hooks.UserPromptSubmit[0].hooks[0].timeout, 88);
  assert.match(r.stdout, /keep edited activation/);
  assert.ok(existsSync(join(s.dir, 'MANIFEST.json')));
});

test('apply-snippets: uninstall dry run writes nothing before removing auto-created activation', (t) => {
  const s = setup(t);
  assert.equal(s.apply().status, 0);
  const before = snapshot(s.base);
  const dry = run(['--uninstall', '--dry', '--dir', s.dir, '--project', s.project]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /remove activation/);
  assert.deepEqual(snapshot(s.base), before);
  assert.equal(run(['--uninstall', '--dir', s.dir, '--project', s.project]).status, 0);
  assert.equal(existsSync(s.rules), false);
  assert.equal(existsSync(s.settings), false);
  assert.equal(backups(s.project).length, 1);
  assert.equal(backups(join(s.project, '.claude')).length, 1);
});

for (const kind of ['traversal', 'shape', 'symlink']) {
  test(`apply-snippets: uninstall refuses activation ${kind} before removing files`, (t) => {
    const s = setup(t);
    assert.equal(s.apply().status, 0);
    const manifestPath = join(s.dir, 'MANIFEST.json');
    const manifest = json(manifestPath);
    if (kind === 'traversal') manifest.activation['[project] ../foreign.md'] = manifest.activation['[project] CLAUDE.md'];
    else if (kind === 'shape') manifest.activation['[project] .claude/settings.json'].hooks = 'invalid';
    else {
      const target = join(s.base, 'outside.md');
      writeFileSync(target, read(s.rules));
      rmSync(s.rules);
      symlinkSync(target, s.rules);
    }
    writeFileSync(manifestPath, JSON.stringify(manifest));
    const before = snapshot(s.base);
    const r = run(['--uninstall', '--dir', s.dir, '--project', s.project]);
    assert.equal(r.status, 2, r.stderr);
    assert.deepEqual(snapshot(s.base), before);
  });
}

test('apply-snippets: malformed previous activation ownership refuses before rerun writes', (t) => {
  const s = setup(t);
  assert.equal(s.apply().status, 0);
  const path = join(s.dir, 'MANIFEST.json');
  const manifest = json(path);
  manifest.activation['[project] .claude/settings.json'].hooks = 'malformed';
  writeFileSync(path, JSON.stringify(manifest));
  const before = snapshot(s.base);
  const r = s.apply();
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /ownership/);
  assert.deepEqual(snapshot(s.base), before);
});

test('apply-snippets: reapplying an edited marked block backs up its exact bytes before replacing it', (t) => {
  const s = setup(t);
  assert.equal(s.apply().status, 0);
  const edited = read(s.rules).replace(START, START + '\nuser edited this block');
  writeFileSync(s.rules, edited);
  assert.equal(s.apply().status, 0);
  assert.doesNotMatch(read(s.rules), /user edited this block/);
  assert.ok(backups(s.project).some((name) => read(join(s.project, name)) === edited));
  assert.equal(run(['--uninstall', '--dir', s.dir, '--project', s.project]).status, 0);
  assert.equal(existsSync(s.rules), false);
  assert.ok(backups(s.project).some((name) => read(join(s.project, name)) === edited));
});

test('apply-snippets: backup name collisions preserve every original during apply and uninstall', (t) => {
  const s = setup(t);
  writeFileSync(s.rules, 'before first apply');
  const protectedNames = [];
  const now = Date.now();
  for (let i = -1; i <= 10; i++) {
    const name = s.rules + '.bak-' + new Date(now + i * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    writeFileSync(name, 'existing backup');
    protectedNames.push(name);
  }
  assert.equal(s.apply().status, 0);
  assert.equal(run(['--uninstall', '--dir', s.dir, '--project', s.project]).status, 0);
  for (const name of protectedNames) assert.equal(read(name), 'existing backup');
  assert.ok(backups(s.project).some((name) => read(join(s.project, name)) === 'before first apply'));
  assert.equal(read(s.rules), 'before first apply');
});
