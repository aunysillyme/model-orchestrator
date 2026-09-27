#!/usr/bin/env node
// Regenerates the Claude Code plugin bundle under plugin/ from the installer's
// templates (src/plugin.js has the plan). The test suite checks the committed
// bundle matches, so an agent or hook edited in templates/ cannot ship to npm
// users and silently not to plugin users.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { planPluginFiles, marketplaceManifest, PLUGIN_DIR, ROOT } from '../src/plugin.js';

const files = planPluginFiles();
for (const f of files) {
  const abs = join(PLUGIN_DIR, ...f.rel.split('/'));
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, f.content);
}
writeFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), JSON.stringify(marketplaceManifest(), null, 2) + '\n');
console.log('plugin/ regenerated: ' + files.length + ' files');
