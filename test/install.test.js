import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { planFiles, writeFiles, resolveSelection, gatewayModels, envNames } from '../src/install.js';
import { byId } from '../src/catalog.js';
import { render } from '../src/render.js';

const sel = (...ids) => ids.map((i) => byId[i]);

test('render fills placeholders and throws on an unknown one', () => {
  assert.equal(render('a {{X}} b', { X: 1 }), 'a 1 b');
  assert.throws(() => render('{{NOPE}}', {}), /NOPE/);
});

test('planning is pure and level-additive', () => {
  const l1 = planFiles({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'] });
  const l2 = planFiles({ level: 2, selected: sel('claude-code', 'codex'), primary: byId['claude-code'] });
  const l3 = planFiles({ level: 3, selected: sel('claude-code', 'codex', 'ollama'), primary: byId['claude-code'] });
  const rels = (p) => new Set(p.map((f) => f.rel));
  for (const r of rels(l1)) assert.ok(rels(l2).has(r), 'level 2 dropped ' + r);
  for (const r of rels(l2)) assert.ok(rels(l3).has(r), 'level 3 dropped ' + r);
  assert.ok(rels(l1).has('README.md') && rels(l1).has('ORCHESTRATOR.md') && rels(l1).has('protocols/build-protocol.md'));
  assert.ok(!rels(l1).has('ROUTING.md') && rels(l2).has('ROUTING.md'));
  assert.ok(!rels(l2).has('vm/README.md') && rels(l3).has('vm/README.md'));
});

test('no rendered file still contains a placeholder, at any level, for any primary', () => {
  const all = Object.values(byId);
  for (const level of [1, 2, 3]) {
    const selected = all.filter((a) => a.minLevel <= level);
    for (const primary of selected.filter((a) => a.kind !== 'local')) {
      for (const f of planFiles({ level, selected, primary })) {
        assert.doesNotMatch(f.content, /\{\{\s*[A-Z0-9_]+\s*\}\}/, `${f.rel} (level ${level}, primary ${primary.id}) still has a placeholder`);
      }
    }
  }
});

test('the primary decides the loading surface, and repo READMEs are not installed', () => {
  const rels = (p) => planFiles(p).map((f) => f.rel);
  const cc = rels({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'] });
  assert.ok(cc.includes('.claude/agents/deep-planner.md') && cc.includes('CLAUDE.snippet.md'));
  assert.ok(!cc.includes('.claude/agents/README.md'), 'a README inside .claude/agents would be parsed as an agent');
  const agy = rels({ level: 1, selected: sel('agy'), primary: byId.agy });
  assert.ok(agy.includes('.agents/agents/deep-planner.md') && agy.includes('GEMINI.snippet.md'));
  const codex = rels({ level: 1, selected: sel('codex'), primary: byId.codex });
  assert.ok(codex.includes('AGENTS.snippet.md') && !codex.some((r) => r.startsWith('.claude/')));
  const chat = rels({ level: 1, selected: sel('chatgpt-app'), primary: byId['chatgpt-app'] });
  assert.ok(chat.includes('PASTE-INTO-YOUR-AGENT.md'));
  const l2 = rels({ level: 2, selected: sel('claude-code', 'grok'), primary: byId['claude-code'] });
  assert.equal(l2.filter((r) => r === 'README.md').length, 1, 'exactly one README at the install root');
});

test('generated gateway config references keys by name only', () => {
  const y = gatewayModels(sel('claude-code', 'qwen', 'grok', 'ollama'));
  assert.match(y, /os\.environ\/OPENROUTER_API_KEY/);
  assert.doesNotMatch(y, /sk-|Bearer [A-Za-z0-9]/);
  assert.deepEqual(envNames(sel('ollama')), ['GATEWAY_MASTER_KEY']);
});

test('lanes.json lists only selected cli-run lanes', () => {
  const p = planFiles({ level: 2, selected: sel('claude-code', 'codex', 'ollama'), primary: byId['claude-code'] });
  const lanes = JSON.parse(p.find((f) => f.rel === 'bin/lanes.json').content);
  assert.deepEqual(lanes.enabled, ['codex']);
});

test('writing to a temp dir produces the plan; a second run keeps existing files unless force; dry writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-test-'));
  try {
    const files = planFiles({ level: 2, selected: sel('claude-code', 'codex'), primary: byId['claude-code'] });
    const first = writeFiles(files, { dir });
    assert.equal(first.written.length, files.length);
    assert.equal(first.skipped.length, 0);
    for (const f of files) assert.ok(existsSync(join(dir, f.rel)), 'missing ' + f.rel);
    assert.ok(statSync(join(dir, 'bin', 'cli-run.js')).mode & 0o100, 'cli-run.js is executable');

    writeFileSync(join(dir, 'README.md'), 'mine');
    const second = writeFiles(files, { dir });
    assert.equal(second.written.length, 0);
    assert.equal(second.skipped.length, files.length);
    assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), 'mine', 'existing file was overwritten without --force');

    const forced = writeFiles(files, { dir, force: true });
    assert.equal(forced.written.length, files.length);
    assert.notEqual(readFileSync(join(dir, 'README.md'), 'utf8'), 'mine');

    const dryDir = mkdtempSync(join(tmpdir(), 'orch-dry-'));
    const dry = writeFiles(files, { dir: dryDir, dry: true });
    assert.equal(dry.written.length, files.length);
    assert.ok(!existsSync(join(dryDir, 'README.md')), '--dry wrote a file');
    rmSync(dryDir, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('resolveSelection reports unknown ids instead of guessing', () => {
  const { selected, unknown } = resolveSelection(['codex', 'nope']);
  assert.deepEqual(selected.map((a) => a.id), ['codex']);
  assert.deepEqual(unknown, ['nope']);
});

test('setup-vm.sh stays valid bash when nothing npm-installable is selected', () => {
  const p = planFiles({ level: 3, selected: sel('grok', 'agy'), primary: byId.agy });
  const sh = p.find((f) => f.rel === 'vm/setup-vm.sh').content;
  assert.match(sh, /for pkg in ""; do/);
  assert.match(sh, /\[ -z "\$pkg" \] && continue/);
  const r = spawnSync('bash', ['-n'], { input: sh, encoding: 'utf8' });
  assert.equal(r.status, 0, 'bash -n rejected the rendered script: ' + r.stderr);
  const full = planFiles({ level: 3, selected: sel('claude-code', 'codex', 'grok'), primary: byId['claude-code'] }).find((f) => f.rel === 'vm/setup-vm.sh').content;
  assert.equal(spawnSync('bash', ['-n'], { input: full, encoding: 'utf8' }).status, 0);
});

// ---- audit round 1 fixes ----
import { preflight, auditLane, resolveTools } from '../src/install.js';
import { symlinkSync, mkdirSync } from 'node:fs';

test('preflight refuses a path that escapes --dir and a symlinked component', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-pre-'));
  try {
    assert.match(preflight([{ rel: '../escape', content: 'x', mode: 0o644 }], dir).join(' '), /outside the target/);
    assert.throws(() => writeFiles([{ rel: '../escape', content: 'x', mode: 0o644 }], { dir, dry: true }), /outside the target/);
    const elsewhere = mkdtempSync(join(tmpdir(), 'orch-elsewhere-'));
    symlinkSync(elsewhere, join(dir, 'bin'));
    assert.match(preflight([{ rel: 'bin/cli-run.js', content: 'x', mode: 0o755 }], dir).join(' '), /is a symlink/);
    assert.throws(() => writeFiles([{ rel: 'bin/cli-run.js', content: 'x', mode: 0o755 }], { dir }), /symlink/);
    assert.ok(!existsSync(join(elsewhere, 'cli-run.js')), 'write followed the symlink');
    rmSync(elsewhere, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a conflicting parent is caught before any write, so nothing is left behind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-conf-'));
  try {
    writeFileSync(join(dir, 'block'), 'a file where a directory is needed');
    const files = [
      { rel: 'first.md', content: '1', mode: 0o644 },
      { rel: 'block/second.md', content: '2', mode: 0o644 }
    ];
    assert.throws(() => writeFiles(files, { dir }), /exists and is not a directory/);
    assert.ok(!existsSync(join(dir, 'first.md')), 'first file was written despite a later conflict');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the weekly audit is rendered for an enabled lane, the install dir, and refuses when no lane exists', () => {
  assert.equal(auditLane(sel('claude-code', 'codex', 'ollama')), 'codex');
  assert.equal(auditLane(sel('claude-code', 'hermes', 'codex')), 'hermes');
  assert.equal(auditLane(sel('claude-code', 'ollama')), null);
  const withLane = planFiles({ level: 3, selected: sel('codex'), primary: byId.codex, dir: '/opt/custom-orch' });
  const sh = withLane.find((f) => f.rel === 'vm/jobs/weekly-audit.sh').content;
  assert.match(sh, /AUDIT_LANE="codex"/);
  assert.match(sh, /INSTALL_DIR='\/opt\/custom-orch'/);
  assert.match(sh, /audit-brief-.*\.md/, 'the composed brief is what the lane reads');
  assert.match(sh, /live-state\.md/);
  assert.doesNotMatch(sh, /exit 13/, 'guard must be empty when a lane exists');
  const svc = withLane.find((f) => f.rel === 'vm/jobs/weekly-audit.service').content;
  assert.match(svc, /WorkingDirectory=\/opt\/custom-orch/);
  assert.match(svc, /ExecStart=\/bin\/bash "\/opt\/custom-orch\/vm\/jobs\/weekly-audit\.sh"/);
  const noLane = planFiles({ level: 3, selected: sel('claude-code', 'ollama'), primary: byId['claude-code'], dir: '/x' });
  const sh2 = noLane.find((f) => f.rel === 'vm/jobs/weekly-audit.sh').content;
  assert.match(sh2, /AUDIT_LANE="none"/);
  assert.match(sh2, /exit 13/);
  assert.equal(spawnSync('bash', ['-n'], { input: sh2, encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('bash', ['-n'], { input: sh, encoding: 'utf8' }).status, 0);
});

test('the weekly audit refuses a gateway key that would inject curl config', () => {
  const sh = planFiles({ level: 3, selected: sel('codex'), primary: byId.codex, dir: '/x' }).find((f) => f.rel === 'vm/jobs/weekly-audit.sh').content;
  const d = mkdtempSync(join(tmpdir(), 'orch-key-'));
  const script = join(d, 'a.sh');
  writeFileSync(script, sh.replace("INSTALL_DIR='/x'", `INSTALL_DIR='${d}'`));
  const r = spawnSync('bash', [script], { encoding: 'utf8', env: { HOME: d, GATEWAY_MASTER_KEY: 'marker"\nheader = "X-Injected: yes' } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /must match/);
  rmSync(d, { recursive: true, force: true });
});

test('codecalc: selected writes CODECALC.md and snippets; the numbers-and-logic protocol is always written', () => {
  const { tools, unknown } = resolveTools(['codecalc', 'nope']);
  assert.deepEqual(tools.map((t) => t.id), ['codecalc']);
  assert.deepEqual(unknown, ['nope']);
  const withTool = planFiles({ level: 1, selected: sel('codex'), primary: byId.codex, tools }).map((f) => f.rel);
  assert.ok(withTool.includes('CODECALC.md') && withTool.includes('mcp/codex.config.toml') && withTool.includes('protocols/numbers-and-logic.md'));
  const without = planFiles({ level: 1, selected: sel('codex'), primary: byId.codex, tools: [] });
  assert.ok(!without.some((f) => f.rel === 'CODECALC.md'));
  assert.ok(without.some((f) => f.rel === 'protocols/numbers-and-logic.md'));
  const nl = without.find((f) => f.rel === 'protocols/numbers-and-logic.md').content;
  assert.match(nl, /not selected/);
  assert.match(nl, /github\.com\/The-40-Thieves\/codecalc/);
});

// ---- audit round 2 fixes ----
import { shellQuote, systemdEscape, dirProblems, realRoot } from '../src/install.js';
import { realpathSync } from 'node:fs';

test('--dir is data in the rendered script and unit, never syntax', () => {
  const dir = '/tmp/safe"; echo DIR_INJECTED >&2; #';
  const files = planFiles({ level: 3, selected: sel('codex'), primary: byId.codex, dir, tools: [] });
  const sh = files.find((f) => f.rel === 'vm/jobs/weekly-audit.sh').content;
  const r = spawnSync('bash', ['-s'], { input: sh, encoding: 'utf8', env: { HOME: '/nonexistent' } });
  // An executed injection prints a line that is exactly the marker. The
  // script's own "missing" message legitimately echoes the directory name as
  // data, marker included, so the oracle is the whole line, not a substring.
  assert.ok(!r.stderr.split('\n').includes('DIR_INJECTED'), 'the directory name executed as a command:\n' + r.stderr);
  assert.match(r.stderr, /weekly-audit: .*DIR_INJECTED.* missing/, 'the directory should appear as data in the missing-dir message');
  assert.match(sh, /INSTALL_DIR='\/tmp\/safe"; echo DIR_INJECTED >&2; #'/);
  assert.equal(shellQuote("it's"), "'it'\\''s'");
  assert.equal(systemdEscape('/a/100%/b'), '/a/100%%/b');
  const svc = planFiles({ level: 3, selected: sel('codex'), primary: byId.codex, dir: '/opt/100% sure', tools: [] }).find((f) => f.rel === 'vm/jobs/weekly-audit.service').content;
  assert.match(svc, /WorkingDirectory=\/opt\/100%% sure/);
  assert.match(svc, /ExecStart=\/bin\/bash "\/opt\/100%% sure\/vm\/jobs\/weekly-audit\.sh"/);
});

test('a target with control characters or the filesystem root is refused before planning', () => {
  assert.match(dirProblems('/tmp/bad\nname').join(' '), /control characters/);
  assert.match(dirProblems('/').join(' '), /filesystem root/);
  assert.deepEqual(dirProblems('/tmp/fine dir'), []);
  assert.throws(() => writeFiles([{ rel: 'README.md', content: 'x', mode: 0o644 }], { dir: '/', dry: true }), /filesystem root/);
});

test('a symlinked or file --dir root is handled: followed to its real path, or refused when not a directory', () => {
  const base = mkdtempSync(join(tmpdir(), 'orch-root-'));
  try {
    const outside = mkdtempSync(join(tmpdir(), 'orch-outside-'));
    const target = join(base, 'target');
    symlinkSync(outside, target);
    // The user chose a link; writes land in its real location and containment is checked there.
    assert.equal(realRoot(target).root, realpathSync(outside));
    writeFiles([{ rel: 'a.md', content: 'x', mode: 0o644 }], { dir: target });
    assert.ok(existsSync(join(outside, 'a.md')));
    assert.throws(() => writeFiles([{ rel: '../escape.md', content: 'x', mode: 0o644 }], { dir: target, dry: true }), /outside the target/);
    // A regular file as the root is refused.
    const file = join(base, 'file');
    writeFileSync(file, 'not a dir');
    assert.throws(() => writeFiles([{ rel: 'a.md', content: 'x', mode: 0o644 }], { dir: file }), /not a directory/);
    // A root that does not exist yet resolves through its deepest existing ancestor.
    const fresh = join(base, 'deep', 'er', 'path');
    assert.equal(realRoot(fresh).exists, false);
    assert.ok(realRoot(fresh).root.endsWith(join('deep', 'er', 'path')));
    rmSync(outside, { recursive: true, force: true });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('--force never leaves an overwritten file changed when a later target is a directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-force-'));
  try {
    writeFileSync(join(dir, 'first.md'), 'original');
    mkdirSync(join(dir, 'second.md'));
    const files = [
      { rel: 'first.md', content: 'overwritten', mode: 0o644 },
      { rel: 'second.md', content: 'x', mode: 0o644 }
    ];
    assert.match(preflight(files, dir).join(' '), /not a regular file/);
    assert.throws(() => writeFiles(files, { dir, force: true }), /not a regular file/);
    assert.equal(readFileSync(join(dir, 'first.md'), 'utf8'), 'original');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
