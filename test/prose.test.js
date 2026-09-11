// House rule: no em dashes (U+2014) in anything this repo ships or shows. Checked here so the
// rule is enforced rather than requested in CONTRIBUTING.md. Walks the tree without git so the
// check works in a tarball checkout too; skips .git, node_modules and the dry-run scratch folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const EM = '\u2014';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['.git', 'node_modules', 'tmp-dry-run']);
const TEXT = new Set(['.md', '.js', '.mjs', '.json', '.yml', '.yaml', '.sh', '.toml', '.service', '.timer', '']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (TEXT.has(extname(name))) yield p;
  }
}

test('no em dash in any text file', () => {
  const hits = [];
  for (const p of walk(ROOT)) {
    const lines = readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => { if (l.includes(EM)) hits.push(`${p.slice(ROOT.length + 1)}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], `em dash found at: ${hits.join(', ')}`);
});

test('the check can go red', () => {
  assert.ok(('a ' + EM + ' b').includes(EM));
});

// House rule: no fixed test count in prose. AGENTS.md, CONTRIBUTING.md and CLAUDE.md each
// pinned a number ("132 cases at the time of writing", "123 cases") that drifted out of date
// the moment a test was added or removed; AGENTS.md already carried the fix ("the suite prints
// the current number"). Scoped to top-level .md files, the ones read as contributor-facing
// instructions; docs/audit-brief.md is an explicitly historical document and CHANGELOG.md
// records counts as of the release they describe, so neither is checked here.
const CASE_COUNT = /\b\d+\s+(?:node --test )?cases\b/i;

test('no top-level .md states a fixed test count', () => {
  const hits = [];
  for (const name of readdirSync(ROOT)) {
    if (!name.endsWith('.md')) continue;
    const p = join(ROOT, name);
    if (statSync(p).isDirectory()) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => { if (CASE_COUNT.test(l)) hits.push(`${name}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], `fixed test count found at: ${hits.join(', ')}; say "the suite prints the current number" instead`);
});

test('the fixed-test-count check can go red', () => {
  assert.ok(CASE_COUNT.test('132 cases at the time of writing'));
  assert.ok(CASE_COUNT.test('node --test: 123 cases, no network'));
});

// House rule: plain-language user-facing text (0.1.17). "risk", "attack lane", "adversarial",
// "blast radius", "fail closed" and "threat model" read as alarming to someone deciding whether
// to try the tool; no rule any of them described changed, only the wording (CHANGELOG.md
// [Unreleased] has the swap table). Scoped to the purely-prose, user-facing surface: docs/
// (minus audit-brief.md, written for security reviewers, where this vocabulary is expected) and
// templates/ (everything the installer writes for end users), plus README.md, llms.txt,
// CONTRIBUTING.md and the PR template. Excluded by name rather than walked: AGENTS.md mixes the
// in-scope "Using this package from an agent" section with an out-of-scope section that still
// says "threat model"; bin/cli.js, bin/cli-run.mjs, src/catalog.js and src/install.js mix
// in-scope user-visible strings with out-of-scope code identifiers and code-only comments (the
// `ATTACK_LANE` render var, a "fail closed" comment in bin/cli-run.mjs) that a text scan cannot
// tell apart from prose; SECURITY.md, docs/audit-brief.md and CHANGELOG.md use this vocabulary
// in its ordinary, expected sense. Those five files were checked and fixed by hand instead of by
// this test.
const ALARM_WORDS = /\b(risks?|high-risk|attack lane|adversarial|blast radius|fails?\s+closed|threat model)\b/i;

function inAlarmScope(p) {
  const rel = p.slice(ROOT.length + 1);
  if (rel.startsWith('docs' + sep)) return rel !== join('docs', 'audit-brief.md');
  if (rel.startsWith('templates' + sep)) return true;
  return false;
}

function alarmFiles() {
  const files = [
    join(ROOT, 'README.md'),
    join(ROOT, 'llms.txt'),
    join(ROOT, 'CONTRIBUTING.md'),
    join(ROOT, '.github', 'pull_request_template.md')
  ];
  for (const p of walk(ROOT)) {
    if (inAlarmScope(p)) files.push(p);
  }
  return files;
}

test('no alarming security wording in user-facing text', () => {
  const hits = [];
  for (const p of alarmFiles()) {
    const lines = readFileSync(p, 'utf8').split('\n');
    lines.forEach((l, i) => { if (ALARM_WORDS.test(l)) hits.push(`${p.slice(ROOT.length + 1)}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], `alarming wording found at: ${hits.join(', ')}`);
});

test('the alarming-wording check can go red', () => {
  assert.ok(ALARM_WORDS.test('a security-shaped diff goes to the attack lane'));
  assert.ok(ALARM_WORDS.test('second coder and adversarial auditor'));
  assert.ok(ALARM_WORDS.test('map the blast radius yourself'));
  assert.ok(ALARM_WORDS.test('a missing or erroring scanner: fail closed'));
  assert.ok(ALARM_WORDS.test('the threat model and what has already been attacked'));
  assert.ok(ALARM_WORDS.test('a named risk and a named flaw'));
  assert.ok(ALARM_WORDS.test('high-risk commands stay gated'));
});
