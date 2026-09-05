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
