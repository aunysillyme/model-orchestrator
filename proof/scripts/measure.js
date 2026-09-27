import { writeFileSync } from 'node:fs';
import { measureInstall } from './install-time.js';
import { measureRunner } from './runner-overhead.js';
import { measureMissingResults } from './missing-results.js';
import { measureGate } from './check-gate.js';
import { readResults, RESULTS } from './lib.js';
import { renderPage } from './render.js';

// Run serially: overlapping timing samples would measure this harness competing with itself.
const entries = [measureInstall(), measureRunner(), measureMissingResults(), measureGate()];
let author = [];
try { author = readResults().entries.filter(e => e.kind === 'author-setup'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
writeFileSync(RESULTS, JSON.stringify({ schemaVersion: 1, environment: { node: process.version, platform: process.platform, arch: process.arch }, entries: [...entries, ...author] }, null, 2) + '\n');
renderPage();
for (const item of entries) console.log(`${item.id}: ${item.value} ${item.unit}; n=${item.sampleSize}; measured ${item.measuredAt}; expires ${item.expiresAt}`);
