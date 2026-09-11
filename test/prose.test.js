// House rule: no em dashes (U+2014) in anything this repo ships or shows. Checked here so the
// rule is enforced rather than requested in CONTRIBUTING.md. Walks the tree without git so the
// check works in a tarball checkout too; skips .git, node_modules and the dry-run scratch folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
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
