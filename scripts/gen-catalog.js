#!/usr/bin/env node
// Regenerates docs/catalog.md and the README's vendor compatibility table from
// src/catalog.js. The test suite checks they agree, so neither can drift (#23).
import { writeFileSync, readFileSync } from 'node:fs';
import { AIS, LEVELS, TOOLS, IMAGES, npmSpec } from '../src/catalog.js';
import { readdirSync } from 'node:fs';

export function protocolCount() {
  return readdirSync(new URL('../templates/common/protocols/', import.meta.url)).filter((f) => f.endsWith('.md') && f !== 'README.md').length;
}

export function catalogMarkdown() {
  let md = '# Catalog\n\nGenerated from `src/catalog.js`. Do not hand-edit; `npm run gen:catalog` rewrites it. Protocols shipped at every level: ' + protocolCount() + ' (counted from `templates/common/protocols/`).\n\n## Levels\n\n| Level | Name | Tagline | Gives |\n|---|---|---|---|\n';
  for (const l of LEVELS) md += `| ${l.id} | ${l.name} | ${l.tagline} | ${l.gives} |\n`;
  md += '\n## AIs\n\n';
  for (const a of AIS) {
    const how = a.install.npm
      ? '`npm install -g ' + npmSpec(a) + '`'
      : a.install.script
        ? 'vendor script (read it first): `' + a.install.script + '`'
        : a.install.url + (a.install.brew ? ' (or `brew install ' + a.install.brew + '`)' : '');
    md += `### \`${a.id}\` · ${a.name}\n\n- **Kind:** ${a.kind} · **Access:** ${a.access} · **Lane:** ${a.lane} · **Level:** ${a.minLevel}+\n- **Wins at:** ${a.role}\n- **Install:** ${how}\n- **Sign in:** ${a.auth}\n`;
    if (a.rulesFile) md += `- **Reads rules from:** \`${a.rulesFile}\`` + (a.agentsDir ? ` · subagents in \`${a.agentsDir}/\`` : '') + '\n';
    if (a.cliRun) md += '- **cli-run lane:** yes\n';
    if (a.builtAgainst) md += `- **Built against:** ${a.builtAgainst}` + (a.install.npm ? ' (the same number the npm pin uses)' : '') + '\n';
    if (a.note) md += `- **Note:** ${a.note}\n`;
    md += '\n';
  }
  md += '## Companion tools\n\n';
  for (const t of TOOLS) {
    md += `### \`${t.id}\` · ${t.name}\n\n- **Repo:** ${t.repo}\n- **Gives:** ${t.role}\n- **Install:** \`${t.install}\` (needs ${t.requires})\n- **Registers itself with:** ${t.autoClients.join(', ')}; snippets for the rest are written to \`mcp/\`\n- **Default:** ${t.recommended ? 'selected' : 'not selected'}\n\n`;
  }
  return md;
}

export const VENDOR_TABLE_START = '<!-- vendor-table:start -->';
export const VENDOR_TABLE_END = '<!-- vendor-table:end -->';

export function fixtureManifest() {
  return JSON.parse(readFileSync(new URL('../test/fixtures/manifest.json', import.meta.url), 'utf8'));
}

// The compatibility table in README.md. Every number comes from `builtAgainst`
// in src/catalog.js, which is also the npm pin where there is one, so "built
// against" and "pinned to" are the same number by construction (#23).
export function vendorTableMarkdown() {
  const fx = fixtureManifest();
  const byLane = Object.fromEntries(fx.fixtures.map((f) => [f.lane, f]));
  let md = VENDOR_TABLE_START + '\n\n| Lane | Vendor | Version this release was built against | Where that number is proved |\n|---|---|---|---|\n';
  for (const a of AIS) {
    if (!a.bin || !a.builtAgainst) continue;
    const proof = byLane[a.id]
      ? '`test/fixtures/' + byLane[a.id].file + '`, a recorded run'
      : a.install.npm
        ? 'the npm pin the installer writes, `' + npmSpec(a) + '`'
        : a.id === 'ollama'
          ? 'the pinned image the level 3 box runs, `' + IMAGES.ollama + '`'
          : "the maintainer's own install";
    md += `| \`${a.bin}\` | ${a.vendor} | ${a.builtAgainst} | ${proof} |\n`;
  }
  md += `\nGenerated from \`src/catalog.js\` by \`npm run gen:catalog\`; \`npm test\` fails if this table and the catalog disagree. Fixtures were captured ${fx.capturedAt}.\n\n` + VENDOR_TABLE_END;
  return md;
}

export function readmeWithVendorTable(current) {
  const a = current.indexOf(VENDOR_TABLE_START);
  const b = current.indexOf(VENDOR_TABLE_END);
  if (a === -1 || b === -1) throw new Error('README.md has no vendor-table markers');
  return current.slice(0, a) + vendorTableMarkdown() + current.slice(b + VENDOR_TABLE_END.length);
}

if (process.argv[1] && process.argv[1].endsWith('gen-catalog.js')) {
  writeFileSync(new URL('../docs/catalog.md', import.meta.url), catalogMarkdown());
  const readmeUrl = new URL('../README.md', import.meta.url);
  writeFileSync(readmeUrl, readmeWithVendorTable(readFileSync(readmeUrl, 'utf8')));
  console.log('docs/catalog.md and the README vendor table regenerated');
}
