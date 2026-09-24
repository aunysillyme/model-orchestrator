import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { planFiles } from '../src/install.js';
import { byId } from '../src/catalog.js';

function plan(project, dir, level = 2, id = 'claude-code') {
  return planFiles({ level, selected: [byId[id]], primary: byId[id], project, dir });
}

function content(files, rel) {
  return files.find((file) => file.rel === rel).content;
}

test('#43 inside-project rules paths stay relative in CLAUDE.snippet.md and the install README', () => {
  const project = join(tmpdir(), 'rules-path-project');
  const files = plan(project, join(project, 'rules'));
  const snippet = content(files, 'CLAUDE.snippet.md');
  assert.match(snippet, /Routing rules live in `rules\/ROUTING.md`/);
  assert.ok(!snippet.includes(project));
  assert.match(content(files, 'README.md'), /Rules location: project-relative/);
  assert.ok(!snippet.includes('Moved the folder?'));
});

test('#43 outside-project snippets and hooks carry an absolute-path relocation note', () => {
  const project = join(tmpdir(), 'rules-path-project');
  const dir = join(tmpdir(), 'external-rules');
  for (const id of ['claude-code', 'codex']) {
    const files = plan(project, dir, 2, id);
    const snippet = content(files, id === 'claude-code' ? 'CLAUDE.snippet.md' : 'AGENTS.snippet.md');
    assert.ok(snippet.includes(dir.replaceAll('\\', '/') + '/ROUTING.md'));
    assert.match(snippet, /Moved the folder\? Re-run the installer or set MODEL_ORCHESTRATOR_RULES_DIR/);
    assert.match(content(files, 'README.md'), /Rules location: absolute, because this folder is outside the project/);
    if (id === 'claude-code') {
      for (const hook of ['route-gate.mjs', 'subagent-context.mjs']) {
        assert.match(content(files, join('.claude', 'hooks', hook)), /\/\/ Moved the folder\? Re-run the installer or set MODEL_ORCHESTRATOR_RULES_DIR/);
      }
    }
  }
});

test('#43 moved hooks use the rules env override while telemetry keeps its home log', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-rules-move-'));
  try {
    const project = join(scratch, 'moved-project');
    const rules = join(project, 'moved-rules');
    const home = join(scratch, 'home');
    mkdirSync(rules, { recursive: true });
    mkdirSync(home);
    const env = { ...process.env, CLAUDE_PROJECT_DIR: project, HOME: home, USERPROFILE: home };
    for (const level of [1, 2]) {
      const routingFile = level === 1 ? 'ORCHESTRATOR.md' : 'ROUTING.md';
      writeFileSync(join(rules, routingFile), '<!-- route-gate:start -->\nMoved rules ' + level + '\n<!-- route-gate:end -->');
      const files = plan(join(scratch, 'old-project'), join(scratch, 'old-rules'), level);
      for (const override of [rules, 'moved-rules']) {
        for (const hook of ['route-gate.mjs', 'subagent-context.mjs', 'route-metrics.mjs']) {
          const hookPath = join(project, hook);
          writeFileSync(hookPath, content(files, join('.claude', 'hooks', hook)));
          const result = spawnSync(process.execPath, [hookPath], {
            encoding: 'utf8',
            input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'moved' }),
            env: { ...env, MODEL_ORCHESTRATOR_RULES_DIR: override }
          });
          assert.equal(result.status, 0, result.stderr);
          if (hook === 'route-gate.mjs') assert.match(JSON.parse(result.stdout).hookSpecificOutput.additionalContext, new RegExp('Moved rules ' + level));
          else if (hook === 'subagent-context.mjs') {
            const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
            assert.ok(context.includes(join(override, routingFile)));
            assert.ok(context.includes(join(override, 'TASK_BUNDLE.md')));
            assert.ok(!context.includes('old-rules'));
          } else {
            assert.equal(result.stdout, '');
            assert.match(readFileSync(join(home, '.ai-orchestrator', 'route-metrics.jsonl'), 'utf8'), /"event":"turn"/);
          }
        }
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
