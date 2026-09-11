// route-gate.mjs and subagent-context.mjs are the two delegate-by-default (0.1.15)
// claude-code-only hooks. Both are rendered templates, not copied raw like
// bin/cli-run.mjs, so these tests render them the way the installer would
// and then spawn the real file: a syntax or logic bug in the render vars
// would otherwise only surface once a user actually ran Claude Code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { planFiles } from '../src/install.js';
import { byId } from '../src/catalog.js';

// dir nested under project (not two siblings) so RULES_FILE_REL renders as a
// relative path, the realistic case: two siblings hit install.js's "outside
// the project" fallback and render an absolute path instead, which is a
// different, already-covered branch.
const RULES_SUBDIR = 'ai-orchestrator';
function renderedHook(rel, opts = {}) {
  const p = planFiles({ level: 2, selected: [byId['claude-code']], primary: byId['claude-code'], dir: RULES_SUBDIR, project: '.', ...opts });
  const f = p.find((f) => f.rel === join('.claude', 'hooks', rel));
  assert.ok(f, rel + ' was not planned');
  return f.content;
}

function writeHook(dir, rel, content) {
  const abs = join(dir, rel);
  writeFileSync(abs, content);
  chmodSync(abs, 0o755);
  return abs;
}

function run(hookPath, env) {
  return spawnSync('node', [hookPath], { input: '', encoding: 'utf8', env: { ...process.env, ...env } });
}

// Where the hook expects ROUTING.md, mirroring RULES_SUBDIR/ROUTING.md.
function writeRules(project, content) {
  const dir = join(project, RULES_SUBDIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'ROUTING.md'), content);
}

test('route-gate.mjs: a rules file with the block returns valid JSON, UserPromptSubmit, and the table', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  const project = mkdtempSync(join(tmpdir(), 'orch-proj-'));
  try {
    const hookPath = writeHook(scratch, 'route-gate.mjs', renderedHook('route-gate.mjs'));
    writeRules(project, 'before\n<!-- route-gate:start -->\n| Task | Lane |\n|---|---|\n| Everything else that changes files | builder, by default |\n<!-- route-gate:end -->\nafter\n');
    const r = run(hookPath, { CLAUDE_PROJECT_DIR: project });
    assert.equal(r.status, 0, 'route-gate.mjs must always exit 0: ' + r.stderr);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(out.hookSpecificOutput.additionalContext, /builder, by default/);
    assert.match(out.hookSpecificOutput.additionalContext, /route-gate:start/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('route-gate.mjs: a missing rules file exits 0 with a fallback naming the path', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  const project = mkdtempSync(join(tmpdir(), 'orch-proj-'));
  try {
    const hookPath = writeHook(scratch, 'route-gate.mjs', renderedHook('route-gate.mjs'));
    const r = run(hookPath, { CLAUDE_PROJECT_DIR: project });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(out.hookSpecificOutput.additionalContext, /route-gate:/);
    assert.match(out.hookSpecificOutput.additionalContext, /ROUTING\.md/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('route-gate.mjs: a rules file with no route-gate block falls back the same way', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  const project = mkdtempSync(join(tmpdir(), 'orch-proj-'));
  try {
    const hookPath = writeHook(scratch, 'route-gate.mjs', renderedHook('route-gate.mjs'));
    writeRules(project, 'no markers here at all\n');
    const r = run(hookPath, { CLAUDE_PROJECT_DIR: project });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /no route-gate block/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('route-gate.mjs: an oversized rules file still produces a bounded, valid response', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  const project = mkdtempSync(join(tmpdir(), 'orch-proj-'));
  try {
    const hookPath = writeHook(scratch, 'route-gate.mjs', renderedHook('route-gate.mjs'));
    // Padding past the hook's 64 KB read cap, with the block placed after the
    // cap: the read truncates before the start marker, so this is a "no
    // block found" case, not a hang or a multi-megabyte injection.
    const padding = 'x'.repeat(70 * 1024);
    writeRules(project, padding + '\n<!-- route-gate:start -->\ntable\n<!-- route-gate:end -->\n');
    const r = run(hookPath, { CLAUDE_PROJECT_DIR: project });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.ok(out.hookSpecificOutput.additionalContext.length < 5000, 'the injected context must stay bounded');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('route-gate.mjs: CLAUDE_PROJECT_DIR unset still exits 0 with a fallback', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  try {
    const hookPath = writeHook(scratch, 'route-gate.mjs', renderedHook('route-gate.mjs'));
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    const r = spawnSync('node', [hookPath], { input: '', encoding: 'utf8', env });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(out.hookSpecificOutput.additionalContext, /CLAUDE_PROJECT_DIR is not set/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('subagent-context.mjs: valid JSON, SubagentStart, exit 0 on empty stdin', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  try {
    const hookPath = writeHook(scratch, 'subagent-context.mjs', renderedHook('subagent-context.mjs'));
    const r = run(hookPath, {});
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
    assert.match(out.hookSpecificOutput.additionalContext, /delegate/i);
    assert.match(out.hookSpecificOutput.additionalContext, /TASK_BUNDLE\.md/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
