import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { parseLineup, resolveModels, validateSnapshot, checkModels, readSnapshot } from '../src/models.js';
import { gatewayModels, planFiles, writeFiles } from '../src/install.js';
import { byId, providerById } from '../src/catalog.js';

const lineup = () => Object.fromEntries([['opus', 4, 20], ['sonnet', 2, 10], ['haiku', .1, .5]].map(([family, price_in, price_out]) => [family, { id: `claude-${family}-5-5`, price_in, price_out }]));
const snapshot = (extra = {}) => resolveModels(lineup(), { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5', haiku: 'claude-haiku-5-5' }, null, extra);

test('resolver uses alias only for confirmed current IDs and rejects outdated pinned IDs', () => {
  const snap = snapshot();
  assert.equal(snap.tiers.deep.value, 'opus');
  assert.equal(snap.tiers.standard.value, 'claude-sonnet-5-5');
  assert.equal(snap.tiers.fast.value, 'haiku');
  snap.tiers.standard.value = 'claude-sonnet-5';
  assert.throws(() => validateSnapshot(snap), /current|value/);
});

test('new families and price increases hold until candidate-specific explicit approval; hold survives later cheaper probe', () => {
  const current = lineup();
  current.fable = { id: 'claude-fable-5-1', price_in: 10, price_out: 50 };
  assert.throws(() => validateSnapshot(resolveModels(current, {})), /escalation/);
  const previous = snapshot();
  current.sonnet.price_in = 3;
  const held = resolveModels(current, {}, previous);
  assert.equal(held.tiers.standard.held, true);
  assert.equal(resolveModels(lineup(), {}, held).tiers.standard.held, true);
  assert.throws(() => validateSnapshot(resolveModels(current, {}, previous, { approveFamilies: ['fable=claude-fable-5-1'], approveTiers: { standard: 'claude-sonnet-5' } })), /held|escalation/);
  validateSnapshot(resolveModels(current, {}, held, { approveFamilies: ['fable=claude-fable-5-1'], approveTiers: { standard: 'claude-sonnet-5-5' } }));
});

test('first probe compares prices to catalog ceilings rather than silently approving new rates', () => {
  const current = lineup(); current.opus.price_out = 21;
  assert.equal(resolveModels(current).tiers.deep.held, true);
});

const docs = `| Feature | Claude Opus 5.5 | Claude Sonnet 5.5 | Claude Haiku 5.5 |
| --- | --- | --- | --- |
| Claude API ID | \`claude-opus-5-5\` | \`claude-sonnet-5-5\` | \`claude-haiku-5-5\` |
| [Pricing](https://example.invalid) | $4 / $20 | $2 / $10 | From $0.10 / From $0.50 |
`;

test('official table parser matches model versions and conservative From prices', () => {
  const parsed = parseLineup(docs);
  assert.equal(parsed.haiku.price_basis, 'from');
  assert.throws(() => parseLineup(docs.replace('claude-opus-5-5', 'claude-opus-5')), /unparseable/);
  assert.throws(() => parseLineup(docs.replace('$20', '$20 and $21')), /unparseable/);
});

test('probe emits JSON full IDs by default and refuses snapshot when every explicit alias canary fails', () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'orch-model-probe-test-'));
  try {
    const path = join(root, 'docs.md'); writeFileSync(path, docs);
    const args = ['bin/aunx.js', 'models', '--probe', '--docs', path];
    const plain = spawnSync(process.execPath, args, { encoding: 'utf8', env: { ...process.env, PATH: root } });
    assert.equal(plain.status, 0, plain.stderr);
    assert.equal(JSON.parse(plain.stdout).tiers.deep.value, 'claude-opus-5-5');
    const failed = spawnSync(process.execPath, [...args, '--probe-aliases'], { encoding: 'utf8', env: { ...process.env, PATH: root } });
    assert.equal(failed.status, 3, failed.stderr);
    assert.equal(failed.stdout, '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('resolver fails closed for malformed docs, timestamps, prices, and aliases', () => {
  assert.throws(() => parseLineup('no table'), /table/);
  for (const mutate of [s => s.as_of = '2020-01-01T00:00:00Z', s => s.as_of = '2099-01-01T00:00:00Z', s => s.lineup.opus.price_in = -1, s => s.tiers.deep.alias_loads = 'claude-opus-5']) {
    const snap = snapshot(); mutate(snap); assert.throws(() => validateSnapshot(snap));
  }
});

test('installer pins eight Claude agents, preserves edited definitions, and offline check fails legacy ID', () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'orch-models-'));
  try {
    const opts = { level: 1, selected: [byId['claude-code']], primary: byId['claude-code'], dir: join(root, 'rules'), project: root, models: snapshot() };
    writeFiles(planFiles(opts), opts);
    assert.deepEqual(checkModels(opts.models, root), []);
    const agent = join(root, '.claude', 'agents', 'builder.md');
    const legacy = readFileSync(agent, 'utf8').replace('model: claude-sonnet-5-5', 'model: claude-sonnet-5');
    writeFileSync(agent, legacy);
    writeFiles(planFiles(opts), { ...opts, updateDocs: true });
    assert.equal(readFileSync(agent, 'utf8'), legacy);
    assert.match(checkModels(opts.models, root).join('\n'), /legacy|current/);
    const file = join(root, 'snapshot.json'); writeFileSync(file, JSON.stringify(opts.models));
    const link = join(root, 'link.json'); symlinkSync(file, link);
    assert.throws(() => readSnapshot(link), /symlink/);
    const parentLink = join(root, 'linked-dir'); symlinkSync(root, parentLink, 'dir');
    assert.throws(() => readSnapshot(join(parentLink, 'snapshot.json')), /snapshot JSON|unsafe/);
    const result = spawnSync(process.execPath, ['bin/aunx.js', 'models', '--check', file, '--project', root], { encoding: 'utf8' });
    assert.equal(result.status, 1, result.stderr);
    const baseArgs = ['bin/cli.js', '--yes', '--level', '1', '--ais', 'claude-code', '--project', root, '--dir', opts.dir, '--update-docs'];
    const env = { ...process.env, PATH: root };
    const retained = spawnSync(process.execPath, baseArgs, { encoding: 'utf8', env });
    assert.equal(retained.status, 0, retained.stderr);
    assert.match(readFileSync(join(root, '.claude', 'agents', 'deep-planner.md'), 'utf8'), /^model: opus$/m);
    const cleared = spawnSync(process.execPath, [...baseArgs, '--models', 'none'], { encoding: 'utf8', env });
    assert.equal(cleared.status, 0, cleared.stderr);
    assert.doesNotMatch(readFileSync(join(root, '.claude', 'agents', 'deep-planner.md'), 'utf8'), /^model:/m);
    assert.equal(readFileSync(agent, 'utf8'), legacy);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Anthropic gateway honors resolved full IDs while other providers retain catalog models', () => {
  const snap = snapshot();
  snap.lineup.sonnet.id = 'claude-sonnet-5-6';
  snap.tiers.standard.model_id = 'claude-sonnet-5-6';
  const text = gatewayModels([], [providerById.anthropic, providerById.openai], snap);
  assert.match(text, /anthropic\/claude-sonnet-5-6/);
  assert.ok(text.includes(providerById.openai.lanes[0][1]));
});

test('model installer dry run has no writes and default install retains inherited models', () => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'orch-model-dry-'));
  try {
    const file = join(root, 'snapshot.json'); writeFileSync(file, JSON.stringify(snapshot()));
    const result = spawnSync(process.execPath, ['bin/cli.js', '--yes', '--level', '1', '--ais', 'claude-code', '--models', file, '--project', root, '--dir', join(root, 'rules'), '--dry'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.throws(() => readFileSync(join(root, 'rules', 'MANIFEST.json')));
    const plain = planFiles({ level: 1, selected: [byId['claude-code']], primary: byId['claude-code'], project: root, dir: join(root, 'rules') });
    assert.ok(plain.filter(f => f.rel.includes('agents/')).every(f => !/^model:/m.test(f.content)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
