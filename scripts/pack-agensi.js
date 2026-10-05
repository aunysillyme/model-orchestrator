#!/usr/bin/env node
// Zip the current generated sources, with one named pack directory at each root.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, AGENSI_DIR, PACK_NAMES, AGENSI_VERSION } from '../src/agensi.js';

const generated = spawnSync(process.execPath, [join(ROOT, 'scripts/gen-agensi.js')], { stdio: 'inherit' });
if (generated.error || generated.status !== 0) {
  console.error(generated.error?.message || 'Agensi generation failed');
  process.exit(generated.status || 1);
}
const output = join(ROOT, 'dist/agensi');
mkdirSync(output, { recursive: true });
for (const pack of PACK_NAMES) {
  const archive = join(output, `${pack}-${AGENSI_VERSION}.zip`);
  // Remove the previous archive so deleted source files cannot survive zip's update mode.
  rmSync(archive, { force: true });
  const result = spawnSync('zip', ['-q', '-r', archive, pack], { cwd: AGENSI_DIR, encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    rmSync(archive, { force: true });
    console.error(result.error?.message || result.stderr || 'zip failed');
    process.exit(result.status || 1);
  }
  console.log('Packed ' + archive);
}
