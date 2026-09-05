import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judgeGrok, judgeCodex, judgeAgy, judgeHermes, judgeQwen, judge, buildArgv, REASONS, checkContracts } from '../bin/cli-run.mjs';

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
  const { mkdtempSync, writeFileSync, utimesSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const d = mkdtempSync(join(tmpdir(), 'orch-contract-'));
  const started = Date.now();
  assert.match(checkContracts({ expectJson: true }, 'I cannot create that file.', started), /not valid JSON/);
  assert.equal(checkContracts({ expectJson: true }, '{"a":1}', started), null);
  assert.match(checkContracts({ expectFile: join(d, 'nope.md') }, 'x', started), /does not exist/);
  writeFileSync(join(d, 'empty.md'), '');
  assert.match(checkContracts({ expectFile: join(d, 'empty.md') }, 'x', started), /empty/);
  writeFileSync(join(d, 'stale.md'), 'old');
  const old = new Date(started - 60_000);
  utimesSync(join(d, 'stale.md'), old, old);
  assert.match(checkContracts({ expectFile: join(d, 'stale.md') }, 'x', started), /predates this run/);
  writeFileSync(join(d, 'fresh.md'), 'new');
  assert.equal(checkContracts({ expectFile: join(d, 'fresh.md') }, 'x', started), null);
  rmSync(d, { recursive: true, force: true });
});
