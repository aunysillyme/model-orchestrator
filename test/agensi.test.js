import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { AGENSI_DIR, PACK_NAMES, ROOT, planAgensiFiles } from '../src/agensi.js';
import { AIS } from '../src/catalog.js';
import { LANES } from '../bin/cli-run.mjs';

function walk(dir) {
  return readdirSync(dir).sort().flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}
const packFiles = () => PACK_NAMES.flatMap(pack => walk(join(AGENSI_DIR, pack)));
const read = path => readFileSync(path, 'utf8');

test('agensi (a): generated packs match the complete plan without drift', () => {
  const plan = planAgensiFiles();
  const expected = plan.map(file => file.rel).sort();
  const actual = packFiles().map(path => relative(AGENSI_DIR, path).split(sep).join('/')).sort();
  assert.deepEqual(actual, expected, 'Missing or stale pack files; run npm run gen:agensi');
  for (const { rel, content } of plan) {
    assert.equal(read(join(AGENSI_DIR, rel)), content, `${rel} drifted; run npm run gen:agensi`);
  }
});

test('agensi (b): SKILL frontmatter has the pack name and a short description', () => {
  for (const pack of PACK_NAMES) {
    const content = read(join(AGENSI_DIR, pack, 'SKILL.md'));
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    assert.ok(frontmatter, `${pack}: SKILL.md must start with frontmatter`);
    assert.match(frontmatter[1], new RegExp('^name: ' + pack + '$', 'm'));
    const description = frontmatter[1].match(/^description: "([^"\n]+)"$/m);
    assert.ok(description, `${pack}: description is required`);
    assert.ok(description[1].length < 400, `${pack}: keep description under 400 characters`);
  }
});

test('agensi (c): no unresolved template placeholders in any pack file', () => {
  for (const path of packFiles()) assert.ok(!read(path).includes('{{'), `${path}: unresolved placeholder`);
});

// Cover inline/image, reference-style and angle-bracket Markdown destinations.
// Fenced examples are omitted because they are examples rather than links.
function destinations(content) {
  const prose = content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  const inline = [...prose.matchAll(/!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g)];
  const references = [...prose.matchAll(/^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|([^\s]+))/gm)];
  return [...inline, ...references].map(match => match[1] || match[2]);
}

test('agensi (d): every relative Markdown link stays inside its pack and exists', () => {
  for (const pack of PACK_NAMES) {
    const root = resolve(AGENSI_DIR, pack);
    for (const path of walk(root).filter(path => path.endsWith('.md'))) {
      if (path.endsWith('SKILL.md')) assert.doesNotMatch(read(path), /https:\/\/github\.com\/aunysillyme\/model-orchestrator\/blob\/main\/templates\//, 'Entrypoint links must use the pack layout');
      for (const target of destinations(read(path))) {
        if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) continue;
        const file = decodeURIComponent(target.split(/[?#]/)[0]);
        const destination = resolve(dirname(path), file);
        assert.ok(destination === root || destination.startsWith(root + sep), `${path}: link escapes pack: ${target}`);
        assert.ok(existsSync(destination), `${path}: missing link target: ${target}`);
      }
    }
  }
});

test('agensi (e): intermediate runner is byte-identical to the repository runner', () => {
  assert.ok(readFileSync(join(AGENSI_DIR, PACK_NAMES[1], 'bin/cli-run.mjs')).equals(readFileSync(join(ROOT, 'bin/cli-run.mjs'))), 'Bundled runner bytes differ');
});

test('agensi (f): no em dash in any pack file', () => {
  for (const path of packFiles()) assert.ok(!read(path).includes('\u2014'), `${path}: em dash`);
});

test('agensi lanes are catalog-generated, all disabled and unpinned', () => {
  const config = JSON.parse(read(join(AGENSI_DIR, PACK_NAMES[1], 'bin/lanes.json')));
  assert.deepEqual(config.available, AIS.filter(ai => ai.facts.cliRun).map(ai => ai.bin));
  assert.deepEqual([...config.available].sort(), [...LANES].sort(), 'catalog and runner must agree');
  assert.deepEqual(config.enabled, []);
  assert.deepEqual(config.defaults, {});
});

test('agensi instructions have manual workflows without package commands', () => {
  for (const path of packFiles().filter(path => path.endsWith('.md'))) {
    assert.doesNotMatch(read(path), /\baunx\b|npx model-orchestrator|rerun the installer|\blevel [123]\b|node bin\/cli-run\.mjs|\.\.\/bin\/cli-run\.mjs/);
  }
});
