// route-metrics.mjs (0.1.16): the third claude-code-only hook, wired to five events
// (UserPromptSubmit, PreToolUse on Agent|Task, SubagentStart, SubagentStop, Stop).
// Answers "is my agent actually routing and delegating?" by turning each event into
// one JSON line under ~/.ai-orchestrator/route-metrics.jsonl. Rendered the way the
// installer would (like route-gate.mjs and subagent-context.mjs in test/hooks.test.js),
// then spawned as the real file with a temp HOME/USERPROFILE so nothing here ever
// touches the real home directory.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, chmodSync, statSync, readdirSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { planFiles } from '../src/install.js';
import { byId } from '../src/catalog.js';

function renderedHook() {
  const p = planFiles({ level: 2, selected: [byId['claude-code']], primary: byId['claude-code'], dir: 'ai-orchestrator', project: '.' });
  const f = p.find((f) => f.rel === join('.claude', 'hooks', 'route-metrics.mjs'));
  assert.ok(f, 'route-metrics.mjs was not planned');
  return f.content;
}

function writeHook(dir) {
  const abs = join(dir, 'route-metrics.mjs');
  writeFileSync(abs, renderedHook());
  chmodSync(abs, 0o755);
  return abs;
}

function newHome() {
  return mkdtempSync(join(tmpdir(), 'orch-rm-home-'));
}

// Both HOME (POSIX) and USERPROFILE (Windows) point at the same temp dir, so
// os.homedir() resolves there on every OS this suite runs on.
function run(hookPath, home, inputObj, extraArgs = []) {
  const input = inputObj === undefined ? '' : typeof inputObj === 'string' ? inputObj : JSON.stringify(inputObj);
  return spawnSync('node', [hookPath, ...extraArgs], {
    input,
    encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home }
  });
}

function logPath(home) {
  return join(home, '.ai-orchestrator', 'route-metrics.jsonl');
}

function statePath(home) {
  return join(home, '.ai-orchestrator', 'route-metrics.state');
}

function readLog(home) {
  if (!existsSync(logPath(home))) return [];
  return readFileSync(logPath(home), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

test('route-metrics.mjs: UserPromptSubmit writes exactly one turn record, stdout empty, exit 0', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    const r = run(hookPath, home, { hook_event_name: 'UserPromptSubmit', session_id: 'sess-1' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', 'route-metrics.mjs must never print to stdout: it would become model context');
    const log = readLog(home);
    assert.equal(log.length, 1);
    assert.equal(log[0].event, 'turn');
    assert.equal(log[0].session_id, 'sess-1');
    assert.equal(log[0].v, 1);
    assert.match(log[0].ts, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'ts must be a UTC ISO timestamp');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: PreToolUse on Agent/Task writes dispatch with subagent_type default and background flag; other tools write nothing', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    let r = run(hookPath, home, { hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Task', tool_input: { subagent_type: 'builder', run_in_background: true } });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    let log = readLog(home);
    assert.equal(log.length, 1);
    assert.deepEqual({ event: log[0].event, subagent_type: log[0].subagent_type, background: log[0].background }, { event: 'dispatch', subagent_type: 'builder', background: true });

    r = run(hookPath, home, { hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Agent', tool_input: {} });
    assert.equal(r.status, 0);
    log = readLog(home);
    assert.equal(log.length, 2, 'a missing subagent_type must still log a dispatch, defaulted');
    assert.equal(log[1].subagent_type, 'general-purpose');
    assert.equal(log[1].background, false, 'run_in_background missing or not exactly true must record false');

    // A tool other than Agent/Task: the settings matcher should already exclude
    // this, but the hook defends itself too rather than trusting the matcher alone.
    r = run(hookPath, home, { hook_event_name: 'PreToolUse', session_id: 's', tool_name: 'Bash', tool_input: { subagent_type: 'builder' } });
    assert.equal(r.status, 0);
    assert.equal(readLog(home).length, 2, 'a non-Agent/Task tool_name must not be logged as a dispatch');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: SubagentStart writes start and a state file; SubagentStop computes duration_s from it and deletes it', async () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    let r = run(hookPath, home, { hook_event_name: 'SubagentStart', session_id: 's', agent_id: 'agent-abc', agent_type: 'builder' });
    assert.equal(r.status, 0);
    let log = readLog(home);
    assert.equal(log.length, 1);
    assert.equal(log[0].event, 'start');
    assert.equal(log[0].agent_type, 'builder');
    const stateFiles = statSync(statePath(home)).isDirectory() ? readdirSync(statePath(home)) : [];
    assert.equal(stateFiles.length, 1, 'SubagentStart must persist one state file keyed by sha256(agent_id)');
    assert.doesNotMatch(stateFiles[0], /agent-abc/, 'the state filename must be a hash of agent_id, not the raw id');

    await new Promise((resolve) => setTimeout(resolve, 120));
    r = run(hookPath, home, { hook_event_name: 'SubagentStop', session_id: 's', agent_id: 'agent-abc' });
    assert.equal(r.status, 0);
    log = readLog(home);
    assert.equal(log.length, 2);
    assert.equal(log[1].event, 'end');
    assert.equal(log[1].agent_type, 'builder');
    assert.ok(log[1].duration_s >= 0.1, 'duration_s must reflect the elapsed time since start: got ' + log[1].duration_s);
    assert.equal(readdirSync(statePath(home)).length, 0, 'the state file must be deleted on stop');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: SubagentStop with no agent_id or no matching state logs "end" with no duration_s', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    let r = run(hookPath, home, { hook_event_name: 'SubagentStop', session_id: 's' });
    assert.equal(r.status, 0);
    let log = readLog(home);
    assert.equal(log.length, 1);
    assert.equal(log[0].event, 'end');
    assert.ok(!('duration_s' in log[0]), 'no agent_id at all: duration_s must be absent, not null or 0');

    r = run(hookPath, home, { hook_event_name: 'SubagentStop', session_id: 's', agent_id: 'never-started' });
    assert.equal(r.status, 0);
    log = readLog(home);
    assert.equal(log.length, 2);
    assert.ok(!('duration_s' in log[1]), 'an agent_id with no state file: duration_s must be absent');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: Stop parses the LAST route marker, splits lanes on "+", strips disallowed characters, and never logs the "why" text or the raw message', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    const message = [
      'SECRET_PROMPT_MARKER some reasoning the model wrote',
      '<!-- route: builder | first pass, DISCARD_ME_WHY -->',
      'more text SECRET_PROMPT_MARKER',
      '<!-- route: deep-planner+code-reviewer | second and last, DISCARD_ME_WHY_TOO -->'
    ].join('\n');
    const r = run(hookPath, home, { hook_event_name: 'Stop', session_id: 's', last_assistant_message: message });
    assert.equal(r.status, 0);
    const raw = readFileSync(logPath(home), 'utf8');
    assert.doesNotMatch(raw, /SECRET_PROMPT_MARKER/, 'no text from the assistant message may reach the log');
    assert.doesNotMatch(raw, /DISCARD_ME_WHY/, 'the "why" half of the marker must never be logged, first or last marker');
    const log = readLog(home);
    assert.equal(log.length, 1);
    assert.equal(log[0].event, 'route');
    assert.deepEqual(log[0].lane, ['deep-planner', 'code-reviewer'], 'must take the LAST marker, and split it on "+"');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: a lane token with disallowed characters is logged as "invalid", never stripped into a lane nobody chose', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    const message = '<!-- route: builder";DROP TABLE x;--\n|inject | why --> then <!-- route: builder+main","evil":"1 | why -->';
    const r = run(hookPath, home, { hook_event_name: 'Stop', session_id: 's', last_assistant_message: message });
    assert.equal(r.status, 0);
    const log = readLog(home);
    assert.equal(log.length, 1);
    assert.deepEqual(log[0].lane, ['builder', 'invalid'], 'the clean token survives; the injected one becomes "invalid", not "mainevil1"');
    for (const lane of log[0].lane) assert.match(lane, /^[A-Za-z0-9_.-]+$/, 'a logged lane token must stay inside the declared charset');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: no marker at all logs lane ["missing"]', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    const r = run(hookPath, home, { hook_event_name: 'Stop', session_id: 's', last_assistant_message: 'no marker in this reply' });
    assert.equal(r.status, 0);
    const log = readLog(home);
    assert.deepEqual(log[0].lane, ['missing']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: an unknown event and garbage stdin both exit 0 with no record and empty stdout', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    let r = run(hookPath, home, { hook_event_name: 'PreCompact', session_id: 's' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(existsSync(logPath(home)), false, 'an unrecognized event must not even create the log file');

    r = run(hookPath, home, 'not valid json at all {{{');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(existsSync(logPath(home)), false, 'invalid JSON must log nothing');

    r = run(hookPath, home, '');
    assert.equal(r.status, 0);
    assert.equal(existsSync(logPath(home)), false, 'empty stdin must log nothing');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: an oversized stdin payload is treated as truncated and logs nothing', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    const pad = 'x'.repeat(9 * 1024 * 1024); // past the 8 MB size cap
    const r = run(hookPath, home, JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 's', pad }));
    assert.equal(r.status, 0);
    assert.equal(existsSync(logPath(home)), false, 'a payload past the size cap must not be parsed at all');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---- open stdin never closed: same class of fix route-gate.mjs and subagent-context.mjs prove in test/hooks.test.js ----
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
      reject(new Error('route-metrics.mjs did not exit within ' + killGuardMs + 'ms with stdin left open; stderr: ' + stderr));
    }, killGuardMs);
    child.on('exit', (code) => {
      clearTimeout(guard);
      resolve({ code, stdout, stderr, elapsedMs: Date.now() - started });
    });
    // Deliberately: no write, no .end() on child.stdin.
  });
}

test('route-metrics.mjs: an open, never-closed stdin pipe still exits within 1.5s with empty stdout', async () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    const { code, stdout, elapsedMs } = await runWithOpenStdin(hookPath, { HOME: home, USERPROFILE: home });
    assert.equal(code, 0);
    assert.equal(stdout, '');
    assert.ok(elapsedMs < 1500, 'route-metrics.mjs took ' + elapsedMs + 'ms to exit with stdin left open; expected under 1.5s');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: the log rotates to .1 once it passes the size cap', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    mkdirSync(join(home, '.ai-orchestrator'), { recursive: true });
    // One line repeated past 5 MB, written directly so the test does not need
    // thousands of subprocess spawns to reach the cap.
    const line = JSON.stringify({ ts: '2026-01-01T00:00:00.000Z', v: 1, event: 'turn', session_id: 's' }) + '\n';
    const target = 5 * 1024 * 1024 + line.length * 2;
    writeFileSync(logPath(home), line.repeat(Math.ceil(target / line.length)));
    assert.ok(statSync(logPath(home)).size > 5 * 1024 * 1024);

    const r = run(hookPath, home, { hook_event_name: 'UserPromptSubmit', session_id: 'after-rotation' });
    assert.equal(r.status, 0);
    assert.ok(existsSync(logPath(home) + '.1'), 'the oversized log must be rotated to .1');
    assert.ok(statSync(logPath(home) + '.1').size > 5 * 1024 * 1024);
    const freshLog = readLog(home);
    assert.equal(freshLog.length, 1, 'the live log must start fresh after rotation, holding only the record that triggered it');
    assert.equal(freshLog[0].session_id, 'after-rotation');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs: SubagentStart prunes state files older than 24h and keeps fresh ones', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    const dir = statePath(home);
    mkdirSync(dir, { recursive: true });
    const old = join(dir, 'old.json');
    const fresh = join(dir, 'fresh.json');
    writeFileSync(old, '{}');
    writeFileSync(fresh, '{}');
    const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
    utimesSync(old, oldTime, oldTime);

    const r = run(hookPath, home, { hook_event_name: 'SubagentStart', session_id: 's', agent_id: 'x', agent_type: 'builder' });
    assert.equal(r.status, 0);
    const remaining = readdirSync(dir);
    assert.ok(!remaining.includes('old.json'), 'a state file older than 24h must be pruned');
    assert.ok(remaining.includes('fresh.json'), 'a fresh state file must survive pruning');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ---- --summary ----

test('route-metrics.mjs --summary: prints "no data yet" when the log does not exist, exit 0', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    const r = spawnSync('node', [hookPath, '--summary'], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /no data yet/i);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('route-metrics.mjs --summary: computes turns, coverage, lanes, dispatches and durations from a fixture log', () => {
  const home = newHome();
  const hookPath = writeHook(home);
  try {
    mkdirSync(join(home, '.ai-orchestrator'), { recursive: true });
    const ts = '2026-01-01T00:00:00.000Z';
    const records = [
      { ts, v: 1, event: 'turn', session_id: 's' },
      { ts, v: 1, event: 'turn', session_id: 's' },
      { ts, v: 1, event: 'route', session_id: 's', lane: ['builder'] },
      { ts, v: 1, event: 'route', session_id: 's', lane: ['missing'] },
      { ts, v: 1, event: 'dispatch', session_id: 's', subagent_type: 'builder', background: false },
      { ts, v: 1, event: 'dispatch', session_id: 's', subagent_type: 'builder', background: false },
      { ts, v: 1, event: 'dispatch', session_id: 's', subagent_type: 'code-reviewer', background: true },
      { ts, v: 1, event: 'start', session_id: 's', agent_type: 'builder' },
      { ts, v: 1, event: 'end', session_id: 's', agent_type: 'builder', duration_s: 2 },
      { ts, v: 1, event: 'end', session_id: 's', agent_type: 'builder', duration_s: 4 }
    ];
    writeFileSync(logPath(home), records.map((r) => JSON.stringify(r)).join('\n') + '\n');

    const r = spawnSync('node', [hookPath, '--summary'], { encoding: 'utf8', env: { ...process.env, HOME: home, USERPROFILE: home } });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /turns: 2/);
    assert.match(r.stdout, /50(\.00)?%/, 'coverage must be 1 non-missing route out of 2 turns = 50%');
    assert.match(r.stdout, /builder: 1/);
    assert.match(r.stdout, /builder: 2/, 'two dispatches for builder');
    assert.match(r.stdout, /code-reviewer: 1/);
    assert.match(r.stdout, /dispatches with no matching start: 2/, '3 dispatches minus 1 start = 2');
    assert.match(r.stdout, /builder: 3(\.00)? \/ 4(\.00)?/, 'mean of 2 and 4 is 3, max is 4');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
