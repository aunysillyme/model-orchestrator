import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { AIS, LEVELS, TOOLS, aisForLevel, agentCandidates, byId } from '../src/catalog.js';
import { catalogMarkdown, protocolCount } from '../scripts/gen-catalog.js';
import { PROVIDERS, IMAGES, npmSpec } from '../src/catalog.js';

test('levels are 1, 2, 3 with names and taglines', () => {
  assert.deepEqual(LEVELS.map((l) => l.id), [1, 2, 3]);
  for (const l of LEVELS) assert.ok(l.name && l.tagline && l.gives);
});

test('every AI has the fields the installer relies on, and ids are unique', () => {
  const ids = new Set();
  for (const a of AIS) {
    assert.ok(a.id && !ids.has(a.id), 'duplicate or missing id ' + a.id);
    ids.add(a.id);
    assert.ok(a.name && a.vendor && a.role && a.auth, a.id + ' is missing a text field');
    assert.ok(['agent-cli', 'chat', 'local'].includes(a.kind), a.id + ' kind');
    assert.ok(['subscription', 'metered', 'free', 'local'].includes(a.access), a.id + ' access');
    assert.ok(['A', 'B', 'local', 'chat'].includes(a.lane), a.id + ' lane');
    assert.ok([1, 2, 3].includes(a.minLevel), a.id + ' minLevel');
    assert.equal(typeof a.cliRun, 'boolean', a.id + ' cliRun');
    const shapes = ['npm', 'script', 'url'].filter((k) => k in a.install);
    assert.ok(shapes.length >= 1, a.id + ' has no install method');
    if (a.kind === 'agent-cli' || a.kind === 'local') assert.ok(a.bin, a.id + ' needs a bin');
    if (a.kind === 'chat') assert.equal(a.bin, null, a.id + ' chat apps have no bin');
    if (a.cliRun) assert.ok(['grok', 'codex', 'agy', 'hermes', 'qwen'].includes(a.id), a.id + ' claims a cli-run lane that has no judge');
  }
});

test('no catalog field looks like a credential', () => {
  const blob = JSON.stringify(AIS);
  assert.doesNotMatch(blob, /sk-[A-Za-z0-9]{8,}/);
  assert.doesNotMatch(blob, /(?:api[_-]?key|token|secret)\s*[:=]\s*["'][^"']{8,}/i);
});

test('vendor scripts are https URLs and npm packages are scoped names', () => {
  for (const a of AIS) {
    if (a.install.script) assert.match(a.install.script, /^https:\/\//, a.id);
    if (a.install.url) assert.match(a.install.url, /^https:\/\//, a.id);
    if (a.install.npm) assert.match(a.install.npm, /^@[a-z0-9-]+\/[a-z0-9-]+$/, a.id);
  }
});

test('level filtering and primary candidates behave', () => {
  assert.ok(aisForLevel(1).every((a) => a.minLevel === 1));
  assert.ok(aisForLevel(3).length >= aisForLevel(2).length && aisForLevel(2).length >= aisForLevel(1).length);
  assert.ok(agentCandidates([byId.ollama]).length === 0, 'a local runtime cannot be the primary agent');
  assert.ok(agentCandidates([byId['claude-code'], byId.ollama]).length === 1);
});

test('docs/catalog.md is in sync with src/catalog.js', () => {
  const onDisk = readFileSync(new URL('../docs/catalog.md', import.meta.url), 'utf8');
  assert.equal(onDisk, catalogMarkdown(), 'run: npm run gen:catalog');
});

test('README lists every catalog id', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const a of AIS) assert.ok(readme.includes('`' + a.id + '`'), 'README missing ' + a.id);
});

test('companion tools have a repo, an install command, and README links the repo', () => {
  for (const t of TOOLS) {
    assert.match(t.repo, /^https:\/\/github\.com\//, t.id);
    assert.ok(t.install && t.requires && t.role && t.optionalNote && Array.isArray(t.autoClients), t.id);
    assert.equal(typeof t.recommended, 'boolean', t.id);
  }
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const t of TOOLS) assert.ok(readme.includes(t.repo), 'README missing ' + t.repo);
});

test('docs count protocols from source, providers carry only variable NAMES, images are pinned', () => {
  const n = protocolCount();
  assert.ok(n >= 6, 'expected at least six protocols, found ' + n);
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.doesNotMatch(readme, /\b(four|five|six|seven) protocols\b/, 'README must not hardcode a protocol count');
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.doesNotMatch(changelog, /\b\d+ (cases|tests)\b/, 'CHANGELOG must not carry a test count');
  for (const p of PROVIDERS) {
    assert.match(p.envName, /^[A-Z_]+_KEY$/, p.id);
    assert.ok(p.lanes.length >= 1, p.id);
  }
  for (const img of Object.values(IMAGES)) assert.match(img, /:v?\d+\.\d+\.\d+$/, img + ' is not pinned');
  for (const a of AIS) if (a.install.npm) assert.match(a.install.pin || '', /^\d+\.\d+\.\d+$/, a.id + ' npm install is not pinned');
});

test('templates/README.md names every protocol and every companion tool (drift guard)', () => {
  const readme = readFileSync(new URL('../templates/README.md', import.meta.url), 'utf8');
  const protocols = readdirSync(new URL('../templates/common/protocols/', import.meta.url)).filter((f) => f.endsWith('.md') && f !== 'README.md');
  for (const p of protocols) {
    const words = p.replace(/\.md$/, '').replace(/-protocol$/, '').split('-').join(' ');
    assert.ok(readme.toLowerCase().includes(words), `templates/README.md does not mention "${words}" (${p})`);
  }
  for (const t of TOOLS) assert.ok(readme.includes('`' + t.id + '/`'), `templates/README.md does not mention ${t.id}/`);
});

test('generated catalog carries the same npm pin the installer uses; the tarball ships the changelog and the security policy', () => {
  const md = catalogMarkdown();
  for (const a of AIS) if (a.install.npm) assert.ok(md.includes('`npm install -g ' + npmSpec(a) + '`'), `catalog.md install line for ${a.id} is not the pinned spec`);
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const f of ['CHANGELOG.md', 'SECURITY.md', 'README.md', 'LICENSE']) assert.ok(pkg.files.includes(f), `package.json files lacks ${f}`);
});
