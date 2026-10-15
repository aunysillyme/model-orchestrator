#!/usr/bin/env node
// Hook placeholders become JavaScript only after rendering. Lint those bytes too.
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { planPluginFiles } from '../src/plugin.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'lint-templates-'));
let status = 0;
try {
  const config = JSON.parse(readFileSync(join(root, 'biome.json'), 'utf8'));
  delete config.$schema;
  writeFileSync(join(temporary, 'biome.json'), JSON.stringify(config));
  const paths = [];
  for (const file of planPluginFiles().filter(file => file.rel.endsWith('.mjs'))) {
    const path = join(temporary, 'templates', 'agents', 'snippets', file.rel.slice('hooks/'.length).replace('.mjs', '.rendered.mjs'));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, file.content);
    paths.push(relative(temporary, path));
  }
  const result = spawnSync(process.execPath, [
    join(root, 'node_modules', '@biomejs', 'biome', 'bin', 'biome'), 'lint', ...paths
  ], { cwd: temporary, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  status = result.status ?? 1;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
if (status !== 0) process.exitCode = status;
