// Regression tests for ROUND 1 (1.0.0, release/1.0 @ a56503d) FIX dispositions:
// R1 (project runner must not run without --dir), C-A2 (aunx brief PATH scaffolds),
// C-B1 (RESEARCH_TRIAGE.md renders a well-formed table). See AUDIT_BRIEF.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const AUNX = resolve('bin/aunx.js');
const CLI = resolve('bin/cli.js');
const run = (bin, args, cwd, extra = {}) => spawnSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', timeout: 20000, ...extra });
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'round1-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('R1: aunx cli-run must not run a planted project runner without --dir', t => {
  const cwd = temp(t);
  mkdirSync(join(cwd, 'ai-orchestrator', 'bin'), { recursive: true });
  writeFileSync(join(cwd, 'ai-orchestrator', 'bin', 'cli-run.mjs'), 'console.log("LOCAL-RUNNER-RAN"); process.exit(66);');
  const result = run(AUNX, ['cli-run', 'codex', 'hello'], cwd);
  assert.notEqual(result.status, 66, 'the planted local runner must not have executed without --dir');
  assert.doesNotMatch(result.stdout, /LOCAL-RUNNER-RAN/, 'the packaged runner, not the project one, must run by default');
});

test('R1: aunx cli-run uses the project runner only with an explicit --dir, and names the path on stderr', t => {
  const cwd = temp(t);
  mkdirSync(join(cwd, 'ai-orchestrator', 'bin'), { recursive: true });
  const local = join(cwd, 'ai-orchestrator', 'bin', 'cli-run.mjs');
  writeFileSync(local, 'console.log("LOCAL-RUNNER-RAN"); process.exit(66);');
  const result = run(AUNX, ['cli-run', '--dir', join(cwd, 'ai-orchestrator'), 'codex', 'hello'], cwd);
  assert.equal(result.status, 66);
  assert.match(result.stdout, /LOCAL-RUNNER-RAN/);
  assert.match(result.stderr, new RegExp(escapeRe(local)), 'stderr must name the runner path being used');
});

test('C-A2: aunx brief PATH scaffolds a task brief the same way context/checks do', t => {
  const cwd = temp(t);
  const result = run(AUNX, ['brief', 'TASK_BRIEF.md'], cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(cwd, 'TASK_BRIEF.md'), 'utf8'), readFileSync('templates/common/TASK_BRIEF.md', 'utf8'));
});

test('C-A2: aunx brief new PATH keeps working, and bare aunx brief keeps printing the template', t => {
  const cwd = temp(t);
  assert.equal(run(AUNX, ['brief', 'new', 'TASK_BRIEF.md'], cwd).status, 0);
  const printed = run(AUNX, ['brief'], cwd);
  assert.equal(printed.status, 0);
  assert.equal(printed.stdout, readFileSync('templates/common/TASK_BRIEF.md', 'utf8'));
});

test('C-B1: RESEARCH_TRIAGE.md renders a table where every row has the header column count', t => {
  const cwd = temp(t);
  const dir = join(cwd, 'ai-orchestrator');
  const result = run(CLI, ['--yes', '--level', '2', '--ais', 'claude-code,codex', '--primary', 'claude-code', '--dir', dir, '--project', cwd], cwd);
  assert.equal(result.status, 0, result.stderr);
  const content = readFileSync(join(dir, 'RESEARCH_TRIAGE.md'), 'utf8');
  const lines = content.split('\n');
  const tableStart = lines.findIndex((l) => l.startsWith('| Role |'));
  assert.ok(tableStart !== -1, 'expected the Role table header');
  const headerCells = lines[tableStart].split('|').length;
  for (let i = tableStart + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    assert.equal(lines[i].split('|').length, headerCells, `row has the wrong cell count: ${lines[i]}`);
  }
});
