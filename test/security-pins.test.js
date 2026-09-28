import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sep } from 'node:path';
import { planFiles } from '../src/install.js';
import { byId, TOOLS, toolById } from '../src/catalog.js';
import { catalogMarkdown } from '../scripts/gen-catalog.js';

function companionFiles() {
  return planFiles({ level: 1, selected: [byId.codex], primary: byId.codex, tools: TOOLS });
}

function assertPinnedPackages(text, label) {
  for (const [pattern, spec] of [
    [/codecalc\[full\](?:==[^\s'"`\]]+)?/g, `codecalc[full]==${toolById.codecalc.pin}`],
    [/(?<=["'])obsidian-tc(?:@[^"']+)?(?=["'])/g, `obsidian-tc@${toolById['obsidian-tc'].pin}`],
    [/@upstash\/context7-mcp(?:@[^\s'"`\]]+)?/g, `@upstash/context7-mcp@${toolById.context7.pin}`]
  ]) {
    for (const match of text.matchAll(pattern)) assert.equal(match[0], spec, label);
  }
}

test('companion MCP launch arguments use exact catalog versions in every client format', () => {
  const snippets = companionFiles().filter((f) => f.rel.startsWith(`mcp${sep}`));
  assert.ok(snippets.length >= 10, 'companion snippet inventory was not rendered');
  for (const file of snippets) {
    if (file.rel.endsWith('.json')) {
      const config = JSON.parse(file.content);
      const visit = (value) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value.args)) assertPinnedPackages(JSON.stringify(value.args), file.rel);
        for (const child of Object.values(value)) visit(child);
      };
      visit(config);
    } else {
      // These snippets use JSON-compatible TOML arrays; parse those arrays too.
      for (const match of file.content.matchAll(/^args\s*=\s*(\[.*\])$/gm)) {
        assertPinnedPackages(JSON.stringify(JSON.parse(match[1])), file.rel);
      }
    }
  }
});

test('pin regression detects floating companion commands and a mismatched catalog version', () => {
  for (const command of ['["codecalc[full]"]', '["-y","obsidian-tc"]', '["-y","@upstash/context7-mcp"]', '["codecalc[full]==0.0.0"]']) {
    assert.throws(() => assertPinnedPackages(command, command), assert.AssertionError);
  }
});

test('companion guides keep executable examples pinned to the catalog', () => {
  const files = companionFiles();
  for (const name of ['CODECALC.md', 'OBSIDIAN-TC.md', 'CONTEXT7.md']) {
    const file = files.find((f) => f.rel === name);
    assert.ok(file, name);
    assertPinnedPackages(file.content, name);
    assert.doesNotMatch(file.content, /npx\s+(?:-y\s+)?ctx7(?:\s|`)/, 'ctx7 has no separately verified catalog pin');
  }
});

test('catalog install instructions derive package versions from each companion pin', () => {
  assert.equal(toolById.codecalc.install, `uvx 'codecalc[full]==${toolById.codecalc.pin}' setup --write`);
  assert.equal(toolById['obsidian-tc'].install, `npm install -g obsidian-tc@${toolById['obsidian-tc'].pin} && obsidian-tc /path/to/your/vault`);
  assert.equal(toolById.context7.install, `npx -y @upstash/context7-mcp@${toolById.context7.pin}`);
  assert.deepEqual(toolById.context7.autoClients, []);
  assert.match(catalogMarkdown().split('### `context7`')[1], /Vendor command auto-registration:\*\* none; use project activation or merge the supplied snippets/);
  assert.match(catalogMarkdown(), /Model-orchestrator project activation merges supported MCP entries for selected companions/);
});

test('release uses a reviewed exact npm version with Node 24 trusted publishing', () => {
  const workflow = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /npm install -g npm@12\.1\.0(?:\s|$)/);
  assert.doesNotMatch(workflow, /npm@latest/);
  assert.match(workflow, /node-version:\s*24(?:\s|$)/);
  assert.match(workflow, /id-token:\s*write/);
  assert.match(workflow, /npm publish --provenance --access public/);
});
