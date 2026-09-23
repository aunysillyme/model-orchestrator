// The first lines people and agents read: npm's description, the README opening, the installer
// banner and llms.txt. They lead with the purpose, and they keep the 0.1.11 correction (#11):
// routing is an instruction an agent follows, never a model choice this package makes itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const pkg = JSON.parse(read('package.json'));
const readme = read('README.md');
const lead = readme.split('\n')[4];
const banner = (read('bin/cli.js').match(/console\.log\('\\nmodel-orchestrator\\n([^']*)\\n'\)/) || [])[1];
const llms = read('llms.txt');

// Claims the package does not make. 0.1.11 retired the first one after an audit.
const OVERCLAIM = /cheapest AI that does it well|switches between models|automatically (selects|picks|chooses|switches)/i;

test('description, README opening and banner all say it is a model orchestrator', () => {
  assert.ok(banner, 'the banner line must be found in bin/cli.js');
  for (const [name, s] of [['description', pkg.description], ['README line 5', lead], ['banner', banner]]) {
    assert.match(s, /model orchestrator/i, name + ' must name what the package is');
    assert.doesNotMatch(s, OVERCLAIM, name + ' must not promise routing the code does not perform');
  }
});

test('description and README opening state the same purpose', () => {
  const purpose = 'so small work goes to cheap tiers and fewer tokens go to frontier models';
  assert.ok(pkg.description.includes(purpose), 'package.json description');
  assert.ok(lead.includes(purpose), 'README opening');
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
  for (const [, url, path] of links) assert.ok(existsSync(new URL(path, root)), 'dead link in llms.txt: ' + url);
});
