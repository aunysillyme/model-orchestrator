import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join, delimiter, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { planFiles, writeFiles, resolveSelection, resolveApis, gatewayModels, envNames, laneVars, activationSteps, proofSteps, snippetFor } from '../src/install.js';
import { byId } from '../src/catalog.js';
import { render } from '../src/render.js';
import { buildArgv } from '../bin/cli-run.mjs';

const sel = (...ids) => ids.map((i) => byId[i]);

// A bare POSIX absolute path used as --dir/--project (e.g. '/tmp/mo-dir')
// means two different things depending on what the rendered text describes:
//   - a REMOTE Linux box's path, baked into a vm/ level-3 template (bash,
//     systemd) that can only ever run on Linux. src/install.js's dirPosix
//     keeps that value POSIX on every host, so tests below assert it as a
//     literal forward-slash string, unconditionally.
//   - a LOCAL path (where THIS run wrote files on THIS host), which is
//     correctly rendered with this host's own separators. A test asserting
//     one of those needs the SAME platform-native value the product
//     computes, not a hardcoded POSIX literal, so it builds its expectation
//     with node:path's own resolve()/join() rather than typing the path out.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reOfPath = (...segments) => new RegExp(escapeRe(join(...segments)));

// weekly-audit.sh's bounded()/killtree() rely on `pgrep -P` and killing a
// backgrounded subshell's process tree, which is bash job control this
// script is written for and only ever runs under on the REMOTE LINUX BOX it
// targets (vm/jobs/weekly-audit.sh, a systemd-scheduled job; never something
// a Windows user runs locally). Running that watchdog for real under
// windows-latest CI's Git Bash, rather than just rendering and syntax-checking
// it (which every other test in this group does, and which passes), hung
// past a 20s outer timeout: MSYS's job-control emulation does not reliably
// propagate a `kill -KILL` to the underlying Windows process tree of a
// backgrounded `( subshell ) &`, a known class of MSYS/Cygwin limitation,
// not a bug in the generated script (`bash -n` on it passes, and it is
// unchanged bash whether the host that later executes it for real is a
// Linux box or, incidentally, this CI runner's own shell).
const SKIP_WATCHDOG_KILL_ON_WIN32 = process.platform === 'win32' && "weekly-audit.sh's bounded()/killtree() rely on real POSIX process-group kill semantics MSYS bash does not reliably provide; see the comment above SKIP_WATCHDOG_KILL_ON_WIN32";

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
  assert.ok(rels(l1).has('README.md') && rels(l1).has('ORCHESTRATOR.md') && rels(l1).has(join('protocols', 'build-protocol.md')));
  assert.ok(!rels(l1).has('ROUTING.md') && rels(l2).has('ROUTING.md'));
  assert.ok(!rels(l2).has(join('vm', 'README.md')) && rels(l3).has(join('vm', 'README.md')));
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
  const ccFiles = planFiles({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'] });
  const cc = ccFiles.map((f) => f.rel);
  assert.ok(cc.includes(join('.claude', 'agents', 'deep-planner.md')) && cc.includes('CLAUDE.snippet.md'));
  assert.ok(cc.includes(join('.claude', 'agents', 'finding-verifier.md')), 'the finding-verifier must ship with the Claude Code agent set');
  assert.equal(ccFiles.find((f) => f.rel === join('.claude', 'agents', 'deep-planner.md')).root, 'project', 'subagents must target the project root');
  assert.equal(ccFiles.find((f) => f.rel === 'CLAUDE.snippet.md').root, 'dir');
  assert.ok(!cc.includes(join('.claude', 'agents', 'README.md')), 'a README inside .claude/agents would be parsed as an agent');
  const agy = rels({ level: 1, selected: sel('agy'), primary: byId.agy });
  assert.ok(agy.includes(join('.agents', 'agents', 'deep-planner.md')) && agy.includes('GEMINI.snippet.md'));
  assert.ok(agy.includes(join('.agents', 'agents', 'finding-verifier.md')), 'the finding-verifier must ship in the agy agent set too');
  const codex = rels({ level: 1, selected: sel('codex'), primary: byId.codex });
  assert.ok(codex.includes('AGENTS.snippet.md') && !codex.some((r) => r.startsWith('.claude/')));
  const chat = rels({ level: 1, selected: sel('chatgpt-app'), primary: byId['chatgpt-app'] });
  assert.ok(chat.includes('PASTE-INTO-YOUR-AGENT.md'));
  const l2 = rels({ level: 2, selected: sel('claude-code', 'grok'), primary: byId['claude-code'] });
  assert.equal(l2.filter((r) => r === 'README.md').length, 1, 'exactly one README at the install root');
});

test('generated gateway config references keys by name only, and only for keys the user HOLDS', () => {
  const { apis } = resolveApis(['openrouter', 'anthropic']);
  const y = gatewayModels(sel('claude-code', 'qwen', 'grok', 'ollama'), apis);
  assert.match(y, /os\.environ\/OPENROUTER_API_KEY/);
  assert.match(y, /os\.environ\/ANTHROPIC_API_KEY/);
  assert.doesNotMatch(y, /XAI_API_KEY/, 'selecting the grok CLI must not imply an xAI API key');
  assert.match(y, /ollama\/llama3\.2:3b/, 'the local lane still comes from the ollama selection');
  const none = gatewayModels(sel('claude-code', 'codex', 'grok'), []);
  assert.match(none, /No provider key/);
  assert.deepEqual(envNames(sel('claude-code', 'codex'), []), ['GATEWAY_MASTER_KEY'], 'CLI subscriptions must add no key names');
  assert.doesNotMatch(y, /sk-|Bearer [A-Za-z0-9]/);
  assert.deepEqual(envNames(sel('ollama')), ['GATEWAY_MASTER_KEY']);
});

test('lanes.json lists only selected cli-run lanes', () => {
  const p = planFiles({ level: 2, selected: sel('claude-code', 'codex', 'ollama'), primary: byId['claude-code'] });
  const lanes = JSON.parse(p.find((f) => f.rel === join('bin', 'lanes.json')).content);
  assert.deepEqual(lanes.enabled, ['codex']);
});

test('writing to a temp dir produces the plan; a second run keeps existing files unless force; dry writes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-test-'));
  try {
    const files = planFiles({ level: 2, selected: sel('claude-code', 'codex'), primary: byId['claude-code'], dir, project: dir });
    const first = writeFiles(files, { dir, project: dir });
    assert.equal(first.written.length, files.length);
    assert.equal(first.skipped.length, 0);
    for (const f of files) assert.ok(existsSync(join(dir, f.rel)), 'missing ' + f.rel);
    // The executable bit is a POSIX permission concept; NTFS has nothing
    // equivalent, so chmod 0o755 there is close to a no-op and statSync().mode
    // does not report it the same way. writeFiles() still passes mode 0o755
    // for every file this catalog marks executable; there is just nothing
    // meaningful to assert about it from this test on win32.
    if (process.platform !== 'win32') assert.ok(statSync(join(dir, 'bin', 'cli-run.mjs')).mode & 0o100, 'cli-run.mjs is executable');

    writeFileSync(join(dir, 'README.md'), 'mine');
    const second = writeFiles(files, { dir, project: dir });
    // machine-owned files (MANIFEST.json, bin/lanes.json) are always rewritten; documents are kept.
    // written/skipped/etc are report labels: posix-normalized on every host (see writeFiles()),
    // not the OS-native join() the existsSync() check above correctly uses for a real path.
    assert.deepEqual(second.written.sort(), ['MANIFEST.json', 'bin/lanes.json']);
    assert.equal(second.skipped.length, files.length - 2);
    assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), 'mine', 'existing file was overwritten without --force');

    const forced = writeFiles(files, { dir, project: dir, force: true });
    assert.equal(forced.written.length, files.length);
    assert.notEqual(readFileSync(join(dir, 'README.md'), 'utf8'), 'mine');

    const dryDir = mkdtempSync(join(tmpdir(), 'orch-dry-'));
    const dry = writeFiles(files, { dir: dryDir, project: dryDir, dry: true });
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
  const sh = p.find((f) => f.rel === join('vm', 'setup-vm.sh')).content;
  assert.match(sh, /for pkg in ""; do/);
  assert.match(sh, /\[ -z "\$pkg" \] && continue/);
  const r = spawnSync('bash', ['-n'], { input: sh, encoding: 'utf8' });
  assert.equal(r.status, 0, 'bash -n rejected the rendered script: ' + r.stderr);
  const full = planFiles({ level: 3, selected: sel('claude-code', 'codex', 'grok'), primary: byId['claude-code'] }).find((f) => f.rel === join('vm', 'setup-vm.sh')).content;
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
    assert.match(preflight([{ rel: 'bin/cli-run.mjs', content: 'x', mode: 0o755 }], dir).join(' '), /is a symlink/);
    assert.throws(() => writeFiles([{ rel: 'bin/cli-run.mjs', content: 'x', mode: 0o755 }], { dir }), /symlink/);
    assert.ok(!existsSync(join(elsewhere, 'cli-run.mjs')), 'write followed the symlink');
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
  const sh = withLane.find((f) => f.rel === join('vm', 'jobs', 'weekly-audit.sh')).content;
  assert.match(sh, /AUDIT_LANE="codex"/);
  assert.match(sh, /INSTALL_DIR='\/opt\/custom-orch'/);
  assert.match(sh, /audit-brief-.*\.md/, 'the composed brief is what the lane reads');
  assert.match(sh, /live-state\.md/);
  assert.doesNotMatch(sh, /exit 13/, 'guard must be empty when a lane exists');
  const svc = withLane.find((f) => f.rel === join('vm', 'jobs', 'weekly-audit.service')).content;
  assert.match(svc, /WorkingDirectory=\/opt\/custom-orch/);
  assert.match(svc, /ExecStart=\/bin\/bash "\/opt\/custom-orch\/vm\/jobs\/weekly-audit\.sh"/);
  const noLane = planFiles({ level: 3, selected: sel('claude-code', 'ollama'), primary: byId['claude-code'], dir: '/x' });
  const sh2 = noLane.find((f) => f.rel === join('vm', 'jobs', 'weekly-audit.sh')).content;
  assert.match(sh2, /AUDIT_LANE="none"/);
  assert.match(sh2, /exit 13/);
  assert.equal(spawnSync('bash', ['-n'], { input: sh2, encoding: 'utf8' }).status, 0);
  assert.equal(spawnSync('bash', ['-n'], { input: sh, encoding: 'utf8' }).status, 0);
});

test('the weekly audit refuses a gateway key that would inject curl config', () => {
  const sh = planFiles({ level: 3, selected: sel('codex'), primary: byId.codex, dir: '/x' }).find((f) => f.rel === join('vm', 'jobs', 'weekly-audit.sh')).content;
  const d = mkdtempSync(join(tmpdir(), 'orch-key-'));
  const script = join(d, 'a.sh');
  writeFileSync(script, sh.replace("INSTALL_DIR='/x'", `INSTALL_DIR='${d}'`));
  const r = spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, HOME: d, USERPROFILE: d, GATEWAY_MASTER_KEY: 'marker"\nheader = "X-Injected: yes' } });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /must match/);
  rmSync(d, { recursive: true, force: true });
});

test('codecalc: selected writes CODECALC.md and snippets; the numbers-and-logic protocol is always written', () => {
  const { tools, unknown } = resolveTools(['codecalc', 'nope']);
  assert.deepEqual(tools.map((t) => t.id), ['codecalc']);
  assert.deepEqual(unknown, ['nope']);
  const withTool = planFiles({ level: 1, selected: sel('codex'), primary: byId.codex, tools }).map((f) => f.rel);
  assert.ok(withTool.includes('CODECALC.md') && withTool.includes(join('mcp', 'codex.config.toml')) && withTool.includes(join('protocols', 'numbers-and-logic.md')));
  const without = planFiles({ level: 1, selected: sel('codex'), primary: byId.codex, tools: [] });
  assert.ok(!without.some((f) => f.rel === 'CODECALC.md'));
  assert.ok(without.some((f) => f.rel === join('protocols', 'numbers-and-logic.md')));
  const nl = without.find((f) => f.rel === join('protocols', 'numbers-and-logic.md')).content;
  assert.match(nl, /not selected/);
  assert.match(nl, /github\.com\/The-40-Thieves\/codecalc/);
});

// ---- audit round 2 fixes ----
import { shellQuote, systemdEscape, dirProblems, realRoot } from '../src/install.js';
import { realpathSync } from 'node:fs';

test('--dir is data in the rendered script and unit, never syntax', () => {
  const dir = '/tmp/safe"; echo DIR_INJECTED >&2; #';
  const files = planFiles({ level: 3, selected: sel('codex'), primary: byId.codex, dir, tools: [] });
  const sh = files.find((f) => f.rel === join('vm', 'jobs', 'weekly-audit.sh')).content;
  const r = spawnSync('bash', ['-s'], { input: sh, encoding: 'utf8', env: { ...process.env, HOME: '/nonexistent', USERPROFILE: '/nonexistent' } });
  // An executed injection prints a line that is exactly the marker. The
  // script's own "missing" message legitimately echoes the directory name as
  // data, marker included, so the oracle is the whole line, not a substring.
  assert.ok(!r.stderr.split('\n').includes('DIR_INJECTED'), 'the directory name executed as a command:\n' + r.stderr);
  assert.match(r.stderr, /weekly-audit: .*DIR_INJECTED.* missing/, 'the directory should appear as data in the missing-dir message');
  assert.match(sh, /INSTALL_DIR='\/tmp\/safe"; echo DIR_INJECTED >&2; #'/);
  assert.equal(shellQuote("it's"), "'it'\\''s'");
  assert.equal(systemdEscape('/a/100%/b'), '/a/100%%/b');
  const svc = planFiles({ level: 3, selected: sel('codex'), primary: byId.codex, dir: '/opt/100% sure', tools: [] }).find((f) => f.rel === join('vm', 'jobs', 'weekly-audit.service')).content;
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

// ---- obsidian-tc companion ----
test('obsidian-tc: optional, off by default, writes its doc and snippets only when selected; memory-and-record is always written', () => {
  const { tools } = resolveTools(['obsidian-tc']);
  assert.equal(tools[0].recommended, false, 'obsidian-tc must not be a default');
  assert.match(tools[0].requires, /Obsidian vault/);
  assert.match(tools[0].requires, /Node 24/);
  assert.match(tools[0].requires, /nomic-embed-text/);
  const withTool = planFiles({ level: 1, selected: sel('codex'), primary: byId.codex, tools }).map((f) => f.rel);
  assert.ok(withTool.includes('OBSIDIAN-TC.md'));
  assert.ok(withTool.includes(join('mcp', 'obsidian-tc.codex.config.toml')));
  assert.ok(withTool.includes(join('protocols', 'memory-and-record.md')));
  const without = planFiles({ level: 1, selected: sel('codex'), primary: byId.codex, tools: [] });
  assert.ok(!without.some((f) => f.rel === 'OBSIDIAN-TC.md'));
  const mr = without.find((f) => f.rel === join('protocols', 'memory-and-record.md')).content;
  assert.match(mr, /not selected/);
  assert.match(mr, /github\.com\/The-40-Thieves\/obsidian-tc/);
  const both = planFiles({ level: 2, selected: sel('claude-code'), primary: byId['claude-code'], tools: resolveTools(['codecalc', 'obsidian-tc']).tools }).map((f) => f.rel);
  assert.ok(both.includes('CODECALC.md') && both.includes('OBSIDIAN-TC.md'));
  const doc = planFiles({ level: 1, selected: sel('codex'), primary: byId.codex, tools }).find((f) => f.rel === 'OBSIDIAN-TC.md').content;
  assert.match(doc, /\*\*Optional\.\*\*/);
  assert.match(doc, /What you need first/);
});


// ---- review round: the seven suggestions ----
test('lane sections render from the selection: a claude-code-only install names no other lane', () => {
  const only = planFiles({ level: 2, selected: sel('claude-code'), primary: byId['claude-code'], dir: '/tmp/x', project: '/tmp/x' });
  for (const rel of ['ROUTING.md', 'RESEARCH_TRIAGE.md', 'DELEGATION_MATRIX.md']) {
    const c = only.find((f) => f.rel === rel).content;
    assert.doesNotMatch(c, /cli-run (codex|grok|hermes|agy|qwen)/, `${rel} recommends a lane that is not selected`);
    assert.doesNotMatch(c, /cli-run\.mjs (codex|grok|hermes|agy|qwen)/, `${rel} recommends a lane that is not selected`);
  }
  assert.match(only.find((f) => f.rel === 'ROUTING.md').content, /none selected yet/);
  const codexOnly = planFiles({ level: 2, selected: sel('claude-code', 'codex'), primary: byId['claude-code'], dir: '/tmp/x', project: '/tmp/x' });
  const r = codexOnly.find((f) => f.rel === 'ROUTING.md').content;
  assert.match(r, /cli-run codex --audit/);
  assert.doesNotMatch(r, /cli-run (grok|hermes|agy|qwen)/);
  const rt = codexOnly.find((f) => f.rel === 'RESEARCH_TRIAGE.md').content;
  assert.match(rt, /cli-run\.mjs codex --audit/);
  assert.doesNotMatch(rt, /cli-run\.mjs (grok|hermes|agy|qwen)/);
  assert.match(rt, /1 research engine/);
  const lv = laneVars(sel('claude-code', 'grok', 'qwen'));
  assert.match(lv.LIVE_LANE, /cli-run grok/);
  assert.match(lv.BULK_LANE, /cli-run qwen/);
  assert.match(lv.ATTACK_LANE, /code-reviewer at deep tier/, 'no codex means no codex audit lane');
});

test('snippet paths and the agents note are computed from --dir and --project', () => {
  const p = planFiles({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'], dir: '/proj/tools/orch', project: '/proj' });
  const snip = p.find((f) => f.rel === 'CLAUDE.snippet.md').content;
  // rulesPath is a relative offset between --dir and --project, posix-joined
  // unconditionally: correct on every host without adjustment (the shared,
  // reinterpreted drive letter --dir and --project both pick up on win32
  // cancels out of a *relative* path between them).
  assert.match(snip, /`tools\/orch\/ORCHESTRATOR\.md`/);
  assert.doesNotMatch(snip, /ai-orchestrator\//);
  // AGENTS_DIR names where THIS run wrote subagent files on THIS host: a
  // local path, rendered with this host's own separators. Build the
  // expectation with resolve()/join(), the same functions install.js uses,
  // instead of a hardcoded POSIX literal.
  assert.match(snip, reOfPath(resolve('/proj'), '.claude', 'agents'));
  const same = planFiles({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'], dir: '/proj', project: '/proj' }).find((f) => f.rel === 'CLAUDE.snippet.md').content;
  assert.match(same, /`\.\/ORCHESTRATOR\.md`/);
  // --dir outside --project at level 3: RULES_PATH also reaches vm/box-CLAUDE.md,
  // read by an agent running ON the remote Linux box, so it (and CLAUDE.snippet.md's
  // copy of the same value) stays an absolute POSIX path on every host.
  const outside = planFiles({ level: 3, selected: sel('claude-code'), primary: byId['claude-code'], dir: '/elsewhere/orch', project: '/proj' });
  assert.match(outside.find((f) => f.rel === 'CLAUDE.snippet.md').content, /`\/elsewhere\/orch\/ROUTING\.md`/, 'a dir outside the project renders an absolute POSIX path (level 3 points at ROUTING.md)');
  assert.match(outside.find((f) => f.rel === join('vm', 'box-CLAUDE.md')).content, /\/elsewhere\/orch\/ROUTING\.md/);
  const readme = p.find((f) => f.rel === 'README.md').content;
  assert.match(readme, /cli-run\.log\.jsonl/, 'uninstall must name the log outside the folder');
  assert.match(readme, reOfPath(resolve('/proj'), '.claude', 'agents'));
});

test('writeFiles honours two roots and rolls back across both', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-two-'));
  const project = mkdtempSync(join(tmpdir(), 'orch-proj-'));
  try {
    const files = planFiles({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'], dir, project });
    const r = writeFiles(files, { dir, project });
    assert.ok(existsSync(join(project, '.claude', 'agents', 'deep-planner.md')), 'agents must land in the project root');
    assert.ok(!existsSync(join(dir, '.claude')), 'agents must not also land in --dir');
    assert.ok(r.written.some((w) => w.startsWith('[project] ')));
    // a conflict in the project root must leave --dir untouched too
    const dir2 = mkdtempSync(join(tmpdir(), 'orch-two2-'));
    const project2 = mkdtempSync(join(tmpdir(), 'orch-proj2-'));
    mkdirSync(join(project2, '.claude'));
    writeFileSync(join(project2, '.claude', 'agents'), 'a file where the agents DIRECTORY must be');
    assert.throws(() => writeFiles(planFiles({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'], dir: dir2, project: project2 }), { dir: dir2, project: project2 }), /\[project\]/);
    assert.ok(!existsSync(join(dir2, 'README.md')), 'a project-root conflict must not leave docs behind');
    rmSync(dir2, { recursive: true, force: true });
    rmSync(project2, { recursive: true, force: true });
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('pins: images and npm installs are versioned, and the pin reaches the rendered box files', () => {
  const p = planFiles({ level: 3, selected: sel('claude-code', 'codex', 'ollama'), primary: byId['claude-code'], dir: '/x', project: '/x', tools: resolveTools(['codecalc', 'obsidian-tc']).tools });
  const compose = p.find((f) => f.rel === join('vm', 'docker-compose.yml')).content;
  assert.doesNotMatch(compose, /:latest|main-latest/);
  assert.match(compose, /litellm:v\d+\.\d+\.\d+/);
  assert.match(compose, /ollama\/ollama:\d+\.\d+\.\d+/);
  const sh = p.find((f) => f.rel === join('vm', 'setup-vm.sh')).content;
  assert.match(sh, /@anthropic-ai\/claude-code@\d+\.\d+\.\d+/);
  assert.match(sh, /@openai\/codex@\d+\.\d+\.\d+/);
  assert.equal(spawnSync('bash', ['-n'], { input: sh, encoding: 'utf8' }).status, 0);
  assert.match(p.find((f) => f.rel === 'CODECALC.md').content, /codecalc\[full\]==\d+\.\d+\.\d+/);
  assert.match(p.find((f) => f.rel === 'OBSIDIAN-TC.md').content, /obsidian-tc@\d+\.\d+\.\d+/);
});

test('agy as primary renders concrete model tiers and a builder that may run commands', () => {
  const p = planFiles({ level: 1, selected: sel('agy'), primary: byId.agy, dir: '/x', project: '/x' });
  const orch = p.find((f) => f.rel === 'ORCHESTRATOR.md').content;
  assert.doesNotMatch(orch, /your strongest model/);
  assert.match(orch, /\| pro, highest effort/);
  const builder = p.find((f) => f.rel === join('.agents', 'agents', 'builder.md')).content;
  assert.match(builder, /commandExecutionPolicy: auto/);
  assert.match(p.find((f) => f.rel === join('.agents', 'agents', 'code-reviewer.md')).content, /commandExecutionPolicy: off/);
});


// ---- audit issues #2, #3, #10: the generated weekly audit, executed ----
function renderAudit(lane, dir) {
  const files = planFiles({ level: 3, selected: sel(lane), primary: byId[lane === 'hermes' ? 'codex' : lane], dir, project: dir });
  return { sh: files.find((f) => f.rel === join('vm', 'jobs', 'weekly-audit.sh')).content, svc: files.find((f) => f.rel === join('vm', 'jobs', 'weekly-audit.service')).content };
}
function stubTree(d, entries) {
  const bin = join(d, 'bin');
  mkdirSync(bin, { recursive: true });
  for (const [name, body] of Object.entries(entries)) writeFileSync(join(bin, name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
  return bin;
}
// These tests spawn `bash` directly (not through cli-run.mjs's own spawn
// logic at all), and the script it runs shells out to node/codex/jq/curl by
// bare name, so PATH has to put the stub dir first and still let bash find
// its own coreutils. A hand-built minimal PATH ('/usr/bin', '/bin') is a
// POSIX assumption: neither is a real Windows path, and on windows-latest CI
// this repo's own job already runs under Git Bash (.github/workflows/test.yml
// sets defaults.run.shell: bash), so process.env.PATH already carries
// whatever bash itself needs; only the stub dir needs prepending, to win the
// lookup for the four names each script explicitly fakes.
const stubPath = (bin) => [bin, ...(process.env.PATH || '').split(delimiter)].filter(Boolean).join(delimiter);

test('#2: the codex audit passes --audit and the script states the boundary; other lanes state that none is enforced', () => {
  const { sh } = renderAudit('codex', '/x');
  assert.match(sh, /AUDIT_LANE_FLAGS="--audit"/);
  assert.match(sh, /cli-run\.mjs "\$AUDIT_LANE" \$AUDIT_LANE_FLAGS --brief/);
  assert.match(sh, /read-only filesystem sandbox/);
  const files = planFiles({ level: 3, selected: sel('codex', 'hermes'), primary: byId.codex, dir: '/x', project: '/x' });
  const hermes = files.find((f) => f.rel === join('vm', 'jobs', 'weekly-audit.sh')).content;
  assert.match(hermes, /AUDIT_LANE="hermes"/);
  assert.match(hermes, /AUDIT_LANE_FLAGS=""/);
  assert.match(hermes, /instruction-level only/);
  // argv actually built by the runner for the audit shape
  const { argv } = buildArgv('codex', '/bin/codex', 'p', { timeout: 60, audit: true }, '/tmp');
  assert.ok(argv.includes('--sandbox') && argv.includes('read-only'));
});

test('#3: a failed rerun never truncates the previous report; failed output is kept beside it', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-audit3-'));
  const { sh } = renderAudit('codex', d);
  mkdirSync(join(d, 'reports'), { recursive: true });
  mkdirSync(join(d, 'protocols'), { recursive: true });
  writeFileSync(join(d, 'protocols', 'gap-analysis.md'), 'protocol');
  writeFileSync(join(d, 'DELEGATION_MATRIX.md'), 'matrix');
  mkdirSync(join(d, 'bin'), { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const report = join(d, 'reports', `audit-${date}.md`);
  writeFileSync(report, 'previous successful report\n');
  const stubs = stubTree(join(d, 'stubs'), { node: 'echo partial garbage\nexit 13', codex: 'echo codex 1.0', jq: 'cat >/dev/null; echo', curl: 'exit 7' });
  const script = join(d, 'weekly-audit.sh');
  writeFileSync(script, sh);
  const r = spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, PATH: stubPath(stubs), HOME: d, USERPROFILE: d } });
  assert.equal(r.status, 13, r.stdout + r.stderr);
  assert.equal(readFileSync(report, 'utf8'), 'previous successful report\n', 'the previous report was truncated');
  const failed = readdirSync(join(d, 'reports')).filter((f) => f.startsWith('failed-audit-') && f.endsWith('-rc13.md'));
  assert.equal(failed.length, 1, 'failed output must be kept for diagnosis');
  assert.match(r.stderr, /previous report kept/);
  // a clean run replaces it
  const ok = stubTree(join(d, 'stubs2'), { node: 'echo fresh report', codex: 'echo codex 1.0', jq: 'cat >/dev/null; echo', curl: 'exit 7' });
  const r2 = spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, PATH: stubPath(ok), HOME: d, USERPROFILE: d } });
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(readFileSync(report, 'utf8'), 'fresh report\n');
  rmSync(d, { recursive: true, force: true });
});

test('#10: a hanging --version probe and a hanging gateway are cut off by the watchdog, and the unit has a whole-job deadline', { skip: SKIP_WATCHDOG_KILL_ON_WIN32 }, () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-audit10-'));
  const { sh, svc } = renderAudit('codex', d);
  assert.match(svc, /TimeoutStartSec=900/);
  assert.match(svc, /KillMode=control-group/);
  assert.match(sh, /--connect-timeout 5 --max-time/);
  mkdirSync(join(d, 'reports'), { recursive: true });
  mkdirSync(join(d, 'protocols'), { recursive: true });
  writeFileSync(join(d, 'protocols', 'gap-analysis.md'), 'protocol');
  writeFileSync(join(d, 'DELEGATION_MATRIX.md'), 'matrix');
  mkdirSync(join(d, 'bin'), { recursive: true });
  const stubs = stubTree(join(d, 'stubs'), {
    node: 'echo report',
    codex: 'if [ "$1" = "--version" ]; then /bin/sleep 30; fi; echo never',
    curl: '/bin/sleep 30',
    jq: 'cat >/dev/null; echo'
  });
  const script = join(d, 'weekly-audit.sh');
  writeFileSync(script, sh);
  const t0 = Date.now();
  const r = spawnSync('bash', [script], { encoding: 'utf8', env: { ...process.env, PATH: stubPath(stubs), HOME: d, USERPROFILE: d, PROBE_SECS: '1', GATEWAY_MASTER_KEY: 'abc123' }, timeout: 20000 });
  const secs = (Date.now() - t0) / 1000;
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(secs < 12, `collection was not bounded: ${secs}s`);
  const live = readFileSync(join(d, 'reports', 'live-state.md'), 'utf8');
  assert.match(live, /UNVERIFIED: --version timed out/);
  assert.match(live, /UNVERIFIED: gateway unreachable or timed out/);
  rmSync(d, { recursive: true, force: true });
});

test('#10b: bounded() reports a timeout (rc 124) even when the killed command runs on after its child dies', { skip: SKIP_WATCHDOG_KILL_ON_WIN32 }, () => {
  // Seen once on macOS CI: the tree kill reached the hung probe's child first,
  // the probe's own shell printed and exited 0, and the report recorded
  // "codex never" instead of "UNVERIFIED: --version timed out". This makes
  // that ordering deterministic by overriding killtree to reach only the
  // children, then checks bounded() still says 124.
  const d = mkdtempSync(join(tmpdir(), 'orch-bounded-'));
  const { sh } = renderAudit('codex', d);
  const defs = sh.match(/^killtree\(\) \{[\s\S]*?^\}\nbounded\(\) \{[\s\S]*?^\}/m);
  assert.ok(defs, 'killtree() and bounded() must be found in the rendered script');
  const harness = [
    defs[0],
    'killtree() { for c in $(pgrep -P "$1" 2>/dev/null); do kill -KILL "$c" 2>/dev/null; done; }',
    "bounded 1 bash -c '/bin/sleep 30; echo never'",
    'echo "rc=$?"'
  ].join('\n');
  const r = spawnSync('bash', ['-c', harness], { encoding: 'utf8', timeout: 20000 });
  assert.match(r.stdout, /rc=124/, r.stdout + r.stderr);
  rmSync(d, { recursive: true, force: true });
});

test('the agent snippet names the routing file for the level: ORCHESTRATOR.md at 1, ROUTING.md at 2 and 3', () => {
  for (const [level, file] of [[1, 'ORCHESTRATOR.md'], [2, 'ROUTING.md'], [3, 'ROUTING.md']]) {
    for (const primary of ['claude-code', 'codex']) {
      const files = planFiles({ level, selected: sel('claude-code', 'codex'), primary: byId[primary] });
      const snippet = files.find((f) => /\.snippet\.md$/.test(f.rel));
      assert.ok(snippet, `no snippet at level ${level} for ${primary}`);
      assert.match(snippet.content, new RegExp('Routing rules live in `[^`]*/' + file.replace('.', '\\.') + '`'), `${snippet.rel} at level ${level} should point at ${file}`);
      assert.doesNotMatch(snippet.content, /or `[^`]*ROUTING\.md` at level 2\+/, 'the conditional clause is gone');
    }
  }
});

test('chat activation fits a 1500-character field for each chat primary', () => {
  for (const id of ['chatgpt-app', 'claude-app', 'gemini-app']) {
    const files = planFiles({ level: 1, selected: sel(id), primary: byId[id] });
    const doc = files.find((f) => f.rel === 'PASTE-INTO-YOUR-AGENT.md').content;
    const block = doc.split('```')[1].trim();
    assert.ok(block.length > 0 && block.length <= 1500, `${id}: ${block.length} characters`);
    assert.match(doc, /upload or paste/);
  }
});

// #20: the terminal activation list and the generated README were two pages.
// They are one array now, so this test is what keeps them one.
test('the generated README carries the same activation steps the terminal prints', () => {
  for (const level of [1, 2, 3]) {
    for (const primary of Object.values(byId).filter((a) => a.kind !== 'local' && a.minLevel <= level)) {
      const opts = { level, selected: [primary], primary, dir: '/tmp/mo-dir', project: '/tmp/mo-project', tools: [] };
      const steps = activationSteps(opts);
      const readme = planFiles(opts).find((f) => f.rel === 'README.md').content;
      assert.ok(steps.length, `${primary.id} level ${level}: no activation steps`);
      for (const st of steps) assert.ok(readme.includes(st), `${primary.id} level ${level}: README is missing the step "${st}"`);
    }
  }
});

test('the generated README never names an activation file this run did not write', () => {
  for (const primary of Object.values(byId).filter((a) => a.kind !== 'local')) {
    const opts = { level: 1, selected: [primary], primary, dir: '/tmp/mo-dir', project: '/tmp/mo-project' };
    const files = planFiles(opts);
    const written = new Set(files.map((f) => f.rel));
    const readme = files.find((f) => f.rel === 'README.md').content;
    const snippet = snippetFor(primary);
    assert.ok(written.has(snippet), `${primary.id}: planned no ${snippet}`);
    for (const candidate of ['PASTE-INTO-YOUR-AGENT.md', 'CLAUDE.snippet.md', 'GEMINI.snippet.md', 'AGENTS.snippet.md', 'QWEN.snippet.md']) {
      if (candidate === snippet) continue;
      assert.ok(!readme.includes(candidate), `${primary.id}: README names ${candidate}, which this run did not write`);
    }
    assert.ok(!readme.includes("your agent's instructions file"), `${primary.id}: README leaked the placeholder rules-file wording`);
  }
});

// #21: a chat-app install writes no project files, so it must not print a
// project root that does not exist.
test('a chat primary reports no project root; a subagent primary reports the real one', () => {
  // These are LOCAL paths (a project root on THIS host), so the expectation is
  // built with resolve()/join() rather than a hardcoded POSIX literal.
  const missingProject = resolve('/tmp/mo-project-that-does-not-exist');
  const chat = planFiles({ level: 1, selected: [byId['claude-app']], primary: byId['claude-app'], dir: '/tmp/mo-dir', project: '/tmp/mo-project-that-does-not-exist' })
    .find((f) => f.rel === 'README.md').content;
  assert.ok(chat.includes('Project root: none'), 'chat install still claims a project root');
  assert.ok(!chat.includes(missingProject), 'chat install printed a path nothing was written to');

  const project = resolve('/tmp/mo-project');
  const cc = planFiles({ level: 1, selected: [byId['claude-code']], primary: byId['claude-code'], dir: '/tmp/mo-dir', project: '/tmp/mo-project' })
    .find((f) => f.rel === 'README.md').content;
  assert.ok(cc.includes('Project root (where your agent reads rules and subagents): `' + project + '`'));
  assert.ok(cc.includes(join(project, '.claude', 'agents')));

  // codex reads AGENTS.md from the project root but gets no files there: name the
  // path, and say plainly that this run did not create it.
  const codex = planFiles({ level: 1, selected: [byId.codex], primary: byId.codex, dir: '/tmp/mo-dir', project: '/tmp/mo-project-that-does-not-exist' })
    .find((f) => f.rel === 'README.md').content;
  assert.ok(codex.includes('this run wrote nothing there'), 'codex install did not flag the missing project folder');
});

// #22: the possessive used to swallow the catalog's "(chat only, no CLI)" note.
test('the chat activation line is a sentence, not a possessive around a parenthetical', () => {
  for (const id of ['claude-app', 'chatgpt-app', 'gemini-app']) {
    const step = activationSteps({ level: 1, selected: [byId[id]], primary: byId[id], dir: '/tmp/mo-dir', project: '/tmp/mo-project' })[0];
    assert.ok(!step.includes("'s"), id + ': activation line still uses a possessive: ' + step);
    assert.ok(!step.includes('(chat only, no CLI)'), id + ': the catalog note leaked into the sentence');
    assert.match(step, /^open .+ and paste the block in .+ into its /, id + ': ' + step);
  }
});

// #27: "Then prove it took" step 4 told a level 1 reader to run bin/cli-run.mjs
// and read bin/lanes.json. Level 1 writes no bin/. The section is one array now.
const proveSection = (readme) => {
  const start = readme.indexOf('## Then prove it took');
  assert.ok(start >= 0, 'README has no "Then prove it took" section');
  const rest = readme.slice(start + '## Then prove it took'.length);
  const end = rest.indexOf('\n## ');
  return (end >= 0 ? rest.slice(0, end) : rest).trim();
};

test('the generated README carries exactly the proof steps, for every level and primary', () => {
  for (const level of [1, 2, 3]) {
    for (const primary of Object.values(byId).filter((a) => a.kind !== 'local' && a.minLevel <= level)) {
      const opts = { level, selected: [primary], primary, dir: '/tmp/mo-dir', project: '/tmp/mo-project', tools: [] };
      const readme = planFiles(opts).find((f) => f.rel === 'README.md').content;
      const expected = proofSteps({ level, primary }).map((st, i) => `${i + 1}. ${st}`).join('\n');
      assert.equal(proveSection(readme), expected, `${primary.id} level ${level}: proof section drifted from proofSteps()`);
    }
  }
});

test('the proof steps never name a bin/ file the plan did not write', () => {
  for (const level of [1, 2, 3]) {
    for (const primary of Object.values(byId).filter((a) => a.kind !== 'local' && a.minLevel <= level)) {
      const opts = { level, selected: [primary], primary, dir: '/tmp/mo-dir', project: '/tmp/mo-project', tools: [] };
      const files = planFiles(opts);
      const written = new Set(files.map((f) => f.rel.split('\\').join('/')));
      const section = proveSection(files.find((f) => f.rel === 'README.md').content);
      for (const ref of section.match(/\bbin\/[A-Za-z0-9_.-]+/g) || []) {
        assert.ok(written.has(ref), `${primary.id} level ${level}: proof steps name ${ref}, which this run did not write`);
      }
      if (level === 1) assert.doesNotMatch(section, /\bbin\//, `${primary.id}: level 1 writes no bin/, so the proof steps must not name one`);
    }
  }
});

// #26: vm/README.md step 3 said `grok login --device-auth` and `agy` whatever
// you selected. It renders from the selection now.
test('the vm README names a sign-in for every selected CLI and for no other', () => {
  const cases = [
    ['claude-code', 'codex', 'qwen', 'ollama'],
    ['claude-code', 'grok'],
    ['agy', 'hermes']
  ];
  for (const ids of cases) {
    const selected = sel(...ids);
    const primary = selected.find((a) => a.kind !== 'local');
    const vm = planFiles({ level: 3, selected, primary, dir: '/tmp/mo-dir', project: '/tmp/mo-project', tools: [], apis: [] })
      .find((f) => f.rel.split('\\').join('/') === 'vm/README.md').content;
    const setup = vm.slice(vm.indexOf('## Setup, in order'), vm.indexOf('## The dispatch shape'));
    for (const a of selected.filter((x) => x.kind === 'agent-cli')) {
      assert.ok(setup.includes(a.auth), `${ids}: vm README omits the sign-in for ${a.id}`);
    }
    for (const other of Object.values(byId).filter((a) => a.kind === 'agent-cli' && !ids.includes(a.id))) {
      assert.ok(!setup.includes(other.auth), `${ids}: vm README carries the sign-in for ${other.id}, which was not selected`);
      assert.ok(!setup.includes(`\`${other.bin} login`), `${ids}: vm README tells you to run ${other.bin} login`);
    }
  }
});

test('a selected local runtime gets an install step at every level it is allowed', () => {
  const ollama = byId.ollama;
  for (const level of [2, 3]) {
    const selected = sel('claude-code', 'ollama');
    const steps = activationSteps({ level, selected, primary: byId['claude-code'], dir: '/tmp/mo-dir', project: '/tmp/mo-project', tools: [] });
    const step = steps.find((st) => st.includes(ollama.install.url));
    assert.ok(step, `level ${level}: no activation step names ${ollama.name}`);
    assert.ok(step.includes(`${ollama.bin} pull`), `level ${level}: the step must say how to get a model, not just the download page`);
    const readme = planFiles({ level, selected, primary: byId['claude-code'], dir: '/tmp/mo-dir', project: '/tmp/mo-project', tools: [] })
      .find((f) => f.rel === 'README.md').content;
    assert.ok(readme.includes(step), `level ${level}: README is missing the ollama step`);
  }
});

test('generated lanes.json carries an empty defaults block and explains it', () => {
  const p = planFiles({ level: 2, selected: [byId['claude-code'], byId['codex']], primary: byId['claude-code'], dir: 'x', project: 'y' });
  const lanes = JSON.parse(p.find((f) => f.rel === join('bin', 'lanes.json')).content);
  assert.deepEqual(lanes.enabled, ['codex'], 'only cli-run lanes are enabled');
  assert.deepEqual(lanes.defaults, {}, 'the installer pins nothing it was not told');
  assert.match(lanes.defaultsNote, /inherits its own config file|inherit/, 'the file must say what an unpinned lane does');
});

test('the finding-verifier is read-only and can answer all three verdicts', () => {
  const p = planFiles({ level: 2, selected: [byId['claude-code']], primary: byId['claude-code'], dir: 'x', project: 'y' });
  const fv = p.find((f) => f.rel === join('.claude', 'agents', 'finding-verifier.md')).content;
  for (const verdict of ['CONFIRMED', 'NOT_REPRODUCED', 'INCONCLUSIVE']) assert.ok(fv.includes(verdict), 'missing verdict ' + verdict);
  assert.match(fv, /read-only/i);
  assert.match(fv, /effort: high/, 'judging a claim is not a low-effort job');
});

// ---- delegate by default (0.1.15): delegate by default, claude-code only ----
import { subagentsLoadRules, claudeAgentIds, routeGateTable, decisionRule5 } from '../src/install.js';

test('claude-code --yes plan includes all three hooks, the settings snippet, and both new agents; other primaries include none of it', () => {
  const cc = planFiles({ level: 2, selected: sel('claude-code'), primary: byId['claude-code'], dir: 'x', project: 'y' });
  const ccRels = cc.map((f) => f.rel);
  assert.ok(ccRels.includes(join('.claude', 'hooks', 'route-gate.mjs')), 'claude-code plan is missing route-gate.mjs');
  assert.ok(ccRels.includes(join('.claude', 'hooks', 'subagent-context.mjs')), 'claude-code plan is missing subagent-context.mjs');
  assert.ok(ccRels.includes(join('.claude', 'hooks', 'route-metrics.mjs')), 'claude-code plan is missing route-metrics.mjs');
  assert.ok(ccRels.includes('settings.hooks.snippet.json'), 'claude-code plan is missing the settings snippet');
  assert.ok(ccRels.includes(join('.claude', 'agents', 'done-verifier.md')), 'claude-code plan is missing done-verifier');
  assert.ok(ccRels.includes(join('.claude', 'agents', 'reader.md')), 'claude-code plan is missing reader');
  for (const hook of ['route-gate.mjs', 'subagent-context.mjs', 'route-metrics.mjs']) {
    assert.equal(cc.find((f) => f.rel === join('.claude', 'hooks', hook)).mode, 0o755, hook + ' must be executable');
    assert.equal(cc.find((f) => f.rel === join('.claude', 'hooks', hook)).root, 'project', hook + ' belongs at the project root, like the agents Claude Code reads');
  }

  for (const id of ['codex', 'agy', 'chatgpt-app']) {
    const p = planFiles({ level: 2, selected: sel(id), primary: byId[id], dir: 'x', project: 'y' });
    const rels = p.map((f) => f.rel);
    assert.ok(!rels.some((r) => r.includes('route-gate') || r.includes('subagent-context') || r.includes('route-metrics') || r.includes('settings.hooks')), `${id}: hooks leaked into a non-claude-code primary's plan`);
    // agy gets the same new agents in its own format, just no hooks (hooks are claude-code only).
    if (id === 'agy') {
      assert.ok(rels.includes(join('.agents', 'agents', 'done-verifier.md')));
      assert.ok(rels.includes(join('.agents', 'agents', 'reader.md')));
    }
  }
});

test('settings.hooks.snippet.json wires all five route-metrics events plus the two existing hooks', () => {
  const cc = planFiles({ level: 2, selected: sel('claude-code'), primary: byId['claude-code'], dir: 'x', project: 'y' });
  const snippet = JSON.parse(cc.find((f) => f.rel === 'settings.hooks.snippet.json').content);
  const commandsFor = (event) => (snippet.hooks[event] || []).flatMap((g) => g.hooks.map((h) => h.args.join(' ')));
  for (const event of ['UserPromptSubmit', 'PreToolUse', 'SubagentStart', 'SubagentStop', 'Stop']) {
    assert.ok(snippet.hooks[event], event + ' is missing from the settings snippet');
    assert.ok(commandsFor(event).some((c) => c.includes('route-metrics.mjs')), event + ' does not wire route-metrics.mjs');
  }
  assert.ok(commandsFor('UserPromptSubmit').some((c) => c.includes('route-gate.mjs')), 'UserPromptSubmit must keep route-gate.mjs');
  assert.ok(commandsFor('SubagentStart').some((c) => c.includes('subagent-context.mjs')), 'SubagentStart must keep subagent-context.mjs');
  assert.equal(snippet.hooks.PreToolUse[0].matcher, 'Agent|Task', 'PreToolUse must be scoped to Agent|Task, not every tool call');
});

test('the route-gate block ends with the hidden route marker instruction', () => {
  const routing = planFiles({ level: 2, selected: sel('claude-code'), primary: byId['claude-code'], dir: 'x', project: 'y' }).find((f) => f.rel === 'ROUTING.md').content;
  assert.match(routing, /<!-- route: <lane> \| <why, a few words> -->/, 'ROUTING.md route-gate block must instruct the hidden route marker');
});

test('ROUTING.md rule 5 names builder for claude-code and keeps "builds it directly" for codex', () => {
  const cc = planFiles({ level: 2, selected: sel('claude-code'), primary: byId['claude-code'], dir: 'x', project: 'y' }).find((f) => f.rel === 'ROUTING.md').content;
  assert.match(cc, /builder executes by default/, 'claude-code ROUTING.md should route the main build to builder');
  assert.doesNotMatch(cc, /the orchestrator builds it directly\. Bounded sub-parts/, 'claude-code should not keep the old wording');

  const codex = planFiles({ level: 2, selected: sel('codex'), primary: byId.codex, dir: 'x', project: 'y' }).find((f) => f.rel === 'ROUTING.md').content;
  assert.match(codex, /the orchestrator builds it directly\. Bounded sub-parts/, 'codex should keep the conservative wording: it has no verified premise');
  assert.doesNotMatch(codex, /builder executes by default/, 'codex has no builder agent to route to');

  assert.equal(subagentsLoadRules(byId['claude-code']), true);
  assert.equal(subagentsLoadRules(byId.codex), false);
  assert.equal(subagentsLoadRules(byId.agy), false, 'only claude-code has the verified sub-agents doc quote');
  assert.match(decisionRule5(byId['claude-code']), /general-purpose should not take work a named agent already owns/);
});

test('no generated claude-code file states the old unqualified "holds none of these rules" premise', () => {
  const p = planFiles({ level: 2, selected: sel('claude-code'), primary: byId['claude-code'], dir: 'x', project: 'y' });
  for (const f of p) {
    assert.doesNotMatch(f.content, /holds none of (these|your) rules/i, `${f.rel} still states the unqualified premise`);
    assert.doesNotMatch(f.content, /starts with none of them/i, `${f.rel} still states the unqualified premise`);
  }
});

test('done-verifier and reader are read-only in both agent formats: no Write or Edit, agy commandExecutionPolicy off', () => {
  for (const [dirName, format] of [['claude-code', 'cc'], ['agy', 'agy']]) {
    for (const name of ['done-verifier', 'reader']) {
      const raw = readFileSync(join('templates', 'agents', dirName, name + '.md'), 'utf8');
      const frontmatter = raw.slice(0, raw.indexOf('---', 3));
      if (format === 'cc') {
        assert.match(frontmatter, /^tools:/m, `${dirName}/${name}.md must declare an explicit tools list`);
        const toolsLine = frontmatter.match(/^tools:.*$/m)[0];
        assert.doesNotMatch(toolsLine, /\bWrite\b|\bEdit\b/, `${dirName}/${name}.md must not carry Write or Edit`);
      } else {
        assert.match(frontmatter, /commandExecutionPolicy:\s*off/, `${dirName}/${name}.md must be commandExecutionPolicy off`);
      }
    }
  }
});

test('the claude-code snippet\'s agent list is generated from the agent files actually shipped', () => {
  const ids = claudeAgentIds();
  assert.ok(ids.includes('done-verifier') && ids.includes('reader') && ids.includes('finding-verifier'), 'claudeAgentIds() dropped a shipped agent');
  const onDisk = readdirSync(join('templates', 'agents', 'claude-code')).filter((f) => f.endsWith('.md') && f !== 'README.md').map((f) => f.replace(/\.md$/, ''));
  assert.deepEqual([...ids].sort(), onDisk.sort(), 'claudeAgentIds() must list exactly the files on disk');
  const snippet = planFiles({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'], dir: 'x', project: 'y' }).find((f) => f.rel === 'CLAUDE.snippet.md').content;
  for (const id of ids) assert.ok(snippet.includes('`' + id + '`'), `CLAUDE.snippet.md agent list is missing ${id}`);
});

test('routeGateTable renders the fixed rows plus one per selected cli-run lane', () => {
  const base = routeGateTable(sel('claude-code'));
  assert.match(base, /bulk-worker/);
  assert.match(base, /done-verifier/);
  assert.match(base, /reader/);
  assert.doesNotMatch(base, /cli-run/, 'no cli-run lane was selected');
  const withCodex = routeGateTable(sel('claude-code', 'codex'));
  assert.match(withCodex, /`cli-run codex`/);
});

// ---- pre-release audit finding 2, generalized: any claude-code agent whose tools include
// Bash must not call itself unqualified "Read-only" in its description, and no generated
// doc surface may describe it that way either. done-verifier (0.1.15) was the first fix;
// finding-verifier and code-reviewer carried the same overclaim and are caught here too. ----

function bashAgentsOnDisk() {
  const dir = join('templates', 'agents', 'claude-code');
  const names = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.md') || file === 'README.md') continue;
    const raw = readFileSync(join(dir, file), 'utf8');
    const frontmatter = raw.slice(0, raw.indexOf('---', 3));
    const toolsLine = frontmatter.match(/^tools:.*$/m);
    if (toolsLine && /\bBash\b/.test(toolsLine[0])) names.push(file.replace(/\.md$/, ''));
  }
  return names;
}

test('reader has no Bash/Write/Edit in either format', () => {
  const ccReader = readFileSync(join('templates', 'agents', 'claude-code', 'reader.md'), 'utf8');
  const ccToolsLine = ccReader.match(/^tools:.*$/m)[0];
  assert.doesNotMatch(ccToolsLine, /\bBash\b|\bWrite\b|\bEdit\b/, 'reader (claude-code) must stay genuinely read-only');

  const agyReader = readFileSync(join('templates', 'agents', 'agy', 'reader.md'), 'utf8');
  assert.match(agyReader, /commandExecutionPolicy:\s*off/, 'reader (agy) must have command execution off');
});

test('every claude-code agent carrying Bash qualifies any "Read-only" claim, in its own file and in every generated doc', () => {
  const bashAgents = bashAgentsOnDisk();
  // Sanity check: this suite exists because agents with Bash exist. An empty list here would
  // make every assertion below vacuously true, which is the failure mode this test guards.
  assert.ok(bashAgents.length >= 2, `expected at least done-verifier and one more Bash-carrying agent, found: ${bashAgents.join(', ')}`);

  const dir = join('templates', 'agents', 'claude-code');
  for (const name of bashAgents) {
    const raw = readFileSync(join(dir, name + '.md'), 'utf8');
    const descriptionLine = raw.split('\n').find((l) => l.startsWith('description:'));
    assert.doesNotMatch(descriptionLine, /\bRead-only\b(?![^.\n]*(?:Bash|prompt|grant|tool))/i,
      `${name}.md carries Bash but its description calls it unqualified "Read-only"`);
    assert.match(raw, /bound by the prompt|bound only by its prompt|not by the tool grant|not a restriction/i,
      `${name}.md carries Bash but never says the read-only boundary is a prompt rule, not a tool restriction`);
  }

  const docsToCheck = [
    ['README.md', readFileSync('README.md', 'utf8')],
    ['CHANGELOG.md', readFileSync('CHANGELOG.md', 'utf8')],
    ['templates/agents/claude-code/README.md', readFileSync(join('templates', 'agents', 'claude-code', 'README.md'), 'utf8')],
    ['templates/agents/agy/README.md', readFileSync(join('templates', 'agents', 'agy', 'README.md'), 'utf8')]
  ];
  const p = planFiles({ level: 2, selected: sel('claude-code'), primary: byId['claude-code'], dir: 'x', project: 'y' });
  for (const name of bashAgents) {
    const forbidden = new RegExp(name + '[^.\\n]{0,80}\\bread-only\\b(?![^.\\n]*(?:Bash|prompt|grant|tool))', 'i');
    for (const [docName, text] of docsToCheck) {
      assert.doesNotMatch(text, forbidden, `${docName} still calls ${name} read-only without qualifying it`);
    }
    // Same check against what the installer actually generates for a claude-code install:
    // the rendered agent file and README must carry the qualifier too, not just the source.
    for (const f of p) {
      if (!f.content.includes(name)) continue;
      assert.doesNotMatch(f.content, forbidden, `${f.rel} still calls ${name} read-only without qualifying it`);
    }
  }
});

// ---- pre-release audit finding 3: claude-code installs still contradicted delegate by default ----

test('claude-code level 2 install contains none of the old orchestrator-writes-everything phrasing; codex still does', () => {
  const forbidden = ['main build itself', 'does not hand off the main build', 'the orchestrator executes', 'never handed off whole'];
  const cc = planFiles({ level: 2, selected: sel('claude-code'), primary: byId['claude-code'], dir: 'x', project: 'y' });
  for (const f of cc) {
    for (const phrase of forbidden) assert.ok(!f.content.includes(phrase), `${f.rel} still contains the old phrase "${phrase}"`);
  }
  const codex = planFiles({ level: 2, selected: sel('codex'), primary: byId.codex, dir: 'x', project: 'y' });
  const codexBlob = codex.map((f) => f.content).join('\n');
  let stillPresent = 0;
  for (const phrase of forbidden) if (codexBlob.includes(phrase)) stillPresent++;
  assert.ok(stillPresent >= 3, 'codex should keep the conservative wording: it has no verified sub-agents premise');

  // The three specific surfaces the audit named, checked directly.
  const bp = cc.find((f) => f.rel === join('protocols', 'build-protocol.md')).content;
  assert.match(bp, /Executes Stage 3 from the orchestrator's brief/);
  assert.match(bp, /Why Stage 3 goes to builder by default/);
  const builder = cc.find((f) => f.rel === join('.claude', 'agents', 'builder.md')).content;
  assert.doesNotMatch(builder, /the main build itself/);
  const routing = cc.find((f) => f.rel === 'ROUTING.md').content;
  assert.match(routing, /builder executes from the orchestrator's brief/);
});

// ---- windows CI finding: MACHINE_OWNED/RUNTIME membership checks must not
// depend on the host's path separator ----
import { MACHINE_OWNED, RUNTIME, fileClass, toPosixRel } from '../src/install.js';

test('toPosixRel/fileClass normalize a backslash-separated rel (win32 path.join output) to the forward-slash form MACHINE_OWNED/RUNTIME are keyed with', () => {
  // A win32 f.rel from path.join looks like 'bin\\lanes.json'; MACHINE_OWNED
  // and RUNTIME are hand-written with forward slashes. Checking one against
  // the other directly (as bin/cli.js's "applied:" and existing-runtime
  // checks did before this fix) silently drops every match on Windows: the
  // "applied:" line in a real reconfigure would report "nothing" instead of
  // naming bin/lanes.json. Reproduced on windows-latest CI (test/cli.test.js's
  // "#6: rerunning with an added lane..."), fixed by routing both call sites
  // in bin/cli.js through the same normalizer fileClass() already used.
  // separator is a parameter (default the real path.sep) so the win32 case
  // is provable from any host, the same pattern which()'s platform param uses.
  const winStyleRel = 'bin\\lanes.json';
  assert.equal(toPosixRel(winStyleRel, '\\'), 'bin/lanes.json');
  assert.ok(!MACHINE_OWNED.has(winStyleRel), 'sanity: the raw win32-separated string must NOT already match by accident');
  assert.ok(MACHINE_OWNED.has(toPosixRel(winStyleRel, '\\')), 'normalized, it must match');
  assert.equal(fileClass(winStyleRel, '\\'), 'owned', 'fileClass must normalize before checking membership');
  assert.equal(fileClass('vm\\setup-vm.sh', '\\'), 'runtime');
  assert.equal(fileClass('protocols\\build-protocol.md', '\\'), 'document');
  // And the real, non-simulated case: whatever THIS host's path.join actually
  // produces must still classify correctly with no separator override at all.
  assert.equal(fileClass(join('bin', 'lanes.json')), 'owned');
  assert.equal(fileClass(join('vm', 'setup-vm.sh')), 'runtime');
});
