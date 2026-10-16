// The first lines people and agents read: npm's description, the README opening, the installer
// banner and llms.txt. They lead with the purpose, and they keep the 0.1.11 correction (#11):
// routing is an instruction an agent follows, never a model choice this package makes itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');
const lead = readme.split('\n')[4];
const preview = spawnSync(process.execPath, [
  fileURLToPath(new URL('bin/cli.js', root)), '--yes', '--level', '1', '--ais', 'chatgpt-app', '--no-tools', '--dry-run'
], { encoding: 'utf8' });
const banner = (preview.stdout.match(/\nmodel-orchestrator\n([^\n]*)\n/) || [])[1];
const llms = read('llms.txt');

// Claims the package does not make. 0.1.11 retired the first one after an audit.
const OVERCLAIM = /cheapest AI that does it well|switches between models|automatically (selects|picks|chooses|switches)/i;

test('description, README opening and banner all say it is a model router', () => {
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(banner, pkg.description, 'the emitted banner must match the package description byte for byte');
  for (const [name, s] of [['description', pkg.description], ['README line 5', lead], ['banner', banner]]) {
    assert.match(s, /model router/i, name + ' must name what the package is');
    assert.doesNotMatch(s, OVERCLAIM, name + ' must not promise routing the code does not perform');
  }
});

test('description, README and llms.txt share the routing purpose without claiming token savings', () => {
  const purpose = 'routes routine work to cheaper models';
  for (const [name, text] of [['package.json', pkg.description], ['README opening', lead], ['README', readme], ['llms.txt', llms]]) {
    assert.ok(text.includes(purpose), name);
    assert.doesNotMatch(text, /saves tokens/i, name + ' must leave token savings unclaimed');
  }
  assert.equal(lead, '**' + pkg.description + '.**', 'README opening and package description must match');
});

test('README discloses the routing table context overhead on every prompt', () => {
  assert.match(readme, /every prompt carries the ~1\.7 KB route table/i);
});

test('the description fits the search-card copy budget', () => {
  assert.ok(pkg.description.length <= 160, 'The shared presentation spec caps descriptions at 160 characters, got ' + pkg.description.length);
});

// 0.1.28 states the same boundary the positive way: say where the package sits and who
// makes the choice, rather than listing what it is not. The guard that matters is
// unchanged and still the point of this test, OVERCLAIM must not match: the package may
// never promise that it picks the model. What replaced the negative sentence is a
// required positive one, so the boundary cannot quietly disappear from the copy either.
const SITS_ABOVE = /above the request layer/i;
const WHO_CHOOSES = /your agent reads the rules and picks the lane/i;

test('README and llms.txt say where it sits and who picks the lane', () => {
  for (const [name, s] of [['README', readme], ['llms.txt', llms]]) {
    assert.match(s, SITS_ABOVE, name + ' must say where the package sits');
    assert.match(s, WHO_CHOOSES, name + ' must say the agent picks the lane, not the package');
    assert.doesNotMatch(s, OVERCLAIM, name + ' must not promise routing the code does not perform');
  }
});

test('the who-picks-the-lane check can go red', () => {
  assert.doesNotMatch('it automatically selects the cheapest model', WHO_CHOOSES);
  assert.match('it automatically selects the cheapest model', OVERCLAIM);
});

test('llms.txt follows the llmstxt.org shape and ships in the package', () => {
  const lines = llms.split('\n');
  assert.equal(lines[0], '# model-orchestrator', 'H1 with the package name first');
  assert.ok(lines.some((l) => l.startsWith('> ')), 'a blockquote summary');
  assert.ok(lines.some((l) => /^## /.test(l)), 'at least one H2 section of links');
  for (const f of ['llms.txt', 'AGENTS.md']) assert.ok(pkg.files.includes(f), f + ' must be in package.json files');
});

test('every llms.txt link to this repository points at a file that exists', () => {
  const links = [...llms.matchAll(/\]\((https:\/\/github\.com\/aunysillyme\/model-orchestrator\/blob\/main\/([^)]+))\)/g)];
  assert.ok(links.length >= 5, 'expected the doc links, found ' + links.length);
  for (const [, url, path] of links) assert.ok(existsSync(new URL(path.split('#')[0], root)), 'dead link in llms.txt: ' + url);
});
