import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolveModels } from '../src/models.js';

const lineup = () => Object.fromEntries([['opus', 4, 20], ['sonnet', 2, 10], ['haiku', .1, .5]].map(([family, price_in, price_out]) => [family, { id: `claude-${family}-5-5`, price_in, price_out }]));
const aliases = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5', haiku: 'claude-haiku-5-5' };
const snapshot = () => resolveModels(lineup(), aliases);
const table = (sonnetIn = 2, fable = false) => `| Feature | Claude Opus 5.5 | Claude Sonnet 5.5 | Claude Haiku 5.5 |${fable ? ' Claude Fable 5.1 |' : ''}
| --- | --- | --- | --- |${fable ? ' --- |' : ''}
| Claude API ID | \`claude-opus-5-5\` | \`claude-sonnet-5-5\` | \`claude-haiku-5-5\` |${fable ? ' `claude-fable-5-1` |' : ''}
| Pricing | $4 / $20 | $${sonnetIn} / $10 | From $0.10 / From $0.50 |${fable ? ' $10 / $50 |' : ''}
`;

// Portable synthetic vendor. A preloaded CommonJS bridge maps spawn('claude', ...) to
// process.execPath + a Node stub script, so no shebang, chmod or PATH lookup is needed
// (works on Windows). Every call is recorded by the bridge, and the stub is a real child
// process that records itself too. Args and spawn options pass through unchanged.
const BRIDGE = `'use strict';
const cp = require('node:child_process');
const fs = require('node:fs');
const original = cp.spawn;
cp.spawn = function (command, args, options) {
  if (command !== 'claude') return original.apply(this, arguments);
  const list = Array.isArray(args) ? args : [];
  const opts = Array.isArray(args) ? options : args;
  fs.appendFileSync(process.env.ORCH_STUB_LOG, JSON.stringify({ args: list, cwd: opts && opts.cwd, detached: opts && opts.detached }) + '\\n');
  return original.call(this, process.execPath, [process.env.ORCH_STUB_SCRIPT, ...list], opts);
};
require('node:module').syncBuiltinESMExports();
`;
const STUB = `'use strict';
const args = process.argv.slice(2);
require('node:fs').appendFileSync(process.env.ORCH_STUB_LOG + '.child', process.pid + '\\n');
const family = args[args.indexOf('--model') + 1];
process.stdout.write(JSON.stringify({ subtype: 'success', is_error: false, modelUsage: { ['claude-' + family + '-5-5']: {} } }));
`;

// Drop PATH and NODE_OPTIONS in any case (Windows env keys are case-insensitive) so no
// ambient real CLI or preload can reach the stub tests.
function cleanEnv(extra) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(path|node_options)$/i.test(key)));
  return { ...env, ...extra };
}

function sandbox() {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'orch-r1-models-'));
  const log = join(root, 'stub.log');
  const bridge = join(root, 'bridge.cjs');
  const script = join(root, 'claude-stub.cjs');
  writeFileSync(bridge, BRIDGE);
  writeFileSync(script, STUB);
  const count = file => existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).length : 0;
  const calls = () => count(log);
  const children = () => count(log + '.child');
  const env = cleanEnv({ PATH: root, ORCH_STUB_LOG: log, ORCH_STUB_SCRIPT: script });
  const node = args => spawnSync(process.execPath, ['--require', bridge, ...args], { encoding: 'utf8', env });
  const aunx = (...args) => node(['bin/aunx.js', 'models', ...args]);
  return { root, calls, children, env, node, aunx };
}

test('Fix 1: family approval needs the exact id= form and an own lineup entry', () => {
  // The reported bypass: an unknown family approved without an ID is acknowledged for later.
  for (const bad of ['fable', 'fable=', '=claude-fable-5-1', 'fable=claude-fable-5-1=x', 'fable=claude-fable-5-1=', 'constructor', 'constructor=undefined', 'toString=function', '__proto__=x', 'sonnet=claude-sonnet-5-6']) {
    assert.throws(() => resolveModels(lineup(), aliases, null, { approveFamilies: [bad] }), /family approval/, bad);
  }
  // Nothing was pre-acknowledged: a later new family still escalates for approval.
  const first = resolveModels(lineup(), aliases);
  const later = lineup(); later.fable = { id: 'claude-fable-5-1', price_in: 10, price_out: 50 };
  const next = resolveModels(later, aliases, first);
  assert.deepEqual(next.escalations.filter(e => e.code === 'NEW_FAMILY').map(e => e.family), ['fable']);
  // The fully formed approval for the exact current candidate still works.
  const approved = resolveModels(later, aliases, first, { approveFamilies: ['fable=claude-fable-5-1'] });
  assert.deepEqual(approved.known_unrouted_families, ['fable']);
  assert.equal(approved.escalations.length, 0);
});

test('Fix 1 (CLI): approving a missing family without an id exits non-zero and writes no snapshot', () => {
  const box = sandbox();
  try {
    const docs = join(box.root, 'docs.md'); writeFileSync(docs, table());
    for (const arg of ['fable', 'fable=', 'constructor']) {
      const run = box.aunx('--probe', '--docs', docs, '--approve-family', arg);
      assert.notEqual(run.status, 0, arg);
      assert.equal(run.stdout, '', arg);
    }
  } finally { rmSync(box.root, { recursive: true, force: true }); }
});

test('Fix 2: invalid --previous or approval fails before any paid alias call', () => {
  const box = sandbox();
  try {
    const docs = join(box.root, 'docs.md'); writeFileSync(docs, table());
    const stale = snapshot(); stale.policy_checked = '1999-01-01';
    const garbage = join(box.root, 'garbage.json'); writeFileSync(garbage, '{ not json');
    const mismatched = join(box.root, 'policy.json'); writeFileSync(mismatched, JSON.stringify(stale));
    for (const extra of [['--previous', garbage], ['--previous', mismatched], ['--previous', join(box.root, 'missing.json')], ['--approve-family', 'fable'], ['--approve-family', 'fable=claude-fable-5-1']]) {
      const run = box.aunx('--probe', '--docs', docs, '--probe-aliases', ...extra);
      assert.notEqual(run.status, 0, extra.join(' '));
      assert.equal(run.stdout, '', extra.join(' '));
      assert.equal(box.calls(), 0, `stub was called for ${extra.join(' ')}`);
    }
    // Control: the same stub is invoked once per family when inputs are valid.
    const ok = box.aunx('--probe', '--docs', docs, '--probe-aliases');
    assert.equal(ok.status, 0, ok.stderr);
    assert.equal(box.calls(), 3);
    assert.equal(box.children(), 3);
  } finally { rmSync(box.root, { recursive: true, force: true }); }
});

test('Fix 2: a held previous snapshot is still held after validated alias probing, never auto-approved', () => {
  const box = sandbox();
  try {
    const dear = join(box.root, 'dear.md'); writeFileSync(dear, table(3));
    const held = join(box.root, 'held.json');
    const first = box.aunx('--probe', '--docs', dear);
    assert.equal(first.status, 1, first.stderr);
    writeFileSync(held, first.stdout);
    assert.equal(JSON.parse(first.stdout).tiers.standard.held, true);
    const cheap = join(box.root, 'cheap.md'); writeFileSync(cheap, table(2));
    const run = box.aunx('--probe', '--docs', cheap, '--previous', held, '--probe-aliases');
    assert.equal(box.calls(), 3);
    assert.equal(run.status, 1, run.stderr);
    assert.equal(JSON.parse(run.stdout).tiers.standard.held, true);
  } finally { rmSync(box.root, { recursive: true, force: true }); }
});

test('Fix 3: install report names a model snapshot add, replace and clear instead of "selection identical"', () => {
  const box = sandbox();
  try {
    const dir = join(box.root, 'rules');
    const install = (...extra) => {
      const run = box.node(['bin/cli.js', '--yes', '--level', '1', '--ais', 'claude-code', '--project', box.root, '--dir', dir, ...extra]);
      assert.equal(run.status, 0, run.stderr);
      return run.stdout;
    };
    const one = join(box.root, 'one.json'); writeFileSync(one, JSON.stringify(snapshot()));
    const other = snapshot(); other.as_of = new Date(Date.now() - 3600000).toISOString();
    const two = join(box.root, 'two.json'); writeFileSync(two, JSON.stringify(other));
    install();
    assert.match(install(), /selection identical/);
    for (const [label, extra] of [['add', ['--models', one]], ['replace', ['--models', two]], ['clear', ['--models', 'none']]]) {
      const out = install(...extra);
      assert.match(out, /selection changed: models/, label);
      assert.doesNotMatch(out, /selection identical/, label);
    }
    assert.match(install(), /selection identical/);
  } finally { rmSync(box.root, { recursive: true, force: true }); }
});
