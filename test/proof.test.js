import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_MODELS } from '../src/catalog.js';
import { readResults, ROOT, validateResults } from '../proof/scripts/lib.js';
import { proofMarkdown } from '../proof/scripts/render.js';

test('proof/results.json has complete current measurements and runnable source paths', () => {
  const data = readResults();
  assert.deepEqual(validateResults(data), []);
  for (const item of data.entries) assert.ok(existsSync(join(ROOT, item.script)), item.script);
});

test('proof expiry check can go red without relying on the wall clock', () => {
  const data = readResults();
  assert.ok(validateResults(data, new Date('9999-01-01')).some(e => e.includes('expired')));
  const broken = structuredClone(data);
  broken.entries[0].expiresAt = '2000-01-01';
  assert.ok(validateResults(broken).some(e => e.includes('expired')));
  broken.entries[0].measuredAt = '9999-01-01';
  assert.ok(validateResults(broken).some(e => e.includes('future')));
  broken.entries[0].sampleSize = 0;
  assert.ok(validateResults(broken).some(e => e.includes('sample size')));
});

test('proof page is generated from results.json with dates beside every figure', () => {
  assert.equal(readFileSync(join(ROOT, 'proof', 'README.md'), 'utf8'), proofMarkdown(readResults()));
});

test('catalog model snapshot is dated and has not expired', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.match(CATALOG_MODELS.measuredAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(CATALOG_MODELS.expiresAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(CATALOG_MODELS.measuredAt <= today);
  assert.ok(CATALOG_MODELS.expiresAt >= today, 'Verify the provider model catalog and refresh its dated snapshot');
  assert.ok(CATALOG_MODELS.expiresAt >= CATALOG_MODELS.measuredAt);
});

test('proof fixtures include passing controls and assert exact failure codes', async () => {
  const { measureMissingResults } = await import('../proof/scripts/missing-results.js');
  const { measureGate } = await import('../proof/scripts/check-gate.js');
  for (const measure of [measureMissingResults, measureGate]) {
    const result = measure();
    assert.equal(result.value, result.sampleSize);
  }
});
