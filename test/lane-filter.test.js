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
  const taskRows = matrix.split('## Task → lane')[1].split('## Install and sign-in')[0];
  assert.doesNotMatch(taskRows, /the cheapest metered lane, then the fast tier/);
  assert.doesNotMatch(taskRows, /local lane|fan-out lane|live-data CLI|second-coder CLI|largest-context lane|free tier/);
  assert.doesNotMatch(matrix, /Batch APIs|free model for routing|free or local model/);
  assert.match(taskRows, /Deep architecture \/ planning.*deep tier/);
  assert.doesNotMatch(content(files, 'ROUTING.md'), /→ (?:a|the selected) concurrent fan-out lane|cheapest metered lane measured/);
  assert.doesNotMatch(content(files, join('protocols', 'deep-research.md')), /a web-sweep lane, a second-opinion-read lane, a live-data lane/);
  assert.doesNotMatch(content(files, join('protocols', 'gap-analysis.md')), /second-opinion coder lane/);
  assert.doesNotMatch(content(files, 'RESEARCH_TRIAGE.md'), /reads the three outputs/);
});

test('DELEGATION_MATRIX for multiple selected AIs retains only their supplied lane categories', () => {
  const files = docs(['claude-code', 'codex', 'grok']);
  const matrix = content(files, 'DELEGATION_MATRIX.md');
  const taskRows = matrix.split('## Task → lane')[1].split('## Install and sign-in')[0];
  assert.match(taskRows, /second-coder CLI in read-only audit mode/);
  assert.match(taskRows, /live-data CLI/);
  assert.doesNotMatch(taskRows, /cheapest metered lane|local lane|fan-out lane|largest-context lane|free tier/);
  assert.doesNotMatch(matrix, /Batch APIs|free model for routing/);
  assert.match(content(files, join('protocols', 'gap-analysis.md')), /selected second-opinion coder lane/);
});

test('DELEGATION_MATRIX with all selected lane suppliers retains every category', () => {
  const files = docs(AIS.filter((ai) => ai.kind !== 'chat').map((ai) => ai.id));
  const matrix = content(files, 'DELEGATION_MATRIX.md');
  for (const pick of ['the cheapest metered lane, then the fast tier', 'the local lane', 'a concurrent fan-out lane', 'the live-data CLI', 'the second-coder CLI', 'the largest-context lane', 'the free tier']) {
    assert.ok(matrix.includes(pick), pick);
  }
  assert.match(matrix, /Batch APIs/);
  assert.match(matrix, /A free model for routing decisions/);
  assert.match(content(files, 'ROUTING.md'), /the selected concurrent fan-out lane/);
});

test('DELEGATION_MATRIX categories come from catalog metadata rather than AI ids', () => {
  const selected = [{ ...byId['claude-code'], laneCategories: ['local', 'free', 'fan-out'] }];
  const files = planFiles({ level: 2, selected, primary: selected[0] });
  const matrix = content(files, 'DELEGATION_MATRIX.md');
  assert.match(matrix, /Bulk work on data that must stay local \| the local lane/);
  assert.match(matrix, /Rough drafts, divergent reads, first-pass summaries \| the free tier/);
  assert.match(matrix, /A free model for routing decisions/);
  assert.match(content(files, 'ROUTING.md'), /the selected concurrent fan-out lane/);
  assert.doesNotMatch(matrix, /the cheapest metered lane, then the fast tier/);
});
