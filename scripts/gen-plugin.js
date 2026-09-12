#!/usr/bin/env node
// Regenerates the Claude Code plugin bundle under plugin/ from the installer's
// templates (src/plugin.js has the plan). The test suite checks the committed
// bundle matches, so an agent or hook edited in templates/ cannot ship to npm
// users and silently not to plugin users.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { planPluginFiles, PLUGIN_DIR } from '../src/plugin.js';

const files = planPluginFiles();
for (const f of files) {
  const abs = join(PLUGIN_DIR, ...f.rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, f.content);
}
console.log('plugin/ regenerated: ' + files.length + ' files');
