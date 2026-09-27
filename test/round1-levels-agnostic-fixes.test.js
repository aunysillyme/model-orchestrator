// Regression tests for ROUND 1 (levels + stack-agnostic diff, aa96eb9..0230a07)
// FIX dispositions: H1, K1, C1-C5. See AUDIT_BRIEF.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { planFiles } from '../src/install.js';
import { AIS, byId, agentCandidates } from '../src/catalog.js';
import { legacyPrimary } from '../bin/cli.js';

const CLI = resolve('bin/cli.js');
const run = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 20000, ...opts });
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), 'mo-fix-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function installed(ids, primary = ids[0], level = 2) {
  return planFiles({ level, selected: ids.map(id => byId[id]), primary: byId[primary], dir: '/tmp/mo-fix-unit/ai', project: '/tmp/mo-fix-unit' });
}
function content(files, rel) { return files.find(f => f.rel.replaceAll('\\', '/') === rel)?.content || ''; }

// H1: an invalid answer inside the interactive edit screen must re-ask the
// same field, never exit. RED on 0230a07: `printf 'e\n3\n99\n'` printed
// "--primary must be one of: ..." and exited 2.
test('H1: a typo in the edit screen re-asks the field and the run still completes', t => {
  const dir = temp(t);
  const project = join(dir, 'proj');
  const r = run(['--dir', join(dir, 'ai'), '--project', project, '--ais', 'claude-code,codex'], {
    input: 'e\n3\n99\n1\ny\n'
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Pick 1-2\./, 'the out-of-range answer gets a one-line error, not a hard exit');
  assert.match(r.stdout, /Wrote \d+ file\(s\)/, 'the session recovers and writes files instead of dying on the typo');
});

test('H1: stdin EOF still exits 2 cleanly and writes nothing (unchanged behaviour)', t => {
  const dir = temp(t);
  const aiDir = join(dir, 'ai');
  const r = run(['--dir', aiDir, '--project', join(dir, 'proj'), '--ais', 'claude-code,codex'], {
    input: 'e\n3\n99\n' // ends before answering the re-asked question
  });
  assert.equal(r.status, 2);
  assert.match(r.stdout + r.stderr, /input ended before the question was answered/);
  assert.equal(existsSync(aiDir), false, 'nothing should be written after an EOF abort');
});

// K1: --yes with no --primary must match 0.1.35's choice (git show
// 20408a8:bin/cli.js), not the new inferPrimary ranking. RED on 0230a07:
// the Codex report found 48 subsets where the two rules disagree.
test('K1: legacyPrimary matches 0.1.35 (claude-code, else agentDefinitions, else first) for every catalog-order subset', () => {
  for (let mask = 0; mask < 2 ** AIS.length; mask++) {
    const candidates = agentCandidates(AIS.filter((_, index) => mask & (1 << index)));
    const expected = candidates.length
      ? candidates.find((ai) => ai.id === 'claude-code') || candidates.find((ai) => ai.facts.agentDefinitions) || candidates[0]
      : null;
    assert.equal(legacyPrimary(candidates), expected);
  }
});

test('K1: --yes with no --primary wires legacyPrimary, not the interactive inferPrimary ranking', () => {
  // grok,qwen is one of the subsets where the two rules disagree (grok
  // beats qwen under 0.1.35; qwen wins the new capability ranking).
  const r = run(['--yes', '--level', '2', '--ais', 'grok,qwen', '--dry']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /primary\s+grok\b/, '--yes must keep the 0.1.35 choice (grok), not the new ranking (qwen)');
});

// C1: the Qwen safe-mode sentence renders only when Qwen is selected.
test('C1: CLI-RUN.md mentions Qwen\'s safe mode only when Qwen is selected', () => {
  const withQwen = content(installed(['codex', 'qwen'], 'codex'), 'CLI-RUN.md');
  assert.match(withQwen, /Qwen's safe mode/);
  const withoutQwen = content(installed(['codex', 'grok'], 'codex'), 'CLI-RUN.md');
  assert.doesNotMatch(withoutQwen, /Qwen's safe mode/);
});

// C2: TIERS.md's Role column names the role before an external command, and
// no two rows can render an identical label even when they share a lane.
test('C2: TIERS.md role column names the role before a shared external command', () => {
  const tiers = content(installed(['codex', 'grok'], 'codex'), 'TIERS.md');
  const bareRows = tiers.match(/^\| `cli-run grok`/gm) || [];
  assert.equal(bareRows.length, 0, 'no row should show the bare command with no role name');
  const rows = tiers.split('\n').filter((line) => line.includes('cli-run grok'));
  assert.ok(rows.length >= 2, 'this stack should still send more than one role to grok');
  assert.equal(new Set(rows).size, rows.length, 'no two rows may render an identical label');
});

// C3: the review-fallback text states the self-check once and never ends
// "...with a trailing '. with appropriate effort.'" glued onto a full stop.
test('C3: ROUTING.md review fallback has no doubled self-check or dangling ". with appropriate effort."', () => {
  const routing = content(installed(['claude-code'], 'claude-code'), 'ROUTING.md');
  assert.doesNotMatch(routing, /\. with appropriate effort/);
  const reviewLine = routing.split('\n').find((line) => line.startsWith('3. **Review code without changing it:**'));
  assert.ok(reviewLine, 'the review line should exist in the decision tree');
  const selfCheckMentions = (reviewLine.match(/self-check/g) || []).length;
  assert.equal(selfCheckMentions, 1, `expected exactly one "self-check" mention on the review line, got ${selfCheckMentions}: ${reviewLine}`);
});

// C4: level-1 decision-tree rules are numbered sequentially, no duplicates.
test('C4: ORCHESTRATOR.md numbers its decision tree 1-8 with no repeat', () => {
  const orchestrator = content(installed(['claude-app'], 'claude-app', 1), 'ORCHESTRATOR.md');
  const numbers = [...orchestrator.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
  assert.deepEqual(numbers, [1, 2, 3, 4, 5, 6, 7, 8]);
});

// C5: "Full assignments: ..." is its own paragraph, not glued onto the gaps
// sentence.
test('C5: STACK_SUMMARY puts "Full assignments" in its own paragraph', () => {
  const orchestrator = content(installed(['claude-app'], 'claude-app', 1), 'ORCHESTRATOR.md');
  assert.doesNotMatch(orchestrator, /lane here\. Full assignments/);
  assert.match(orchestrator, /\n\nFull assignments: \[README\.md\]/);
});
