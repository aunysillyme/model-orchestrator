// route-gate.mjs and subagent-context.mjs are the two delegate-by-default (0.1.15)
// claude-code-only hooks. Both are rendered templates, not copied raw like
// bin/cli-run.mjs, so these tests render them the way the installer would
// and then spawn the real file: a syntax or logic bug in the render vars
// would otherwise only surface once a user actually ran Claude Code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, openSync, writeSync, ftruncateSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
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

// ---- pre-release audit finding 1: hang + unbounded read (fixed) ----

// Spawns the hook with stdin left OPEN (never written to, never closed) and
// measures the wall-clock time to exit. A bare `readFileSync(0)` hangs here
// forever; this is the exact shape of the reported repro (`sleep 3 | ...
// node route-gate.mjs` still running at 1.5s). The kill guard is a generous
// safety net so a regression fails the assertion below rather than hanging
// the test run; it is deliberately much larger than the hook's own 250ms
// stdin-drain cap so ordinary scheduling jitter under a loaded CI box never
// races the guard itself.
function runWithOpenStdin(hookPath, env, killGuardMs = 5000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn('node', [hookPath], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const guard = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('hook did not exit within ' + killGuardMs + 'ms with stdin left open; stderr: ' + stderr));
    }, killGuardMs);
    child.on('exit', (code) => {
      clearTimeout(guard);
      resolve({ code, stdout, stderr, elapsedMs: Date.now() - started });
    });
    // Deliberately: no write, no .end() on child.stdin. The pipe stays open,
    // exactly like a caller that never sends EOF.
  });
}

test('route-gate.mjs: an open, never-closed stdin pipe still exits within 1s with valid JSON', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  const project = mkdtempSync(join(tmpdir(), 'orch-proj-'));
  try {
    const hookPath = writeHook(scratch, 'route-gate.mjs', renderedHook('route-gate.mjs'));
    writeRules(project, '<!-- route-gate:start -->\ntable\n<!-- route-gate:end -->\n');
    const { code, stdout, elapsedMs } = await runWithOpenStdin(hookPath, { CLAUDE_PROJECT_DIR: project });
    assert.equal(code, 0);
    assert.ok(elapsedMs < 1000, 'route-gate.mjs took ' + elapsedMs + 'ms to exit with stdin left open; expected under 1s');
    const out = JSON.parse(stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('subagent-context.mjs: an open, never-closed stdin pipe still exits within 1s with valid JSON', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  try {
    const hookPath = writeHook(scratch, 'subagent-context.mjs', renderedHook('subagent-context.mjs'));
    const { code, stdout, elapsedMs } = await runWithOpenStdin(hookPath, {});
    assert.equal(code, 0);
    assert.ok(elapsedMs < 1000, 'subagent-context.mjs took ' + elapsedMs + 'ms to exit with stdin left open; expected under 1s');
    const out = JSON.parse(stdout);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SubagentStart');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('route-gate.mjs: a FIFO at the rules path gives a fallback without hanging', { skip: process.platform === 'win32' ? 'no mkfifo on Windows' : false }, () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  const project = mkdtempSync(join(tmpdir(), 'orch-proj-'));
  try {
    const hookPath = writeHook(scratch, 'route-gate.mjs', renderedHook('route-gate.mjs'));
    const rulesDir = join(project, RULES_SUBDIR);
    mkdirSync(rulesDir, { recursive: true });
    const fifoPath = join(rulesDir, 'ROUTING.md');
    execFileSync('mkfifo', [fifoPath]);
    // Nothing ever opens the write end of this FIFO. Opening it for read
    // (what a naive readFileSync would do) blocks until a writer shows up,
    // which is exactly the hang this fix exists to avoid: statSync + isFile()
    // must refuse it before any open/read call touches it.
    const r = spawnSync('node', [hookPath], { input: '', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: project }, timeout: 3000 });
    assert.notEqual(r.signal, 'SIGTERM', 'the hook was killed for exceeding the timeout: it hung on the FIFO');
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /not a regular file/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

// The same !isFile() guard, through the one non-regular file EVERY OS has. The FIFO case above is
// the only one that can prove the HANG (a naive readFileSync on a writer-less FIFO blocks forever,
// and Windows has no mkfifo to build one), but the guard itself is not POSIX-specific, and before
// this test nothing exercised it on Windows at all. A directory also reaches it before any open or
// read call, so this runs unconditionally and the win32 skip above is no longer the only coverage.
test('route-gate.mjs: a directory at the rules path gives the same fallback, on every OS', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  const project = mkdtempSync(join(tmpdir(), 'orch-proj-'));
  try {
    const hookPath = writeHook(scratch, 'route-gate.mjs', renderedHook('route-gate.mjs'));
    mkdirSync(join(project, RULES_SUBDIR, 'ROUTING.md'), { recursive: true });
    const r = spawnSync('node', [hookPath], { input: '', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: project }, timeout: 3000 });
    assert.notEqual(r.signal, 'SIGTERM', 'the hook was killed for exceeding the timeout');
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /not a regular file/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});

test('route-gate.mjs: a 200 MB sparse rules file still completes fast with bounded output', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'orch-hook-'));
  const project = mkdtempSync(join(tmpdir(), 'orch-proj-'));
  try {
    const hookPath = writeHook(scratch, 'route-gate.mjs', renderedHook('route-gate.mjs'));
    const rulesDir = join(project, RULES_SUBDIR);
    mkdirSync(rulesDir, { recursive: true });
    const rulesPath = join(rulesDir, 'ROUTING.md');
    // Real content lives in the first bytes (inside the 64 KB read window);
    // ftruncate then grows the file's reported length to 200 MB without
    // writing 200 MB of data, so a fix that still reads the "whole file"
    // would either allocate ~200 MB or take much longer than a bounded read.
    const fd = openSync(rulesPath, 'w');
    writeSync(fd, '<!-- route-gate:start -->\ntable\n<!-- route-gate:end -->\n');
    ftruncateSync(fd, 200 * 1024 * 1024);
    closeSync(fd);
    const start = Date.now();
    const r = spawnSync('node', [hookPath], { input: '', encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: project }, timeout: 5000 });
    const elapsed = Date.now() - start;
    assert.notEqual(r.signal, 'SIGTERM', 'the hook was killed for exceeding the timeout on a 200 MB file');
    assert.equal(r.status, 0);
    assert.ok(elapsed < 5000, 'a bounded read must not scale with file size');
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /route-gate:start/);
    assert.ok(out.hookSpecificOutput.additionalContext.length < 5000, 'the injected context must stay bounded regardless of on-disk file size');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  }
});
