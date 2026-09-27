import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { planFiles } from '../src/install.js';
import { byId } from '../src/catalog.js';

function installed(ids, primary = ids[0], level = 2) {
  return planFiles({ level, selected: ids.map(id => byId[id]), primary: byId[primary] });
}
function content(files, rel) { return files.find(f => f.rel.replaceAll('\\', '/') === rel)?.content || ''; }
const advice = ['README.md', 'ORCHESTRATOR.md', 'ROUTING.md', 'DELEGATION_MATRIX.md', 'TIERS.md', 'RESEARCH_TRIAGE.md'];

test('A1: no model pin in agent templates or generated plugin agents', () => {
  for (const dir of ['templates/agents/claude-code', 'templates/agents/agy', 'plugin/agents']) {
    for (const file of readdirSync(dir).filter(f => f.endsWith('.md'))) {
      assert.doesNotMatch(readFileSync(join(dir, file), 'utf8'), /^model:\s*\S+/m, `${dir}/${file}`);
    }
  }
});

test('A3a: advice docs name no unselected AI', () => {
  const files = installed(['claude-code', 'grok']);
  for (const file of advice) assert.doesNotMatch(content(files, file), /codex|antigravity|\bagy\b|hermes|qwen|ollama/i, file);
});

test('A3b: CLI-RUN examples use an enabled lane', () => {
  const text = content(installed(['claude-code', 'grok']), 'CLI-RUN.md');
  // Reference table rows deliberately describe every supported runner lane.
  const examples = text.split('\n').filter(line => !line.trimStart().startsWith('|')).join('\n');
  assert.doesNotMatch(examples, /cli-run(?:\.mjs)?\s+(?:codex|agy|hermes|qwen)\b/);
  assert.match(examples, /cli-run(?:\.mjs)?\s+grok\b/);
  assert.doesNotMatch(examples, /cli-run(?:\.mjs)?\s+grok\s+--audit/);
});

test('A3c: lanes.json pin example names an enabled lane', () => {
  const lanes = JSON.parse(content(installed(['claude-code', 'grok']), 'bin/lanes.json'));
  const key = lanes.defaultsNote.match(/"defaults":\s*\{\s*"([a-z-]+)"/)?.[1];
  assert.ok(lanes.enabled.includes(key), lanes.defaultsNote);
});

test('A4: codex-main install has no same-family independent-review claim', () => {
  const files = installed(['codex', 'agy']);
  assert.doesNotMatch(content(files, 'ROUTING.md'), /cli-run codex[^|\n]*(?:different model family|second model family)/i);
  assert.match(content(files, 'DELEGATION_MATRIX.md'), /cli-run agy/);
});

test('A5: no uninstalled subagent is named', () => {
  const files = installed(['codex', 'agy']);
  assert.ok(!files.some(file => /^(?:\.claude|\.agents)\//.test(file.rel)));
  assert.doesNotMatch(content(files, 'ROUTING.md'), /\b(?:deep-planner|builder|code-reviewer|finding-verifier|done-verifier|reader|bulk-worker|live-researcher)\b/);
});

test('A7: review is never assigned to the main agent model family', async () => {
  const { assignRoles } = await import('../src/roles.js');
  const selected = ['claude-code', 'codex', 'agy', 'grok'].map(id => byId[id]);
  for (const primary of selected) {
    const { roles } = assignRoles({ selected, primary });
    assert.ok(roles.review.ai);
    assert.notEqual(byId[roles.review.ai].facts.modelFamily, primary.facts.modelFamily);
  }
});

test('only a stated plan with a tierModels mapping can render an agent model', () => {
  const primary = byId['claude-code'];
  const base = { level: 1, selected: [primary], primary };
  const unpinned = planFiles(base);
  assert.doesNotMatch(content(unpinned, '.claude/agents/deep-planner.md'), /^model:/m);
  const mapped = planFiles({ ...base, plans: { 'claude-code': {
    ...primary.plans[0], tierModels: { 'planning model': 'fixture-planning-model' }
  } } });
  assert.match(content(mapped, '.claude/agents/deep-planner.md'), /^model: fixture-planning-model$/m);
  assert.doesNotMatch(content(mapped, '.claude/agents/builder.md'), /^model:/m);
});

test('all levels carry the role assignment and render only installed agent names', () => {
  for (const [ids, primary] of [
    [['claude-code'], 'claude-code'], [['codex', 'agy'], 'codex'],
    [['claude-code', 'codex', 'grok'], 'claude-code'], [['claude-app'], 'claude-app']
  ]) {
    for (const level of [1, 2, 3]) {
      const files = installed(ids, primary, level);
      const manifest = JSON.parse(content(files, 'MANIFEST.json'));
      for (const id of ['plan', 'build', 'review', 'verify', 'research', 'bulk', 'read', 'private']) assert.ok(id in manifest.roles);
      assert.match(content(files, 'README.md'), /## Your stack: who does what/);
      for (const entry of Object.values(manifest.roles)) {
        if (entry.agent) assert.ok(files.some(file => file.root === 'project' && file.rel.replaceAll('\\', '/').endsWith('/' + entry.agent + '.md')));
        if (entry.command) assert.ok(ids.includes(entry.ai));
      }
      if (level >= 2) for (const file of ['ROUTING.md', 'DELEGATION_MATRIX.md']) assert.match(content(files, file), /## Your stack: who does what/);
    }
  }
});

test('runnable examples respect the selected runner model and effort flags', () => {
  const files = installed(['qwen']);
  const text = content(files, 'CLI-RUN.md');
  const examples = text.split('\n').filter(line => !line.trimStart().startsWith('|')).join('\n');
  assert.match(examples, /cli-run qwen/);
  assert.doesNotMatch(examples, /cli-run(?:\.mjs)? qwen[^\n]*--(?:effort|audit)/);
  assert.doesNotMatch(JSON.parse(content(files, 'bin/lanes.json')).defaultsNote, /"effort"/);
});

test('routing instructions use external role assignments as well as the stack table', () => {
  const routing = content(installed(['claude-code', 'codex', 'grok']), 'ROUTING.md');
  assert.match(routing, /3a\. \*\*A reviewer or scanner has returned findings:\*\* -> `cli-run codex --audit`/);
  assert.match(routing, /\| Summarize similar notes into one index \| `cli-run codex`/);
  assert.match(routing, /\| Review this service for bugs \| `cli-run codex --audit`/);
});
