#!/usr/bin/env node
// Regenerates docs/catalog.md from src/catalog.js. The test suite checks they agree.
import { writeFileSync } from 'node:fs';
import { AIS, LEVELS, TOOLS, npmSpec } from '../src/catalog.js';
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
    if (a.note) md += `- **Note:** ${a.note}\n`;
    md += '\n';
  }
  md += '## Companion tools\n\n';
  for (const t of TOOLS) {
    md += `### \`${t.id}\` · ${t.name}\n\n- **Repo:** ${t.repo}\n- **Gives:** ${t.role}\n- **Install:** \`${t.install}\` (needs ${t.requires})\n- **Registers itself with:** ${t.autoClients.join(', ')}; snippets for the rest are written to \`mcp/\`\n- **Default:** ${t.recommended ? 'selected' : 'not selected'}\n\n`;
  }
  return md;
}

if (process.argv[1] && process.argv[1].endsWith('gen-catalog.js')) {
  writeFileSync(new URL('../docs/catalog.md', import.meta.url), catalogMarkdown());
  console.log('docs/catalog.md regenerated');
}
