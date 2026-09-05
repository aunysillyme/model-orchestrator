import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { planFiles, writeFiles, resolveSelection, resolveApis, gatewayModels, envNames, laneVars } from '../src/install.js';
import { byId } from '../src/catalog.js';
import { render } from '../src/render.js';
import { buildArgv } from '../bin/cli-run.mjs';

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
  const ccFiles = planFiles({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'] });
  const cc = ccFiles.map((f) => f.rel);
  assert.ok(cc.includes('.claude/agents/deep-planner.md') && cc.includes('CLAUDE.snippet.md'));
  assert.equal(ccFiles.find((f) => f.rel === '.claude/agents/deep-planner.md').root, 'project', 'subagents must target the project root');
  assert.equal(ccFiles.find((f) => f.rel === 'CLAUDE.snippet.md').root, 'dir');
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
  const lanes = JSON.parse(p.find((f) => f.rel === 'bin/lanes.json').content);
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
    assert.ok(statSync(join(dir, 'bin', 'cli-run.mjs')).mode & 0o100, 'cli-run.mjs is executable');

    writeFileSync(join(dir, 'README.md'), 'mine');
    const second = writeFiles(files, { dir, project: dir });
    // machine-owned files (MANIFEST.json, bin/lanes.json) are always rewritten; documents are kept
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

// ---- obsidian-tc companion ----
test('obsidian-tc: optional, off by default, writes its doc and snippets only when selected; memory-and-record is always written', () => {
  const { tools } = resolveTools(['obsidian-tc']);
  assert.equal(tools[0].recommended, false, 'obsidian-tc must not be a default');
  assert.match(tools[0].requires, /Obsidian vault/);
  assert.match(tools[0].requires, /Node 24/);
  assert.match(tools[0].requires, /nomic-embed-text/);
  const withTool = planFiles({ level: 1, selected: sel('codex'), primary: byId.codex, tools }).map((f) => f.rel);
  assert.ok(withTool.includes('OBSIDIAN-TC.md'));
  assert.ok(withTool.includes('mcp/obsidian-tc.codex.config.toml'));
  assert.ok(withTool.includes('protocols/memory-and-record.md'));
  const without = planFiles({ level: 1, selected: sel('codex'), primary: byId.codex, tools: [] });
  assert.ok(!without.some((f) => f.rel === 'OBSIDIAN-TC.md'));
  const mr = without.find((f) => f.rel === 'protocols/memory-and-record.md').content;
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
  assert.match(snip, /`tools\/orch\/ORCHESTRATOR\.md`/);
  assert.doesNotMatch(snip, /ai-orchestrator\//);
  assert.match(snip, /\/proj\/\.claude\/agents/);
  const same = planFiles({ level: 1, selected: sel('claude-code'), primary: byId['claude-code'], dir: '/proj', project: '/proj' }).find((f) => f.rel === 'CLAUDE.snippet.md').content;
  assert.match(same, /`\.\/ORCHESTRATOR\.md`/);
  const outside = planFiles({ level: 3, selected: sel('claude-code'), primary: byId['claude-code'], dir: '/elsewhere/orch', project: '/proj' });
  assert.match(outside.find((f) => f.rel === 'CLAUDE.snippet.md').content, /`\/elsewhere\/orch\/ORCHESTRATOR\.md`/, 'a dir outside the project renders an absolute path');
  assert.match(outside.find((f) => f.rel === 'vm/box-CLAUDE.md').content, /\/elsewhere\/orch\/ROUTING\.md/);
  const readme = p.find((f) => f.rel === 'README.md').content;
  assert.match(readme, /cli-run\.log\.jsonl/, 'uninstall must name the log outside the folder');
  assert.match(readme, /\/proj\/\.claude\/agents/);
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
  const compose = p.find((f) => f.rel === 'vm/docker-compose.yml').content;
  assert.doesNotMatch(compose, /:latest|main-latest/);
  assert.match(compose, /litellm:v\d+\.\d+\.\d+/);
  assert.match(compose, /ollama\/ollama:\d+\.\d+\.\d+/);
  const sh = p.find((f) => f.rel === 'vm/setup-vm.sh').content;
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
  const builder = p.find((f) => f.rel === '.agents/agents/builder.md').content;
  assert.match(builder, /commandExecutionPolicy: auto/);
  assert.match(p.find((f) => f.rel === '.agents/agents/code-reviewer.md').content, /commandExecutionPolicy: off/);
});


// ---- audit issues #2, #3, #10: the generated weekly audit, executed ----
function renderAudit(lane, dir) {
  const files = planFiles({ level: 3, selected: sel(lane), primary: byId[lane === 'hermes' ? 'codex' : lane], dir, project: dir });
  return { sh: files.find((f) => f.rel === 'vm/jobs/weekly-audit.sh').content, svc: files.find((f) => f.rel === 'vm/jobs/weekly-audit.service').content };
}
function stubTree(d, entries) {
  const bin = join(d, 'bin');
  mkdirSync(bin, { recursive: true });
  for (const [name, body] of Object.entries(entries)) writeFileSync(join(bin, name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
  return bin;
}

test('#2: the codex audit passes --audit and the script states the boundary; other lanes state that none is enforced', () => {
  const { sh } = renderAudit('codex', '/x');
  assert.match(sh, /AUDIT_LANE_FLAGS="--audit"/);
  assert.match(sh, /cli-run\.mjs "\$AUDIT_LANE" \$AUDIT_LANE_FLAGS --brief/);
  assert.match(sh, /read-only filesystem sandbox/);
  const files = planFiles({ level: 3, selected: sel('codex', 'hermes'), primary: byId.codex, dir: '/x', project: '/x' });
  const hermes = files.find((f) => f.rel === 'vm/jobs/weekly-audit.sh').content;
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
  const r = spawnSync('bash', [script], { encoding: 'utf8', env: { PATH: `${stubs}:/usr/bin:/bin`, HOME: d } });
  assert.equal(r.status, 13, r.stdout + r.stderr);
  assert.equal(readFileSync(report, 'utf8'), 'previous successful report\n', 'the previous report was truncated');
  const failed = readdirSync(join(d, 'reports')).filter((f) => f.startsWith('failed-audit-') && f.endsWith('-rc13.md'));
  assert.equal(failed.length, 1, 'failed output must be kept for diagnosis');
  assert.match(r.stderr, /previous report kept/);
  // a clean run replaces it
  const ok = stubTree(join(d, 'stubs2'), { node: 'echo fresh report', codex: 'echo codex 1.0', jq: 'cat >/dev/null; echo', curl: 'exit 7' });
  const r2 = spawnSync('bash', [script], { encoding: 'utf8', env: { PATH: `${ok}:/usr/bin:/bin`, HOME: d } });
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(readFileSync(report, 'utf8'), 'fresh report\n');
  rmSync(d, { recursive: true, force: true });
});

test('#10: a hanging --version probe and a hanging gateway are cut off by the watchdog, and the unit has a whole-job deadline', () => {
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
  const r = spawnSync('bash', [script], { encoding: 'utf8', env: { PATH: `${stubs}:/usr/bin:/bin`, HOME: d, PROBE_SECS: '1', GATEWAY_MASTER_KEY: 'abc123' }, timeout: 20000 });
  const secs = (Date.now() - t0) / 1000;
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(secs < 12, `collection was not bounded: ${secs}s`);
  const live = readFileSync(join(d, 'reports', 'live-state.md'), 'utf8');
  assert.match(live, /UNVERIFIED: --version timed out/);
  assert.match(live, /UNVERIFIED: gateway unreachable or timed out/);
  rmSync(d, { recursive: true, force: true });
});
