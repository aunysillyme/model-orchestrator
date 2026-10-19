#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = 'Usage: node scripts/check-set.mjs [--root <dir>]';
const fix = 'run npx repo-build-skill@0.1.1 set sync (maintainer-run, outside CI)';
const renderer = '.repo-build/render-set.mjs';
const vendored = '.repo-build/set.json';

try {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--root' || !args[1] || args[1].startsWith('--'))) {
    throw Error(usage);
  }
  const root = args.length ? resolve(args[1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const files = new Map();
  for (const file of [renderer, vendored, '.repo-build/set.lock.json', 'package.json', 'README.md', 'llms.txt']) {
    files.set(file, readFileSync(join(root, file)));
  }
  const lock = JSON.parse(files.get('.repo-build/set.lock.json').toString('utf8'));
  for (const key of ['renderer_sha256', 'vendored_sha256']) {
    if (typeof lock[key] !== 'string' || !/^[a-f0-9]{64}$/.test(lock[key])) throw Error(`Invalid set.lock.json: ${key}`);
  }
  const drift = [];
  for (const [file, key] of [[renderer, 'renderer_sha256'], [vendored, 'vendored_sha256']]) {
    if (createHash('sha256').update(files.get(file)).digest('hex') !== lock[key]) drift.push(file);
  }
  // Check the pinned inputs before loading renderer code or parsing set data.
  if (!drift.length) {
    const moduleUrl = new URL('../.repo-build/render-set.mjs', import.meta.url).href;
    const { renderSet } = await import(moduleUrl);
    drift.push(...renderSet({ root, check: true }).changed);
  }
  if (drift.length) {
    for (const file of drift) console.error(`SET_DRIFT: ${file}: ${fix}`);
    process.exitCode = 1;
  } else {
    console.log('Set blocks and pinned hashes match.');
  }
} catch (error) {
  console.error(`SET_CHECK: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}
