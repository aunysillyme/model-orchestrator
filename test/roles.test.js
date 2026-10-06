import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIS, byId, agentCandidates } from '../src/catalog.js';
import * as catalog from '../src/catalog.js';
import { ROLE_SPECS, costRank, assignRoles, roleTable, inferPrimary, manifestRoles } from '../src/roles.js';

const select = (...ids) => ids.map((id) => byId[id]);
const result = (ids, main = ids[0]) => assignRoles({ selected: select(...ids), primary: byId[main] });
const picks = (assignment) => Object.fromEntries(Object.entries(assignment.roles).map(([id, role]) => [id, role.ai]));
const mainRoles = (id) => ({ plan: id, build: id, review: null, verify: id, research: id, bulk: id, read: id, private: null });

test('Codex and Claude primary each route independent review to the other executable', () => {
  const selected = select('codex', 'claude-code');
  for (const [main, reviewer, command] of [['codex', 'claude-code', 'cli-run claude'], ['claude-code', 'codex', 'cli-run codex --audit']]) {
    const primary = byId[main];
    const assignment = assignRoles({ selected, primary });
    const role = manifestRoles(assignment, { selected, primary }).review;
    assert.equal(role.ai, reviewer);
    assert.equal(role.via, 'cli-run');
    assert.equal(role.command, command);
    assert.equal(role.preferredTransport, main === 'codex' ? 'mcp' : undefined);
    assert.ok(roleTable(assignment, { selected, primary }).includes('aunx ' + command));
    if (main === 'codex') assert.match(roleTable(assignment, { selected, primary }), /connected Claude worker MCP when available/);
  }
});

test('worked example (a): Claude Code only keeps main-agent work and honest gaps', () => {
  const assignment = result(['claude-code']);
  assert.deepEqual(picks(assignment), mainRoles('claude-code'));
  assert.deepEqual(assignment.unassigned, ['review', 'private']);
  assert.equal(assignment.roles.bulk.via, 'main-agent');
  assert.doesNotMatch(assignment.roles.bulk.why, /runs through cli-run/i);
});

test('bulk runner reason is present only for external cli-run lanes at level 2 or higher', () => {
  const selected = select('claude-code', 'hermes');
  const primary = byId['claude-code'];
  assert.doesNotMatch(assignRoles({selected, primary, level: 1}).roles.bulk.why, /runs through cli-run/);
  assert.match(assignRoles({selected, primary, level: 2}).roles.bulk.why, /runs through cli-run/);
  assert.match(assignRoles({selected, primary, level: 3}).roles.bulk.why, /runs through cli-run/);
});

test('worked example (b): Codex main has an unverified research fallback', () => {
  const assignment = result(['codex']);
  assert.deepEqual(picks(assignment), mainRoles('codex'));
  assert.match(assignment.roles.research.why, /unverified/i);
  assert.equal(assignment.roles.review.ai, null);
});

test('worked example (c): formal preferences decide verify and tied research', () => {
  // Section 1's formal preferences outrank the contradictory example rows:
  // verify prefers a known different family; research ties use selection order.
  assert.deepEqual(picks(result(['claude-code', 'codex', 'grok'])), {
    ...mainRoles('claude-code'), review: 'codex', verify: 'codex', research: 'claude-code', bulk: 'claude-code'
  });
});

test('worked example (d): Codex and Antigravity use independent review and fan-out', () => {
  const assignment = result(['codex', 'agy']);
  assert.deepEqual(picks(assignment), { ...mainRoles('codex'), review: 'agy', verify: 'agy', 'fan-out': 'agy' });
  assert.equal(assignment.roles.review.via, 'cli-run');
  const table = roleTable(assignment, { selected: select('codex', 'agy'), primary: byId.codex });
  assert.match(table, /cli-run agy/);
  assert.doesNotMatch(table, /deep-planner|builder|finding-verifier|bulk-worker|live-researcher/);
});

test('worked example (e): chat-only work is pasted into the main agent', () => {
  const assignment = result(['claude-app']);
  assert.deepEqual(picks(assignment), mainRoles('claude-app'));
  const table = roleTable(assignment, { selected: select('claude-app'), primary: byId['claude-app'] });
  assert.match(table, /paste/i);
  assert.doesNotMatch(table, /cli-run/);
});

test('worked example (f): full stack derives free bulk and independent review', () => {
  const assignment = result(['claude-code', 'codex', 'agy', 'grok', 'hermes', 'qwen', 'ollama']);
  assert.deepEqual(picks(assignment), {
    ...mainRoles('claude-code'), review: 'codex', verify: 'codex', research: 'claude-code', bulk: 'hermes', private: 'ollama', 'fan-out': 'agy'
  });
  assert.equal(assignment.roles.private.via, 'local');
  assert.ok(!Object.values(assignment.roles).some((r) => r.ai === 'qwen'));
});

test('worked example (g): ollama does not win bulk', () => {
  assert.deepEqual(picks(result(['claude-code', 'ollama'])), { ...mainRoles('claude-code'), private: 'ollama' });
});

test('worked example (h): same-family chat app never supplies independent review', () => {
  assert.deepEqual(picks(result(['claude-code', 'claude-app'])), mainRoles('claude-code'));
});

test('review is never same-family for any catalog main agent', () => {
  for (const primary of agentCandidates(AIS)) {
    const { roles } = assignRoles({ selected: AIS, primary });
    if (primary.facts.modelFamily === null) assert.equal(roles.review.ai, null, primary.id);
    if (roles.review.ai) {
      assert.ok(byId[roles.review.ai].facts.modelFamily);
      assert.notEqual(byId[roles.review.ai].facts.modelFamily, primary.facts.modelFamily);
    }
  }
});

test('private never falls back to the main agent', () => {
  assert.equal(result(['codex', 'agy']).roles.private.ai, null);
  assert.match(result(['codex']).roles.private.why, /machine/i);
});

test('determinism: detected binaries and plan headroom do not change assignment', () => {
  const selected = select('claude-code', 'codex', 'grok');
  const primary = selected[0];
  const a = assignRoles({ selected, primary });
  assert.deepEqual(assignRoles({ selected, primary }), a);
  assert.deepEqual(assignRoles({ selected, primary, detected: new Set(['codex']), plans: { codex: { headroom: 'max' } } }), a);
});

test('unknown required facts do not qualify and render unverified', () => {
  const unknown = { ...byId.codex, facts: { ...byId.codex.facts, liveWeb: null, fanOut: null, runsLocally: null } };
  const assignment = assignRoles({ selected: [unknown], primary: unknown });
  assert.equal(assignment.roles.private.ai, null);
  assert.ok(!('fan-out' in assignment.roles));
  assert.match(roleTable(assignment, { selected: [unknown], primary: unknown }), /unverified/i);
});

test('long-context requires known main context and selects the largest', () => {
  const make = (id, tokens) => ({ ...byId.codex, id, facts: { ...byId.codex.facts, contextWindow: tokens === null ? null : { tokens, source: 'fixture', checked: '2026-09-27' } } });
  const main = make('main', 100);
  const larger = make('larger', 200);
  const largest = make('largest', 300);
  assert.equal(assignRoles({ selected: [main, larger, largest], primary: main }).roles['long-context'].ai, 'largest');
  assert.ok(!('long-context' in assignRoles({ selected: [make('main', null), largest], primary: make('main', null) }).roles));
});

test('bulk orders known metered input rates and preserves selection for unknown rates', () => {
  const make = (id, rate) => ({ ...byId.qwen, id, facts: { ...byId.qwen.facts, pricing: rate === null ? null : { inPerM: rate, outPerM: rate, source: 'fixture', checked: '2026-09-27' } } });
  const expensive = make('expensive', 10), cheap = make('cheap', 1), unknown = make('unknown', null);
  assert.equal(assignRoles({ selected: [expensive, cheap], primary: expensive }).roles.bulk.ai, 'cheap');
  const assignment = assignRoles({ selected: [unknown, cheap], primary: unknown });
  assert.equal(assignment.roles.bulk.ai, 'unknown');
  assert.match(assignment.roles.bulk.why, /check your provider's rate/i);
  assert.deepEqual(['ollama', 'hermes', 'codex', 'qwen'].map((id) => costRank(byId[id])), [0, 1, 2, 3]);
});

test('assignment and primary inference never mutate caller arrays', () => {
  const selected = Object.freeze(select('grok', 'claude-code', 'codex'));
  inferPrimary(selected);
  assignRoles({ selected, primary: byId['claude-code'] });
  assert.deepEqual(selected.map((a) => a.id), ['grok', 'claude-code', 'codex']);
});

test('inferPrimary uses capabilities and handles an empty candidate set', () => {
  assert.equal(inferPrimary([]), undefined);
  assert.equal(inferPrimary(select('grok', 'agy', 'claude-code')).id, 'claude-code');
  assert.equal(inferPrimary(select('grok', 'codex')).id, 'codex');
  const capable = { ...byId.grok, id: 'new-ai', facts: { ...byId.grok.facts, agentDefinitions: '.new/agents', loadsProjectRules: true } };
  assert.equal(inferPrimary([byId.codex, capable]).id, 'new-ai');
});

test('role metadata always includes the eight base roles and no vendor identity', () => {
  assert.deepEqual(ROLE_SPECS.filter((r) => !r.conditional).map((r) => r.id), ['plan', 'build', 'review', 'verify', 'research', 'bulk', 'read', 'private']);
  const empty = assignRoles({ selected: [], primary: null });
  assert.equal(empty.unassigned.length, 8);
});


test('inherited true capabilities retain provenance in role rows', () => {
  const selected = select('codex', 'agy', 'grok');
  const assignment = assignRoles({ selected, primary: byId.codex });
  assert.match(assignment.roles.research.why, /UNVERIFIED against a vendor doc/);
  assert.match(assignment.roles['fan-out'].why, /UNVERIFIED against a vendor doc/);
  const table = roleTable(assignment, { selected, primary: byId.codex });
  const researchRow = table.split('\n').find((row) => row.includes('Current primary sources'));
  const fanOutRow = table.split('\n').find((row) => row.includes('N independent units'));
  assert.match(researchRow, /UNVERIFIED against a vendor doc/);
  assert.match(fanOutRow, /UNVERIFIED against a vendor doc/);
});

test('summary rendering carries capability provenance without changing facts', () => {
  assert.match(catalog.summaryWithEvidence(byId.agy), /fanOut: UNVERIFIED against a vendor doc/);
  assert.match(catalog.summaryWithEvidence(byId.grok), /liveWeb: UNVERIFIED against a vendor doc/);
  assert.equal(catalog.summaryWithEvidence(byId.codex), byId.codex.summary);
  assert.equal(byId.agy.facts.fanOut, true);
  assert.equal(byId.grok.facts.liveWeb, true);
});
