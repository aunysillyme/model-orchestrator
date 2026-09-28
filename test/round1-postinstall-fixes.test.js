// Regression tests for ROUND 1 (post-install automation, ba597c6..7e648fe)
// FIX dispositions: R1, R2, Q1-Q9, T1. See AUDIT_BRIEF.md.
//
// Every test here fails against `git worktree add <tmp> 7e648fe` (the diff
// this round audited): R1/R2/Q1's catalog trust field/Q2/Q3/Q5/Q6/Q9 did not
// exist there at all, and Q4/Q7/Q8 describe behaviour this repo's follow-up
// pass still had wrong. T1's fix is a threshold change to an existing test
// (test/route-metrics.test.js), not a new one; see the note at the bottom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { byId, toolById } from '../src/catalog.js';
import { planFiles, ACTIVATION_JSON_BYTE_CAP, activationSteps } from '../src/install.js';
import { planSnippetApplication, START } from '../src/apply-snippets.js';
import { planCompanionApplication } from '../src/apply-companions.js';
import { signInStatus } from '../src/postinstall.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mo-r1pi-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// R1: a pre-existing MCP config (apply-companions) or settings.json
// (apply-snippets) larger than the 10 MB cap is refused before it is read,
// the same way invalid JSON is refused, and nothing is written.
test('R1: an oversized pre-existing JSON file is refused before any write, in both apply-companions and apply-snippets', (t) => {
  const oversized = Buffer.alloc(ACTIVATION_JSON_BYTE_CAP + 1, 0x20);

  const companionsProject = tempDir(t);
  const primary = byId['claude-code'];
  const companionOpts = { level: 2, selected: [primary], primary, tools: [toolById.context7], project: companionsProject, dir: join(companionsProject, 'ai') };
  const companionFiles = planFiles(companionOpts);
  const mcpPath = join(companionsProject, '.mcp.json');
  writeFileSync(mcpPath, oversized);
  assert.throws(() => planCompanionApplication({ ...companionOpts, files: companionFiles }), /larger than the \d+ byte \(10 MB\) cap/);
  assert.equal(statSync(mcpPath).size, oversized.length, 'apply-companions: the oversized file must be left untouched');

  const snippetsProject = tempDir(t);
  mkdirSync(join(snippetsProject, '.claude'), { recursive: true });
  const snippetOpts = { level: 2, selected: [primary], primary, project: snippetsProject, dir: join(snippetsProject, 'ai'), tools: [] };
  const snippetFiles = planFiles(snippetOpts);
  const settingsPath = join(snippetsProject, '.claude', 'settings.json');
  writeFileSync(settingsPath, oversized);
  assert.throws(() => planSnippetApplication({ primary, project: snippetsProject, files: snippetFiles }), /larger than the \d+ byte \(10 MB\) cap/);
  assert.equal(statSync(settingsPath).size, oversized.length, 'apply-snippets: the oversized file must be left untouched');
});

// R2: the marked block this run inserts or replaces matches the file's own
// line ending, so a CRLF file stays CRLF end to end.
test('R2: an inserted marked block matches a CRLF file\'s own line ending', (t) => {
  const project = tempDir(t);
  const rulesPath = join(project, 'CLAUDE.md');
  writeFileSync(rulesPath, 'existing rules\r\n');
  const primary = byId['claude-code'];
  const opts = { level: 2, selected: [primary], primary, project, dir: join(project, 'ai'), tools: [] };
  const files = planFiles(opts);
  const entries = planSnippetApplication({ primary, project, files });
  const content = entries.find((f) => f.rel === primary.rulesFile).content.toString();
  assert.ok(content.includes(START + '\r\n'), 'the block start must be followed by the file\'s own CRLF');
  assert.doesNotMatch(content, /[^\r]\n/, 'no bare LF should appear anywhere once the whole file is CRLF');
});

// Q1: `trust: 'positive-only'` on claude-code's authStatus means a failure,
// non-zero exit, unparsable stdout, a parsed false or a missing binary all
// stay unknown; only a parsed `loggedIn: true` counts as signed in. Codex has
// no `trust` field and keeps its old exit-code-only behaviour.
test('Q1: claude-code (positive-only trust) never reports a definite sign-out; codex is unchanged', () => {
  const claudeCode = byId['claude-code'];

  // RED case, captured 2026-09-27: a working, signed-in session still printed
  // {"loggedIn":false} with exit 1.
  const redCase = signInStatus([claudeCode], { detect: () => '/fake/claude', spawn: () => ({ status: 1, stdout: '{"loggedIn":false}', stderr: '' }) });
  assert.equal(redCase['claude-code'], null, 'a reported failure must read as unknown, never a confirmed sign-out');

  const positive = signInStatus([claudeCode], { detect: () => '/fake/claude', spawn: () => ({ status: 0, stdout: '{"loggedIn":true}', stderr: '' }) });
  assert.equal(positive['claude-code'], true, 'a parsed loggedIn:true is the only path to a confirmed sign-in');

  for (const [label, result] of [
    ['unparsable stdout', { status: 0, stdout: 'Logged in using ChatGPT', stderr: '' }],
    ['exit code with no field', { status: 1, stdout: '', stderr: 'boom' }],
    ['timeout (spawn error)', { status: null, error: new Error('ETIMEDOUT') }],
    ['parsed false', { status: 0, stdout: '{"loggedIn":false}', stderr: '' }]
  ]) {
    const statuses = signInStatus([claudeCode], { detect: () => '/fake/claude', spawn: () => result });
    assert.equal(statuses['claude-code'], null, label);
  }
  const missingBinary = signInStatus([claudeCode], { detect: () => null, spawn: () => assert.fail('must not spawn when the binary is missing') });
  assert.equal(missingBinary['claude-code'], null, 'a missing binary must also read as unknown for positive-only trust');

  // The conditional step survives the RED case; it is never rewritten as a
  // confident "you are not signed in".
  const steps = activationSteps({ selected: [claudeCode], primary: claudeCode, applySnippets: true, authStatuses: redCase });
  const step = steps.find((s) => s.includes(claudeCode.auth));
  assert.match(step, /if you have not signed in yet:/);
  assert.doesNotMatch(step, /^sign in to/);

  // codex keeps its existing reliable behaviour: an exit 1 is a confirmed sign-out.
  const codex = byId.codex;
  const codexStatuses = signInStatus([codex], { detect: () => '/fake/codex', spawn: () => ({ status: 1, stdout: '', stderr: '' }) });
  assert.equal(codexStatuses.codex, false);
});

// Q2/Q6: a local runtime already on PATH gets no install instruction (the
// installer never installs another tool once it is already there), and the
// step for an undetected runtime names the configured model, not a
// "<model>" placeholder that breaks when pasted.
test('Q2/Q6: a detected local runtime skips the install step; an undetected one names the real model', () => {
  const ollama = byId.ollama;
  const claudeCode = byId['claude-code'];
  const base = { level: 2, selected: [claudeCode, ollama], primary: claudeCode, dir: '/tmp/mo-r1pi-dir', project: '/tmp/mo-r1pi-project', tools: [] };

  const undetected = activationSteps(base);
  const step = undetected.find((s) => s.includes(ollama.name));
  assert.ok(step, 'an undetected runtime must still get an install step');
  assert.doesNotMatch(step, /<model>/, 'Q6: the placeholder must never appear');
  assert.ok(step.includes(ollama.gatewayModel.replace(/^ollama\//, '')), 'Q6: the step must name the actual configured model');

  const detected = activationSteps({ ...base, detected: new Set([claudeCode.id, ollama.id]) });
  assert.ok(!detected.some((s) => s.includes(ollama.name)), 'Q2: a runtime already on PATH must get no install step');
});

// Q3/Q5: a CLI main agent with no cataloged project rules file (Grok,
// Hermes) is not a chat app; it gets its own accurate load-the-block
// wording, never "custom instructions" or "paste".
test('Q3/Q5: a CLI with no rules file gets CLI-appropriate wording, never chat-app phrasing', () => {
  for (const id of ['grok', 'hermes']) {
    const ai = byId[id];
    const steps = activationSteps({ selected: [ai], primary: ai, applySnippets: true, dir: '/tmp/mo-r1pi-dir', project: '/tmp/mo-r1pi-project' });
    const step = steps.find((s) => s.startsWith(ai.name + ' has no cataloged project rules file'));
    assert.ok(step, id + ': missing the CLI-appropriate load step');
    assert.doesNotMatch(step, /custom instructions|paste the block/i, id + ': must not describe a CLI as a chat app');
    assert.match(step, /load the block/, id);

    const readme = planFiles({ level: 2, selected: [ai], primary: ai, project: '/tmp/mo-r1pi-project', dir: '/tmp/mo-r1pi-dir', tools: [], applySnippets: false })
      .find((f) => f.rel === 'README.md').content;
    assert.match(readme, /has no cataloged project rules file, so this install wrote nothing to a project folder/, id + ' README');
  }
});

// Q4: the plan summary's "activation automatic/manual" line must reflect
// what actually gets applied. Grok has no rules file, so --apply-snippets
// can never make its activation automatic.
test('Q4: the summary never claims "automatic" activation for a primary nothing can be applied to', () => {
  const r = spawnSync(process.execPath, [CLI, '--yes', '--level', '1', '--ais', 'grok', '--primary', 'grok', '--apply-snippets', '--dry'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /activation manual/);
  assert.doesNotMatch(r.stdout, /activation automatic/);
});

// Q7: README "After you install" documents the CLI-with-no-rules-file case,
// not only the rules-file and chat-app cases.
test('Q7: README "After you install" documents a CLI with no cataloged rules file', () => {
  const readme = readFileSync(fileURLToPath(new URL('../README.md', import.meta.url)), 'utf8');
  const section = readme.split('## After you install')[1].split('\n## ')[0];
  assert.match(section, /no cataloged project rules file/);
});

// Q8: covered by updated existing tests rather than a new one, since the
// same assertions already existed and only needed the new expected wording:
// test/apply-snippets.test.js "create missing rules and settings..." and
// test/postinstall.test.js "postinstall P1: ...". Both asserted `/update
// .*CLAUDE\.md.*marked block.*backup/` before this round; a rules file that
// does not exist yet now prints `create ... (new file, marked block)`.
test('Q8: a brand-new rules file is labelled "create", never "update ... backup kept"', (t) => {
  const project = tempDir(t);
  const r = spawnSync(process.execPath, [CLI, '--yes', '--level', '2', '--ais', 'claude-code', '--apply-snippets', '--project', project, '--dir', join(project, 'ai')], { encoding: 'utf8', timeout: 15000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /create .*CLAUDE\.md \(new file, marked block/);
  assert.doesNotMatch(r.stdout, /update .*CLAUDE\.md.*backup kept/);
});

// Q9: the generated README under --no-apply (or --yes without
// --apply-snippets) still states the hook merge step for Claude Code, the
// same one --apply-snippets would have performed automatically.
test('Q9: generated README under manual activation also states the hook merge step', () => {
  const primary = byId['claude-code'];
  const files = planFiles({ level: 2, selected: [primary], primary, project: '/tmp/mo-r1pi-project', dir: '/tmp/mo-r1pi-dir', tools: [], applySnippets: false });
  const readme = files.find((f) => f.rel === 'README.md').content;
  assert.match(readme, /settings\.hooks\.snippet\.json/);
  assert.match(readme, /route-gate, subagent-context and route-metrics hooks/);
});

// T1: no new test. The fix is a threshold change to the existing test
// `route-metrics.mjs: an open, never-closed stdin pipe still exits within 5s
// with empty stdout` in test/route-metrics.test.js (was 1.5s; RED evidence:
// 1666ms observed under full-suite load, 16/16 passing alone at the old
// threshold). See AUDIT_BRIEF.md's T1 row.
