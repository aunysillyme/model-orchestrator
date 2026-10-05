#!/usr/bin/env node
// Regenerate only the two owned packs. Plan first, so render errors preserve them.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AGENSI_DIR, PACK_NAMES, planAgensiFiles } from '../src/agensi.js';

const files = planAgensiFiles();
for (const pack of PACK_NAMES) rmSync(join(AGENSI_DIR, pack), { recursive: true, force: true });
for (const { rel, content } of files) {
  const path = join(AGENSI_DIR, ...rel.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
console.log('agensi/ regenerated: ' + files.length + ' files');
