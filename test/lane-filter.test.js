import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { planFiles } from '../src/install.js';
import { AIS, byId } from '../src/catalog.js';

function docs(ids) {
  return planFiles({ level: 2, selected: ids.map((id) => byId[id]), primary: byId['claude-code'] });
}

function content(files, rel) {
  return files.find((file) => file.rel === rel).content;
}

test('DELEGATION_MATRIX for claude-code alone omits unavailable lane picks and cost advice', () => {
  const files = docs(['claude-code']);
  const matrix = content(files, 'DELEGATION_MATRIX.md');
  const taskRows = matrix.split('## Match the task to an available lane')[1].split('## Install and sign-in')[0];
  assert.doesNotMatch(taskRows, /the cheapest metered lane, then the cheap model tier/);
  assert.doesNotMatch(taskRows, /local lane|fan-out lane|live-data CLI|second-coder CLI|largest-context lane|free tier/);
  assert.doesNotMatch(taskRows, /cli-run (codex|agy|grok|hermes|qwen)/);
  assert.doesNotMatch(matrix, /Batch APIs|free model for routing|free or local model/);
  assert.match(taskRows, /Architecture, ambiguity, unknown cause.*planning model tier/);
  assert.doesNotMatch(content(files, 'ROUTING.md'), /→ (?:a|the selected) concurrent fan-out lane|cheapest metered lane measured/);
  assert.doesNotMatch(content(files, join('protocols', 'deep-research.md')), /a web-sweep lane, a second-opinion-read lane, a live-data lane/);
  assert.doesNotMatch(content(files, join('protocols', 'gap-analysis.md')), /second-opinion coder lane/);
  assert.doesNotMatch(content(files, 'RESEARCH_TRIAGE.md'), /reads the three outputs/);
});

test('DELEGATION_MATRIX for multiple selected AIs assigns from their capability facts', () => {
  const files = docs(['claude-code', 'codex', 'grok']);
  const matrix = content(files, 'DELEGATION_MATRIX.md');
  const taskRows = matrix.split('## Match the task to an available lane')[1].split('## Install and sign-in')[0];
  assert.match(taskRows, /cli-run codex --audit.*different model family.*read-only filesystem sandbox/);
  assert.match(taskRows, /Current primary sources.*live-researcher/);
  assert.doesNotMatch(taskRows, /cheapest metered lane|local lane|fan-out lane|largest-context lane|free tier/);
  assert.doesNotMatch(matrix, /Batch APIs|free model for routing/);
  assert.match(content(files, join('protocols', 'gap-analysis.md')), /cli-run codex --audit.*different model family/);
});

test('DELEGATION_MATRIX full stack computes free bulk and retains local and fan-out routes', () => {
  const files = docs(AIS.filter((ai) => ai.facts.kind !== 'chat').map((ai) => ai.id));
  const matrix = content(files, 'DELEGATION_MATRIX.md');
  for (const pick of ['`cli-run hermes`', 'Ollama (local models) on your machine', '`cli-run agy`', '`cli-run codex --audit`']) {
    assert.ok(matrix.includes(pick), pick);
  }
  assert.match(matrix, /Batch APIs/);
  assert.match(matrix, /A free model can carry routing decisions/);
  assert.match(content(files, 'ROUTING.md'), /N independent units.*cli-run agy/);
  assert.doesNotMatch(matrix, /One document larger than the main agent holds/, 'unknown context capacities cannot claim a largest-context route');
  const manifest = JSON.parse(content(files, 'MANIFEST.json'));
  assert.equal(manifest.roles.bulk.ai, 'hermes');
  assert.equal(manifest.roles.private.ai, 'ollama');
});

test('DELEGATION_MATRIX role eligibility comes from facts rather than AI ids', () => {
  const selected = [{ ...byId['claude-code'], facts: { ...byId['claude-code'].facts, runsLocally: true, billing: 'free', fanOut: true } }];
  const files = planFiles({ level: 2, selected, primary: selected[0] });
  const matrix = content(files, 'DELEGATION_MATRIX.md');
  const manifest = JSON.parse(content(files, 'MANIFEST.json'));
  assert.equal(manifest.roles.private.ai, 'claude-code');
  assert.equal(manifest.roles['fan-out'].ai, 'claude-code');
  assert.match(matrix, /A free model can carry routing decisions/);
  assert.match(content(files, 'ROUTING.md'), /N independent units/);
  assert.doesNotMatch(matrix, /the cheapest metered lane, then the cheap model tier/);
});
