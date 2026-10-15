#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const limit = 160;
let checked = 0;
let failures = 0;

function check(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) check(path);
    else if (entry.isFile() && /\.(?:js|mjs)$/.test(entry.name)) {
      checked++;
      readFileSync(path, 'utf8').split(/\r?\n/).forEach((line, index) => {
        if (line.length <= limit) return;
        console.error(`${relative(root, path)}:${index + 1}: ${line.length} characters (maximum ${limit})`);
        failures++;
      });
    }
  }
}

for (const folder of ['bin', 'src', 'templates', 'scripts']) check(join(root, folder));
console.log(`Line check: ${checked} files, ${failures} over-limit lines (maximum ${limit}).`);
if (failures) process.exitCode = 1;
