import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

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
  assert.match(r.stdout, /applied .*CLAUDE\.snippet\.md/);
  assert.doesNotMatch(r.stdout, /copy the block|merge the hooks/);
  assert.match(read(join(s.dir, 'README.md')), /applied the generated rules/);
  assert.doesNotMatch(read(join(s.dir, 'MANIFEST.json')), /\[project\] CLAUDE\.md|\[project\] \.claude\/settings\.json/);
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
    assert.match(saved[0], new RegExp('^' + name.replaceAll('.', '\\.') + '\\.bak-\\d{8}T\\d{6}$'));
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

test('apply-snippets: non-Claude primary exits 2 and names its manual snippet', (t) => {
  const s = setup(t);
  for (const [id, snippet] of [['codex', 'AGENTS.snippet.md'], ['claude-app', 'PASTE-INTO-YOUR-AGENT.md']]) {
    const args = s.args.map((value) => value === 'claude-code' ? id : value);
    const before = snapshot(s.base);
    const r = run([...args, '--apply-snippets']);
    assert.equal(r.status, 2, r.stderr);
    assert.ok(r.stderr.includes(snippet), r.stderr);
    assert.match(r.stderr, /by hand/);
    assert.deepEqual(snapshot(s.base), before);
  }
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

test('apply-snippets: uninstall preserves applied files and names markers and backups', (t) => {
  const s = setup(t);
  writeFileSync(s.rules, 'my rules');
  assert.equal(s.apply().status, 0);
  const rulesBefore = readFileSync(s.rules);
  const settingsBefore = readFileSync(s.settings);
  const r = run(['--uninstall', '--dir', s.dir, '--project', s.project]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readFileSync(s.rules), rulesBefore);
  assert.deepEqual(readFileSync(s.settings), settingsBefore);
  assert.ok(r.stdout.includes(START));
  assert.ok(r.stdout.includes(END));
  assert.match(r.stdout, /CLAUDE\.md\.bak-YYYYMMDDTHHMMSS/);
  assert.equal(backups(s.project).length, 1);
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
