import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { judgeGrok, judgeCodex, judgeAgy, judgeHermes, judgeQwen, judge, buildArgv, REASONS, checkContracts, snapshotFile, LANE_FLAGS, badRouteValue, resolveRoute, laneConfig, enabledLanes, LANES } from '../bin/cli-run.mjs';

const ok = (r) => assert.ok(r.text, 'expected a deliverable, got: ' + r.detail);
const no = (r, why) => assert.equal(r.text, null, 'expected refusal (' + why + '), got text: ' + JSON.stringify(r.text));

// --- grok ---
test('grok: end_turn with text is a deliverable', () => ok(judgeGrok(0, JSON.stringify({ stopReason: 'end_turn', text: 'hello' }))));
test('grok: cancelled stopReason is refused', () => no(judgeGrok(0, JSON.stringify({ stopReason: 'cancelled', text: 'hello' })), 'cancelled'));
test('grok: end_turn with empty text is refused', () => no(judgeGrok(0, JSON.stringify({ stopReason: 'end_turn', text: '   ' })), 'empty'));
test('grok: non-JSON stdout is refused', () => no(judgeGrok(0, 'not json'), 'non-json'));
test('grok: JSON array is refused', () => no(judgeGrok(0, '[1]'), 'array'));

// --- codex ---
const completed = '{"type":"thread.started"}\n{"type":"turn.completed"}\n';
test('codex: turn.completed with non-empty -o file is a deliverable', () => ok(judgeCodex(0, completed, '', 'findings')));
test('codex: missing terminal event is refused', () => no(judgeCodex(0, '{"type":"turn.started"}\n', '', 'findings'), 'no terminal'));
test('codex: terminal event with empty -o file is refused', () => no(judgeCodex(0, completed, '', ''), 'empty file'));
test('codex: garbage lines between events are ignored', () => ok(judgeCodex(0, 'noise\n{bad json\n' + completed, '', 'x')));

// --- agy ---
const agyOk = '{"event":"init"}\n{"event":"result","result":{"status":"SUCCESS","response":"done"}}\n';
test('agy: SUCCESS with response is a deliverable', () => ok(judgeAgy(0, agyOk)));
test('agy: no result event is refused', () => no(judgeAgy(0, '{"event":"init"}\n'), 'no result'));
test('agy: status ERROR is refused', () => no(judgeAgy(0, '{"event":"result","result":{"status":"ERROR","response":"x"}}'), 'error'));
test('agy: SUCCESS with empty response is refused', () => no(judgeAgy(0, '{"event":"result","result":{"status":"SUCCESS","response":""}}'), 'empty'));
test('agy: result that is not an object is refused', () => no(judgeAgy(0, '{"event":"result","result":"nope"}'), 'non-object'));

// --- hermes ---
test('hermes: exit 0 with stdout is a deliverable', () => ok(judgeHermes(0, 'answer', '')));
test('hermes: exit 1 is refused', () => no(judgeHermes(1, '', ''), 'exit 1'));
test('hermes: exit 2 is refused', () => no(judgeHermes(2, '', 'bad args'), 'exit 2'));
test('hermes: exit 0 with empty stdout is refused', () => no(judgeHermes(0, '  \n', ''), 'empty'));

// --- qwen: the lane whose own success flags lie ---
const qwenEvent = (over = {}) =>
  JSON.stringify([
    { type: 'system' },
    { type: 'result', subtype: 'success', is_error: false, result: 'OK', stats: { models: { m: { api: { totalErrors: 0 } } } }, ...over }
  ]);
test('qwen: success with clean telemetry is a deliverable', () => ok(judgeQwen(0, qwenEvent())));
test('qwen: subtype error is refused', () => no(judgeQwen(0, qwenEvent({ subtype: 'error', error: { message: 'boom' } })), 'subtype'));
test('qwen: is_error true is refused', () => no(judgeQwen(0, qwenEvent({ is_error: true })), 'is_error'));
test('qwen: empty result is refused', () => no(judgeQwen(0, qwenEvent({ result: '' })), 'empty'));
test('qwen: LIE 1: result is an [API Error: …] string under a success flag', () => no(judgeQwen(0, qwenEvent({ result: '[API Error: 400 grammar]' })), 'api error prefix'));
test('qwen: LIE 2: totalErrors > 0 under a success flag', () => no(judgeQwen(0, qwenEvent({ stats: { models: { m: { api: { totalErrors: 2 } } } } })), 'totalErrors'));
test('qwen: absent stats.models is an unknown, not a zero', () => no(judgeQwen(0, qwenEvent({ stats: {} })), 'absent telemetry'));
test('qwen: unreadable totalErrors is refused', () => no(judgeQwen(0, qwenEvent({ stats: { models: { m: { api: {} } } } })), 'unreadable'));
// malformed payloads must return a verdict, never throw
for (const [label, payload] of [
  ['null element', '[null]'],
  ['number element', '[1]'],
  ['nested array', '[[]]'],
  ['non-string result', qwenEvent({ result: 42 })],
  ['non-dict stats', qwenEvent({ stats: 'x' })],
  ['empty array', '[]'],
  ['not json', 'nope'],
  ['object not array', '{"type":"result"}']
]) {
  test(`qwen: malformed payload (${label}) returns a refusal instead of throwing`, () => {
    let r;
    assert.doesNotThrow(() => (r = judgeQwen(0, payload)));
    no(r, label);
  });
}

// --- dispatch + argv ---
test('judge() dispatches by lane name', () => {
  ok(judge('grok', 0, JSON.stringify({ stopReason: 'end_turn', text: 'x' }), ''));
  assert.throws(() => judge('nope', 0, '', ''));
});
test('buildArgv: codex --audit adds a read-only sandbox', () => {
  const { argv } = buildArgv('codex', '/bin/codex', 'p', { timeout: 60, audit: true }, '/tmp');
  assert.ok(argv.includes('--sandbox') && argv.includes('read-only'));
  assert.equal(argv[argv.length - 1], 'p');
});
test('buildArgv: qwen flags are only added when set', () => {
  assert.deepEqual(buildArgv('qwen', '/bin/qwen', 'p', { timeout: 60 }, '/tmp').argv, ['/bin/qwen', '-o', 'json', '-p', 'p']);
  const { argv } = buildArgv('qwen', '/bin/qwen', 'p', { timeout: 60, model: 'm', safeMode: true }, '/tmp');
  assert.ok(argv.includes('-m') && argv.includes('m') && argv.includes('--safe-mode'));
});
test('buildArgv: agy print-timeout is rounded minutes, never zero', () => {
  assert.ok(buildArgv('agy', '/bin/agy', 'p', { timeout: 10 }, '/tmp').argv.includes('1m'));
  assert.ok(buildArgv('agy', '/bin/agy', 'p', { timeout: 900 }, '/tmp').argv.includes('15m'));
});

// --- the harness can go red: a judge that accepts everything must fail this suite's shape ---
test('self-check: an accept-everything judge is caught', () => {
  const noop = () => ({ text: 'always', detail: 'noop' });
  assert.throws(() => no(noop(0, '[null]'), 'noop'));
});

// ---- audit round 2: bounded scanning on large output ----
test('agy/codex judges find the terminal event in a large stream and refuse when it is absent', () => {
  const filler = '{"event":"step_update","data":"' + 'x'.repeat(2000) + '"}\n';
  const big = filler.repeat(4000) + '{"event":"result","result":{"status":"SUCCESS","response":"done"}}\n';
  ok(judgeAgy(0, big));
  ok(judgeCodex(0, filler.replace('step_update', 'item.completed').repeat(4000) + '{"type":"turn.completed"}\n', '', 'findings'));
  no(judgeAgy(0, filler.repeat(10)), 'no terminal event in a large stream');
  // a single absurdly long line is skipped, not parsed
  no(judgeAgy(0, '{"event":"result","result":{"status":"SUCCESS","response":"' + 'y'.repeat(1_100_000) + '"}}\n'), 'oversized line skipped');
});


// ---- issue #4: every judge returns a FIXED reason code, and provider values stay out of it ----
test('every judge failure carries a reason from the fixed set, and no provider marker reaches it', () => {
  const cases = [
    judgeGrok(0, JSON.stringify({ stopReason: 'MARKER_A', text: 'x' })),
    judgeGrok(0, 'MARKER_B not json'),
    judgeAgy(0, '{"event":"result","result":{"status":"MARKER_C","response":"x"}}'),
    judgeQwen(0, JSON.stringify([{ type: 'MARKER_D' }])),
    judgeQwen(0, JSON.stringify([{ type: 'result', subtype: 'MARKER_E', error: { message: 'MARKER_F' } }])),
    judgeQwen(0, JSON.stringify([{ type: 'result', subtype: 'success', is_error: false, result: '[API Error: MARKER_G]', stats: { models: { m: { api: { totalErrors: 0 } } } } }])),
    judgeQwen(0, JSON.stringify([{ type: 'result', subtype: 'success', is_error: false, result: 'ok', stats: { models: { MARKER_H: { api: { totalErrors: 3 } } } } }])),
    judgeHermes(2, '', 'MARKER_I'),
    judgeCodex(0, 'MARKER_J', '', '')
  ];
  for (const c of cases) {
    assert.equal(c.text, null);
    assert.ok(REASONS.has(c.reason), 'reason not in the fixed set: ' + c.reason);
    assert.doesNotMatch(c.reason, /MARKER_/, 'a provider value reached the reason code');
  }
  assert.equal(judgeGrok(0, JSON.stringify({ stopReason: 'end_turn', text: 'hi' })).reason, 'ok');
});

// ---- issue #5: contracts ----
test('checkContracts: refusal text fails --expect-json; a missing, empty or stale file fails --expect-file', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const d = mkdtempSync(join(tmpdir(), 'orch-contract-'));
  assert.match(checkContracts({ expectJson: true }, 'I cannot create that file.', null), /not valid JSON/);
  assert.equal(checkContracts({ expectJson: true }, '{"a":1}', null), null);
  assert.match(checkContracts({ expectFile: join(d, 'nope.md') }, 'x', { exists: false }), /does not exist/);
  writeFileSync(join(d, 'empty.md'), '');
  assert.match(checkContracts({ expectFile: join(d, 'empty.md') }, 'x', { exists: false }), /empty/);
  // existed before, untouched: fails regardless of age
  writeFileSync(join(d, 'same.md'), 'old');
  const beforeSame = snapshotFile(join(d, 'same.md'));
  assert.match(checkContracts({ expectFile: join(d, 'same.md') }, 'x', beforeSame), /existed before the run and was not changed/);
  // existed before, rewritten with new content: passes
  writeFileSync(join(d, 'same.md'), 'new content');
  assert.equal(checkContracts({ expectFile: join(d, 'same.md') }, 'x', beforeSame), null);
  // did not exist before, exists now: passes
  writeFileSync(join(d, 'fresh.md'), 'new');
  assert.equal(checkContracts({ expectFile: join(d, 'fresh.md') }, 'x', { exists: false }), null);
  rmSync(d, { recursive: true, force: true });
});

test('#17: --expect-json accepts JSON wrapped in one markdown fence, still refuses prose around it and non-JSON', async () => {
  const { checkContracts, unfence } = await import('../bin/cli-run.mjs');
  assert.equal(checkContracts({ expectJson: true }, '```json\n{"status":"ok"}\n```', null), null);
  assert.equal(checkContracts({ expectJson: true }, '```\n{"a":1}\n```', null), null);
  assert.equal(checkContracts({ expectJson: true }, '```json\r\n{"a":1}\r\n```', null), null, 'CRLF fences');
  assert.equal(checkContracts({ expectJson: true }, '{"a":1}', null), null);
  assert.match(checkContracts({ expectJson: true }, 'Here you go:\n```json\n{"a":1}\n```', null), /not valid JSON/);
  assert.match(checkContracts({ expectJson: true }, '```json\n{"a":1}\n```\nHope that helps', null), /not valid JSON/);
  assert.match(checkContracts({ expectJson: true }, '```json\nnot json\n```', null), /not valid JSON/);
  assert.equal(unfence('```json\n{"a":1}\n```'), '{"a":1}');
  assert.equal(unfence('plain'), 'plain');
});

test('#18: killTree uses taskkill /T /F on win32 and the negative-pid group kill elsewhere', async () => {
  const { killTree, taskkillPath } = await import('../bin/cli-run.mjs');
  const calls = [];
  const deps = { kill: (p, sig) => calls.push(['kill', p, sig]), spawn: (cmd, args) => calls.push(['spawn', cmd, args]) };
  assert.equal(killTree(4242, 'win32', deps), 'taskkill');
  assert.deepEqual(calls, [['spawn', taskkillPath(), ['/pid', '4242', '/T', '/F']]]);
  calls.length = 0;
  assert.equal(killTree(4242, 'linux', deps), 'group');
  assert.deepEqual(calls, [['kill', -4242, 'SIGKILL']]);
  calls.length = 0;
  assert.equal(killTree(4242, 'darwin', deps), 'group');
  assert.deepEqual(calls, [['kill', -4242, 'SIGKILL']]);
});

// windows-latest CI (proof this test now catches): killTree's spawn('taskkill', ...)
// used a bare command name, which depends on PATH containing System32.
// This project's own test harness deliberately narrows PATH to isolate a fake
// lane, so a real end-to-end run hit `spawn taskkill ENOENT` the first time
// lane execution actually reached Windows: an unheard 'error' event on the
// returned ChildProcess crashed the whole wrapper over what should be a
// best-effort cleanup step. Reproduced here without needing win32 at all: an
// env with no SystemRoot/windir falls back to a fixed path, and a deliberately
// broken deps.spawn (one that returns an EventEmitter and asynchronously
// emits 'error', exactly like a real ENOENT spawn) must not crash this
// process either.
test('taskkillPath: resolves under SystemRoot, falls back through windir to a fixed path', async () => {
  const { taskkillPath } = await import('../bin/cli-run.mjs');
  assert.equal(taskkillPath({ SystemRoot: 'C:\\Windows' }), 'C:\\Windows\\System32\\taskkill.exe');
  assert.equal(taskkillPath({ windir: 'C:\\WINNT' }), 'C:\\WINNT\\System32\\taskkill.exe');
  assert.equal(taskkillPath({}), 'C:\\Windows\\System32\\taskkill.exe');
});

test('killTree: a spawn failure (ENOENT-shaped) on win32 never crashes the process', async () => {
  const { EventEmitter } = await import('node:events');
  const { killTree } = await import('../bin/cli-run.mjs');
  const fakeChild = new EventEmitter();
  const deps = { kill: () => {}, spawn: () => fakeChild };
  assert.equal(killTree(4242, 'win32', deps), 'taskkill');
  // Before the fix, this emit would throw (Node's default behavior for an
  // 'error' event with no listener), because killTree never attached one.
  assert.doesNotThrow(() => fakeChild.emit('error', Object.assign(new Error('spawn taskkill ENOENT'), { code: 'ENOENT' })));
});

// --- Windows: resolving a .cmd shim, and the cmd.exe fallback's escaping -----
// resolveCmdShim/windowsSpawnPlan are pure string logic (no real spawn), so
// this is exercised on every CI host, not only win32; the platform parameter
// on windowsSpawnPlan is the same testability pattern killTree above uses.
test('resolveCmdShim: parses the shape npm cmd-shim writes, and only that shape', async () => {
  const { resolveCmdShim } = await import('../bin/cli-run.mjs');
  const d = mkdtempSync(join(tmpdir(), 'orch-shim-'));
  const js = join(d, 'grok.js');
  writeFileSync(js, 'console.log("hi")');
  const shim = join(d, 'grok.cmd');
  writeFileSync(
    shim,
    '@ECHO off\r\nSETLOCAL\r\nSET "dp0=%~dp0"\r\nIF EXIST "%dp0%node.exe" (\r\n  SET "_prog=%dp0%node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n)\r\n"%_prog%" "%dp0%grok.js" %*\r\n'
  );
  assert.equal(resolveCmdShim(shim), js);
  // %~dp0% (with the tilde) is the other spelling cmd-shim has used.
  writeFileSync(shim, '"%_prog%"  "%~dp0%grok.js" %*\r\n');
  assert.equal(resolveCmdShim(shim), js);
  // a target that does not exist: never resolved to a path nothing can run.
  writeFileSync(shim, '"%_prog%" "%dp0%missing.js" %*\r\n');
  assert.equal(resolveCmdShim(shim), null);
  // a shim for a non-node binary (no %dp0%-relative js target): falls through.
  writeFileSync(shim, '"%_prog%" "C:\\Program Files\\Foo\\foo.exe" %*\r\n');
  assert.equal(resolveCmdShim(shim), null);
  // not a cmd-shim at all: a hand-written batch file.
  writeFileSync(shim, '@echo off\r\necho hello\r\n');
  assert.equal(resolveCmdShim(shim), null);
  // the file does not exist.
  assert.equal(resolveCmdShim(join(d, 'nope.cmd')), null);
  rmSync(d, { recursive: true, force: true });
});

// This is the ACTUAL, byte-for-byte output of npm's own `cmd-shim@9.0.2`
// package (the tool `npm install -g` itself uses to write a .cmd for a
// package.json "bin" entry with a "#!/usr/bin/env node" shebang), captured
// by running cmdShim('lib/cli.js', 'grok') and reading grok.cmd back. Not a
// hand-typed guess at the shape: proof this parser handles what a real
// Windows install actually has on disk, including the "set PATHEXT=..." and
// "endLocal & goto ..." prefix on the same line as "%_prog%", which a
// simplified fixture would not exercise.
const REAL_NPM_CMD_SHIM = '@ECHO off\r\n'
  + 'GOTO start\r\n'
  + ':find_dp0\r\n'
  + 'SET dp0=%~dp0\r\n'
  + 'EXIT /b\r\n'
  + ':start\r\n'
  + 'SETLOCAL\r\n'
  + 'CALL :find_dp0\r\n'
  + '\r\n'
  + 'IF EXIST "%dp0%\\node.exe" (\r\n'
  + '  SET "_prog=%dp0%\\node.exe"\r\n'
  + ') ELSE (\r\n'
  + '  SET "_prog=node"\r\n'
  + ')\r\n'
  + '\r\n'
  + 'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"  "%dp0%\\lib\\cli.js" %*\r\n';

test('resolveCmdShim: resolves the real, byte-for-byte output of npm cmd-shim@9.0.2', async () => {
  const { resolveCmdShim } = await import('../bin/cli-run.mjs');
  const d = mkdtempSync(join(tmpdir(), 'orch-realshim-'));
  mkdirSync(join(d, 'lib'), { recursive: true });
  const js = join(d, 'lib', 'cli.js');
  writeFileSync(js, '#!/usr/bin/env node\nconsole.log("hi")\n');
  const shim = join(d, 'grok.cmd');
  writeFileSync(shim, REAL_NPM_CMD_SHIM);
  assert.equal(resolveCmdShim(shim), js);
  rmSync(d, { recursive: true, force: true });
});

test('windowsSpawnPlan: POSIX and a plain .exe/extensionless binary on win32 pass through with no shell', async () => {
  const { windowsSpawnPlan } = await import('../bin/cli-run.mjs');
  for (const platform of ['darwin', 'linux']) {
    const p = windowsSpawnPlan(['/bin/grok', '-p', 'hi'], platform);
    assert.deepEqual(p, { command: '/bin/grok', args: ['-p', 'hi'], options: {} });
  }
  const exe = windowsSpawnPlan(['C:\\bin\\grok.exe', '-p', 'hi'], 'win32');
  assert.deepEqual(exe, { command: 'C:\\bin\\grok.exe', args: ['-p', 'hi'], options: {} });
  const bare = windowsSpawnPlan(['C:\\bin\\grok', '-p', 'hi'], 'win32');
  assert.deepEqual(bare, { command: 'C:\\bin\\grok', args: ['-p', 'hi'], options: {} });
});

test('windowsSpawnPlan: a resolvable .cmd shim spawns node directly on the underlying script, no shell', async () => {
  const { windowsSpawnPlan } = await import('../bin/cli-run.mjs');
  const d = mkdtempSync(join(tmpdir(), 'orch-shimplan-'));
  const js = join(d, 'grok.js');
  writeFileSync(js, 'console.log("hi")');
  const shim = join(d, 'grok.cmd');
  writeFileSync(shim, '"%_prog%" "%dp0%grok.js" %*\r\n');
  const p = windowsSpawnPlan([shim, '-p', 'a prompt with spaces & a pipe |'], 'win32');
  assert.equal(p.command, process.execPath);
  assert.deepEqual(p.args, [js, '-p', 'a prompt with spaces & a pipe |'], 'the prompt reaches node argv untouched: no shell, nothing to escape');
  assert.deepEqual(p.options, {});
  rmSync(d, { recursive: true, force: true });
});

test('windowsSpawnPlan: a lane whose .cmd cannot be resolved is refused, never run through cmd.exe', async () => {
  const { windowsSpawnPlan } = await import('../bin/cli-run.mjs');
  // Same unresolvable path as below. Without an explicit opt-in there is no
  // command at all: a prompt must never reach cmd.exe, escaped or not.
  const p = windowsSpawnPlan(['C:\\bin\\oldtool.cmd', 'say "hi" & bye | cmd'], 'win32');
  assert.equal(p.command, undefined, 'no spawn target for a lane');
  assert.equal(p.args, undefined);
  assert.match(p.refuse, /not a standard npm shim/);
  assert.match(p.refuse, /never passes a prompt through cmd\.exe/);
});

test('windowsSpawnPlan: an unresolvable .cmd falls back to cmd.exe with the documented caret-escaping, verbatim, only when the caller opts in', async () => {
  const { windowsSpawnPlan } = await import('../bin/cli-run.mjs');
  // A literal, non-existent path: resolveCmdShim's readFileSync fails inside
  // it exactly as it would for a real .cmd whose content does not match the
  // npm cmd-shim shape, so this exercises the same fallback either way,
  // without depending on this host's own temp-directory naming.
  const shim = 'C:\\bin\\oldtool.cmd';
  const p = windowsSpawnPlan([shim, 'say "hi" & bye | cmd'], 'win32', { allowCmdFallback: true });
  assert.equal(p.command, process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(p.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.deepEqual(p.options, { windowsVerbatimArguments: true }, 'Node must not re-quote a command line this function already built');
  // Exact strings from the algorithm documented at https://qntm.org/cmd
  // (quote for CommandLineToArgvW, then caret-escape cmd.exe's own
  // metacharacters in that quoted text), computed once with node itself
  // and pinned here so a change to the escaping logic is a visible diff.
  assert.equal(p.args[3], '^"C:\\bin\\oldtool.cmd^" ^"say^ \\^"hi\\^"^ ^&^ bye^ ^|^ cmd^"');
});

test('windowsSpawnPlan cmd.exe fallback: caret, percent, trailing backslash and a literal newline each escape correctly', async () => {
  const { windowsSpawnPlan } = await import('../bin/cli-run.mjs');
  const bin = 'C:\\bin\\oldtool.cmd';
  const argOf = (arg) => windowsSpawnPlan([bin, arg], 'win32', { allowCmdFallback: true }).args[3].split(' ').slice(1).join(' ');
  assert.equal(argOf('caret^test'), '^"caret^^test^"');
  assert.equal(argOf('percent%VAR%end'), '^"percent^%VAR^%end^"');
  assert.equal(argOf('trailing\\'), '^"trailing\\\\^"');
  assert.equal(argOf('quote\\"end'), '^"quote\\\\\\^"end^"');
  assert.equal(argOf('line1\nline2'), '^"line1\nline2^"', 'a literal newline is not a cmd.exe metacharacter; it is neither doubled nor dropped');
});

// --- route: model and effort reach the lane in that vendor's own spelling -----
// Each expectation here was read from the vendor's --help, not remembered. If a
// vendor renames a flag, this is the test that should go red.
const argvOf = (lane, opts) => buildArgv(lane, '/bin/' + lane, 'PROMPT', { timeout: 900, ...opts }, '/tmp/x').argv;

test('route: every lane takes a model in its own spelling', () => {
  assert.deepEqual(argvOf('grok', { model: 'grok-4.1' }).slice(0, 5), ['/bin/grok', '--output-format', 'json', '-m', 'grok-4.1']);
  assert.ok(argvOf('codex', { model: 'gpt-6-astra' }).includes('-m'));
  assert.ok(argvOf('agy', { model: 'pro' }).includes('--model'));
  assert.ok(argvOf('hermes', { model: 'x' }).includes('-m'));
  assert.ok(argvOf('qwen', { model: 'qwen3.7-flash' }).includes('-m'));
});

test('route: effort uses each vendor flag, and codex gets a quoted TOML override', () => {
  assert.ok(argvOf('grok', { effort: 'high' }).includes('--reasoning-effort'));
  assert.ok(argvOf('agy', { effort: 'high' }).includes('--effort'));
  assert.ok(argvOf('hermes', { effort: 'minimal' }).includes('--reasoning'));
  const cx = argvOf('codex', { effort: 'high' });
  assert.ok(cx.includes('-c'), 'codex takes reasoning effort as a config override');
  assert.ok(cx.includes('model_reasoning_effort="high"'), 'the TOML value must stay quoted or codex cannot parse it');
});

test('route: qwen has no effort flag and never grows one silently', () => {
  assert.equal(LANE_FLAGS.qwen.effort, null);
  const a = argvOf('qwen', { effort: 'high' });
  assert.ok(!a.includes('--effort') && !a.includes('--reasoning'), 'an unsupported effort must not be invented');
});

test('route: flags go in front of a positional prompt', () => {
  // hermes and codex take the prompt positionally; a flag after it is lost.
  const h = argvOf('hermes', { model: 'm' });
  assert.ok(h.indexOf('-m') < h.indexOf('PROMPT'), 'hermes: route flags must precede the prompt');
  const c = argvOf('codex', { model: 'm' });
  assert.ok(c.indexOf('-m') < c.indexOf('PROMPT'), 'codex: route flags must precede the prompt');
});

test('route: values that could become a flag or break out of TOML are refused', () => {
  for (const bad of ['-x', '--model', 'a b', 'a"b', "a'b", 'a\nb', '', 'x'.repeat(65), 'a;b', '$(id)']) {
    assert.ok(badRouteValue('model', bad), 'should reject ' + JSON.stringify(bad));
  }
  for (const good of ['gpt-6-astra', 'claude-opus-5', 'qwen/qwen3.7-flash', 'high', 'gpt-5.6-sol', 'a_b:c@d+e']) {
    assert.equal(badRouteValue('model', good), null, 'should accept ' + good);
  }
});

test('route: a flag beats lanes.json, lanes.json beats nothing, and the source is recorded', () => {
  const defaults = { codex: { model: 'from-config', effort: 'low' } };
  const a = resolveRoute('codex', { model: 'from-flag', effort: null }, defaults);
  assert.equal(a.model, 'from-flag');
  assert.equal(a.model_source, 'flag');
  assert.equal(a.effort, 'low');
  assert.equal(a.effort_source, 'lanes.json');
  const b = resolveRoute('grok', { model: null, effort: null }, defaults);
  assert.equal(b.model, null);
  assert.equal(b.model_source, 'lane_default', 'an unpinned lane must say so, not look pinned');
});

test('lanes.json: defaults parse, and anything malformed fails closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-lanes-'));
  const write = (o) => writeFileSync(join(dir, 'lanes.json'), JSON.stringify(o));
  write({ enabled: ['codex'], defaults: { codex: { model: 'gpt-6-astra', effort: 'high' } } });
  const good = laneConfig(dir);
  assert.deepEqual(good.enabled, ['codex']);
  assert.deepEqual(good.defaults.codex, { model: 'gpt-6-astra', effort: 'high' });
  write({ enabled: ['codex'] });
  assert.deepEqual(laneConfig(dir).defaults, {}, 'defaults are optional');
  for (const bad of [
    { enabled: ['codex'], defaults: [] },
    { enabled: ['codex'], defaults: { nope: { model: 'x' } } },
    { enabled: ['codex'], defaults: { codex: { model: '-x' } } },
    { enabled: ['codex'], defaults: { codex: { effort: 'high', extra: 1 } } },
    { enabled: ['codex'], defaults: { qwen: { effort: 'high' } } } // qwen has no reasoning flag
  ]) {
    write(bad);
    assert.equal(laneConfig(dir), null, 'must fail closed on ' + JSON.stringify(bad));
  }
  rmSync(dir, { recursive: true, force: true });
});

test('lanes.json: absent means every lane enabled and nothing pinned', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-lanes-none-'));
  const c = laneConfig(dir);
  assert.deepEqual(c.enabled, LANES);
  assert.deepEqual(c.defaults, {});
  rmSync(dir, { recursive: true, force: true });
});

test('enabledLanes still answers the narrow question, including the malformed case', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-lanes-compat-'));
  writeFileSync(join(dir, 'lanes.json'), JSON.stringify({ enabled: ['grok'] }));
  assert.deepEqual(enabledLanes(dir), ['grok']);
  writeFileSync(join(dir, 'lanes.json'), '{ not json');
  assert.equal(enabledLanes(dir), null, 'malformed must stay null, not an empty list');
  rmSync(dir, { recursive: true, force: true });
});

test('a run refused before the lane starts still records the route it asked for', () => {
  // Found by the 0.1.14 pre-release audit: the route was resolved after the
  // disabled / missing-binary returns, so exactly the records you would query
  // when a route looks wrong were the ones missing it.
  const src = readFileSync(new URL('../bin/cli-run.mjs', import.meta.url), 'utf8');
  const resolvedAt = src.indexOf('const route = resolveRoute(');
  assert.ok(resolvedAt > 0, 'the route must be resolved in main()');
  for (const refusal of ["reason: 'lanes_json_malformed'", "reason: 'disabled'", "reason: 'unavailable'"]) {
    const at = src.indexOf(refusal);
    assert.ok(at > 0, 'missing refusal path: ' + refusal);
    assert.ok(resolvedAt < at, `the route must be resolved before the ${refusal} log, or that record has no route`);
  }
});
