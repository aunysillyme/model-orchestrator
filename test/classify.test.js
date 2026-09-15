// Failure classes: WHY a lane failed, so an auth or quota failure is never
// misread as a model fault. Pure functions of lane output; nothing here
// spawns a CLI, needs a key, or costs anything. Every fixture is trimmed from
// a captured vendor shape. Secret-shaped strings are assembled at run time so
// no credential-looking literal lives in this repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, posix, win32 } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as cliRun from '../bin/cli-run.mjs';
const {
  judge, judgeCodex, safeJudge, classifyRun, problemAndFix, redact, countRefused, refusedCodex, refusedGrok,
  codexPrimaryError, CLASS_CODES, REASONS
} = cliRun;
// Looked up rather than imported by name, so a missing export reads as a failing case, not a load error.
const isInsideRoot = (...a) => {
  if (typeof cliRun.isInsideRoot !== 'function') throw new Error('isInsideRoot is not exported');
  return cliRun.isInsideRoot(...a);
};

function classify(lane, rc, out, err = '', { fileText = '', refusedOpts } = {}) {
  const j = lane === 'codex' ? judgeCodex(rc, out, err, fileText) : judge(lane, rc, out, err);
  const c = classifyRun(lane, { rc, out, err, reason: j.reason, detail: j.detail, text: j.text || '', refusedOpts });
  return { ...c, j, code: CLASS_CODES[c.cls] };
}
const qwenError = (message, extra = {}) =>
  JSON.stringify([{ type: 'result', subtype: 'error_during_execution', is_error: true, result: null, error: { message }, ...extra }]);
const fakeKey = (prefix) => prefix + 'FAKE' + 'X'.repeat(20) + '1234';

test('class codes are the documented closed set', () => {
  assert.deepEqual(CLASS_CODES, { ok: 0, empty: 10, no_output: 11, timeout: 12, unavailable: 13, auth: 14, quota: 15, rejected: 16, refused: 17, cut_short: 18 });
  assert.ok(REASONS.has('judge_raised') && REASONS.has('error_message_not_string'));
});

// --- qwen ---
test('qwen: missing API key is auth, exit 14, with a problem and a fix', () => {
  const r = classify('qwen', 1, qwenError("Missing API key for OpenAI-compatible auth. Set the 'OPENROUTER_API_KEY' environment variable."));
  assert.equal(r.cls, 'auth');
  assert.equal(r.code, 14);
  const pf = problemAndFix('qwen', r.cls, { detail: r.j.detail });
  assert.match(pf.problem, /Missing API key/);
  assert.ok(pf.fix);
});

test('qwen: the real captured no-key fixture (qwen 0.22.3) classifies auth', () => {
  const out = readFileSync(fileURLToPath(new URL('./fixtures/qwen-0.22.3-nokey.json', import.meta.url)), 'utf8');
  const r = classify('qwen', 1, out);
  assert.equal(r.cls, 'auth');
  assert.equal(r.refused, 0, 'the fixture carries an empty permission_denials array: a real zero');
});

test('qwen: a 402 credits error is quota, exit 15', () => {
  assert.equal(classify('qwen', 1, qwenError('[API Error: 402 This request requires more credits]')).code, 15);
});

test('qwen: a 400 grammar error and "no endpoints found" are rejected, exit 16', () => {
  assert.equal(classify('qwen', 1, qwenError('[API Error: 400 Failed to initialize samplers: failed to parse grammar]')).code, 16);
  assert.equal(classify('qwen', 1, qwenError('No endpoints found that support tool use')).cls, 'rejected');
});

test('qwen: a deliverable with 2 permission denials is ok, exit 0, refused=2, and still gets a problem and fix', () => {
  const out = JSON.stringify([{
    type: 'result', subtype: 'success', is_error: false, result: 'done, two tools were blocked',
    permission_denials: [{ tool: 'run_shell_command' }, { tool: 'write_file' }],
    stats: { models: { m: { api: { totalErrors: 0 } } } }
  }]);
  const r = classify('qwen', 0, out);
  assert.equal(r.cls, 'ok');
  assert.equal(r.code, 0);
  assert.equal(r.refused, 2);
  const pf = problemAndFix('qwen', 'ok', { out, refused: 2 });
  assert.match(pf.problem, /ok, but 2 call\(s\) were refused/);
  assert.ok(pf.fix);
});

test('qwen: auth beats refused when both are present, and the refused count is still read', () => {
  const r = classify('qwen', 1, qwenError('Missing API key for OpenAI-compatible auth.', { permission_denials: [{ tool: 'x' }] }));
  assert.equal(r.cls, 'auth');
  assert.equal(r.refused, 1);
});

test('qwen: prose mentioning "missing API key" does not beat the real terminal quota error', () => {
  const out = JSON.stringify([
    { type: 'assistant', message: { content: "Note: if you see 'missing API key' errors, check your env." } },
    { type: 'result', subtype: 'error_during_execution', is_error: true, result: null, error: { message: '[API Error: 402 This request requires more credits]' } }
  ]);
  assert.equal(classify('qwen', 1, out).cls, 'quota');
});

test('qwen: error.message that is not a string is cut_short, never a crash', () => {
  const r = classify('qwen', 1, JSON.stringify([{ type: 'result', subtype: 'error', error: { message: 1 } }]));
  assert.equal(r.j.reason, 'error_message_not_string');
  assert.equal(r.cls, 'cut_short');
});

// --- codex ---
const codexBadModel =
  '{"type":"thread.started","thread_id":"t1"}\n' +
  '{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Model metadata for `gpt-nonexistent-9` not found."}}\n' +
  '{"type":"turn.started"}\n' +
  JSON.stringify({ type: 'error', message: JSON.stringify({ type: 'error', status: 400, error: { type: 'invalid_request_error', message: "The 'gpt-nonexistent-9' model is not supported when using Codex with a ChatGPT account." } }) }) + '\n' +
  JSON.stringify({ type: 'turn.failed', error: { message: JSON.stringify({ type: 'error', status: 400, error: { type: 'invalid_request_error' } }) } }) + '\n';

test('codex: an unsupported model is rejected, exit 16, and the problem names the upstream cause', () => {
  const r = classify('codex', 1, codexBadModel, 'Reading additional input from stdin...\n');
  assert.equal(r.cls, 'rejected');
  assert.equal(r.code, 16);
  const pf = problemAndFix('codex', r.cls, { detail: r.j.detail, authoritative: codexPrimaryError(codexBadModel) });
  assert.match(pf.problem, /not supported/);
  assert.match(pf.problem, /gpt-nonexistent-9/);
  assert.doesNotMatch(pf.problem, /no terminal turn\.completed event/);
});

test('codex: usage_limit_exceeded on stderr is quota, exit 15', () => {
  const err = 'Reading additional input from stdin...\ncodex_error_info: usage_limit_exceeded - "You\'ve hit your usage limit"\n';
  assert.equal(classify('codex', 1, '{"type":"thread.started","thread_id":"t2"}\n{"type":"turn.started"}\n', err).code, 15);
});

test('codex: an agent_message mentioning usage_limit_exceeded does not beat the real invalid_request_error', () => {
  const out =
    '{"type":"thread.started","thread_id":"t"}\n{"type":"turn.started"}\n' +
    '{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Note: usage_limit_exceeded can happen if you overuse the API."}}\n' +
    JSON.stringify({ type: 'error', message: JSON.stringify({ type: 'error', status: 400, error: { type: 'invalid_request_error', message: 'bad model id' } }) }) + '\n' +
    '{"type":"turn.failed","error":{"message":"turn failed"}}\n';
  assert.equal(classify('codex', 1, out).cls, 'rejected');
});

test('codex: a deliverable with a router Rejected line on stderr is ok, exit 0, refused=1', () => {
  const out =
    '{"type":"thread.started","thread_id":"t3"}\n{"type":"turn.started"}\n' +
    '{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"zsh:1: operation not permitted: /tmp/probe.txt"}}\n' +
    '{"type":"turn.completed","usage":{"input_tokens":1}}\n';
  const err = 'Reading additional input from stdin...\n2026-09-15T00:42:30Z ERROR codex_core::tools::router: error=exec_command failed: CreateProcess { message: "Rejected(\\"rm -f style commands are not permitted\\")" }\n';
  const r = classify('codex', 0, out, err, { fileText: 'zsh:1: operation not permitted: /tmp/probe.txt' });
  assert.equal(r.cls, 'ok');
  assert.equal(r.refused, 1);
  assert.ok(problemAndFix('codex', 'ok', { out, err, refused: 1 }).problem);
});

test('codex: prose alone saying "operation not permitted" invents no refusal', () => {
  const out = '{"type":"item.completed","item":{"type":"agent_message","text":"In general, operation not permitted errors mean a sandboxed command."}}\n{"type":"turn.completed"}\n';
  assert.equal(refusedCodex(out, ''), null);
});

test('codex: three router Rejected lines count three', () => {
  const err = ['rm -f style commands', 'sudo', 'curl'].map((c) => `ERROR codex_core::tools::router: error=exec_command failed: Rejected("${c} is not permitted")`).join('\n');
  assert.equal(refusedCodex('', err), 3);
});

test('codex: a missing terminal event with no other signal is cut_short, exit 18', () => {
  assert.equal(classify('codex', 1, '{"type":"thread.started"}\n{"type":"turn.started"}\n').code, 18);
});

// --- agy ---
test('agy: a deliverable after a deny-rule TOOL_ERROR is ok, exit 0, refused=1', () => {
  const out =
    '{"event":"init","conversation_id":"c1","init":{"tools":[]}}\n' +
    JSON.stringify({ event: 'step_update', step_update: { step_index: 2, state: 'ERROR', tool_name: 'run_command', tool_info: { name: 'run_command', error: { type: 'TOOL_ERROR', message: 'permission check failed for command "rm -rf /tmp/x": Permission denied for command(rm -rf /tmp/x). Matches user-configured deny rule.' } } } }) + '\n' +
    '{"event":"result","result":{"conversation_id":"c1","status":"SUCCESS","response":"The command was blocked by a user-configured deny rule."}}\n';
  const r = classify('agy', 0, out);
  assert.equal(r.cls, 'ok');
  assert.equal(r.refused, 1);
  assert.match(problemAndFix('agy', 'ok', { out, refused: 1 }).problem, /Matches user-configured deny rule/);
});

test('agy: "not logged into Antigravity" on stderr is auth, exit 14', () => {
  const r = classify('agy', 1, '{"event":"init","conversation_id":"c2","init":{"tools":[]}}\n', 'You are not logged into Antigravity.\nPrint mode: not authenticated\n');
  assert.equal(r.code, 14);
});

test('agy: a scalar terminal result is cut_short, never a crash', () => {
  const r = classify('agy', 0, '{"event":"result","result":1}\n');
  assert.equal(r.j.text, null);
  assert.equal(r.cls, 'cut_short');
});

// --- grok ---
test('grok: stopReason error is cut_short, exit 18', () => {
  assert.equal(classify('grok', 0, JSON.stringify({ stopReason: 'error', text: '', sessionId: 'no-such-session' })).code, 18);
});

test('grok: stdout that is a JSON array is cut_short', () => {
  assert.equal(classify('grok', 0, '[]').cls, 'cut_short');
});

function grokSessions(sid, lines) {
  const root = mkdtempSync(join(tmpdir(), 'orch-grok-sessions-'));
  const cwd = '/work/some project';
  const dir = join(root, encodeURIComponent(cwd), sid);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'updates.jsonl'), lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n');
  return { root, cwd, dir };
}
const envelope = (sid, update) => ({ timestamp: 0, method: 'session/update', params: { sessionId: sid, update } });

test('grok: refusals are counted from the session transcript, both the hook shape and the deny-rule shape', () => {
  const sid = 'fixture-session-t11';
  const { root, cwd } = grokSessions(sid, [
    envelope(sid, { sessionUpdate: 'hook_execution', event_name: 'pre_tool_use', runs: [{ status: { blocked: true, error: 'denied: x' } }] }),
    envelope(sid, { sessionUpdate: 'tool_call_update', status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'Tool `run_terminal_command` was not executed: Denied by permission policy: deny rule on bash matching "sudo *"' } }] }),
    envelope(sid, { sessionUpdate: 'tool_call_update', status: 'completed' }),
    envelope(sid, { sessionUpdate: 'agent_message_chunk' })
  ]);
  const r = classify('grok', 0, JSON.stringify({ stopReason: 'end_turn', text: 'done', sessionId: sid }), '', { refusedOpts: { root, cwd } });
  assert.deepEqual([r.cls, r.refused], ['ok', 2]);
  rmSync(root, { recursive: true, force: true });
});

test('grok: a traversal sessionId never leaves the sessions root', () => {
  const { root, cwd } = grokSessions('placeholder-session', []);
  const victim = join(root, 'victim-outside-root');
  mkdirSync(victim);
  writeFileSync(join(victim, 'updates.jsonl'), JSON.stringify(envelope('x', { sessionUpdate: 'hook_execution', runs: [{ status: { blocked: true } }] })) + '\n');
  assert.equal(refusedGrok(JSON.stringify({ stopReason: 'end_turn', text: 'hi', sessionId: '../victim-outside-root' }), { root, cwd }), null);
  rmSync(root, { recursive: true, force: true });
});

test('grok: an absolute-path sessionId is refused before any path is built', () => {
  const { root, cwd } = grokSessions('placeholder-session', []);
  const outside = mkdtempSync(join(tmpdir(), 'orch-grok-outside-'));
  writeFileSync(join(outside, 'updates.jsonl'), JSON.stringify(envelope('x', { sessionUpdate: 'hook_execution', runs: [{ status: { blocked: true } }] })) + '\n');
  assert.equal(refusedGrok(JSON.stringify({ stopReason: 'end_turn', text: 'hi', sessionId: outside }), { root, cwd }), null);
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

test('grok: a sessionId outside the charset is refused even when its path would stay inside the root', () => {
  const sid = 'session.with.dots';
  const { root, cwd } = grokSessions(sid, [envelope(sid, { sessionUpdate: 'hook_execution', runs: [{ status: { blocked: true } }] })]);
  assert.equal(refusedGrok(JSON.stringify({ stopReason: 'end_turn', text: 'hi', sessionId: sid }), { root, cwd }), null);
  rmSync(root, { recursive: true, force: true });
});

test('grok: transcript lines naming another session are not counted, and read as unknown', () => {
  const sid = 'aaaaaaaa-mismatch-fixture';
  const { root, cwd } = grokSessions(sid, [envelope('some-other-session', { sessionUpdate: 'hook_execution', runs: [{ status: { blocked: true } }] })]);
  assert.equal(refusedGrok(JSON.stringify({ stopReason: 'end_turn', text: 'hi', sessionId: sid }), { root, cwd }), null);
  rmSync(root, { recursive: true, force: true });
});

test('grok: the transcript read is capped, so a denial past the cap is not counted', () => {
  const sid = 'bbbbbbbb-capfixture-t8d';
  const { root, cwd } = grokSessions(sid, ['x'.repeat(300), envelope(sid, { sessionUpdate: 'hook_execution', runs: [{ status: { blocked: true } }] })]);
  const out = JSON.stringify({ stopReason: 'end_turn', text: 'hi', sessionId: sid });
  assert.equal(refusedGrok(out, { root, cwd }), 1, 'control: uncapped, the denial is counted');
  assert.notEqual(refusedGrok(out, { root, cwd, cap: 200 }), 1);
  rmSync(root, { recursive: true, force: true });
});

// --- hermes ---
test('hermes: a degraded free tier on stderr is quota, exit 15, refused unknown', () => {
  const r = classify('hermes', 1, '', 'upstream free tier degraded, no usable content returned\n');
  assert.equal(r.code, 15);
  assert.equal(r.refused, null);
});

test('hermes: exit 1 with no quota or toolset signal is cut_short; exit 2 is empty', () => {
  assert.equal(classify('hermes', 1, 'partial', '').cls, 'cut_short');
  assert.equal(classify('hermes', 2, '', 'bad args').cls, 'empty');
});

// --- the wrapper-level rules ---
test('a nonzero vendor exit is never ok, even with a parseable deliverable', () => {
  assert.equal(classify('grok', 3, JSON.stringify({ stopReason: 'end_turn', text: 'looks fine' })).cls, 'cut_short');
});

test('nothing on stdout or stderr is no_output, exit 11, whatever the vendor exit', () => {
  assert.equal(classify('grok', 1, '', '').code, 11);
  assert.equal(classify('qwen', 0, '  \n', '').code, 11);
});

test('malformed input never throws, and an unknown lane still lands in the closed set', () => {
  assert.doesNotThrow(() => {
    classifyRun('qwen', { rc: 1, out: null, err: null, detail: null });
    classifyRun('grok', { rc: 0, out: 'not json {{{', err: '{{{', detail: 12345 });
    classifyRun('codex', { rc: 0, out: { weird: 'dict' }, err: 123, detail: [1, 2, 3] });
    classifyRun('agy', { rc: 1, out: '{not json', err: '' });
    countRefused('grok', '{"sessionId":"*?[]"}', '');
  });
  assert.ok(classifyRun('nonexistent-lane', { rc: 1, out: 'x', err: 'y', detail: 'z' }).cls in CLASS_CODES);
});

test('a judge that throws becomes judge_raised and cut_short, never a wrapper crash', () => {
  const j = safeJudge('nonexistent-lane', 0, 'x', '');
  assert.equal(j.reason, 'judge_raised');
  assert.equal(classifyRun('grok', { rc: 0, out: 'x', reason: j.reason, detail: j.detail }).cls, 'cut_short');
});

test('every non-ok class has a problem and a fix; ok has none unless calls were refused', () => {
  for (const c of ['empty', 'no_output', 'timeout', 'unavailable', 'auth', 'quota', 'rejected', 'refused', 'cut_short']) {
    const pf = problemAndFix('qwen', c, { out: 'some out', err: 'some err', detail: 'some detail' });
    assert.ok(pf.problem && pf.fix, c);
  }
  assert.deepEqual(problemAndFix('qwen', 'ok', {}), { problem: null, fix: null });
  assert.ok(problemAndFix('qwen', 'ok', { refused: 3 }).problem);
});

// --- redaction (terminal output) ---
test('redact: JSON credential keys keep the key name and lose the value', () => {
  const v = fakeKey('sk-');
  const r = redact(`upstream said {"api_key": "${v}", "ok": true}`);
  assert.ok(!r.includes(v) && r.includes('"api_key"'), r);
  for (const key of ['token', 'secret', 'password', 'access_token']) {
    assert.ok(!redact(`{"${key}": "verysecretvalue1234567890"}`).includes('verysecretvalue1234567890'), key);
  }
});

test('redact: Authorization values of any scheme, bearer values with +/=, and URL query credentials', () => {
  for (const [scheme, value] of [['Bearer', 'abcDEF123456.xyz'], ['Basic', 'dXNlcjpwYXNzd29yZA==']]) {
    assert.ok(!redact(`Authorization: ${scheme} ${value}`).includes(value), scheme);
  }
  assert.ok(!redact('Authorization: Bearer abc123+/==DEF456ghijklmno').includes('abc123+/==DEF456ghijklmno'));
  for (const p of ['token', 'key', 'api_key', 'access_token', 'sig']) {
    assert.ok(!redact(`https://example.com/x?a=1&${p}=SECRETVALUE9876543210&b=2`).includes('SECRETVALUE9876543210'), p);
  }
});

test('redact: vendor key prefixes are replaced whole, so no fragment survives a later clip', () => {
  for (const prefix of ['sk-', 'xai-', 'ghp_', 'AIza']) {
    const v = prefix + 'A'.repeat(700);
    const r = redact('prefix noise '.repeat(5) + v);
    assert.ok(!r.includes('AAAA') && r.includes('[REDACTED]'), prefix);
  }
});

// --- 0.1.23 pre-release audit, round 1: each case reproduced red before its fix ---
test('R1: a secret longer than a display clip is redacted before the clip, in detail and in the problem line', () => {
  const secret = 'Q'.repeat(240);
  const out = qwenError(JSON.stringify({ password: secret }));
  const r = classify('qwen', 1, out);
  const pf = problemAndFix('qwen', r.cls, { out, detail: r.j.detail });
  for (const s of [redact(r.j.detail), redact(pf.problem)]) assert.ok(!s.includes('Q'.repeat(20)), s);
});

test('R2: an escaped quote or a missing closing quote does not end JSON credential redaction early', () => {
  assert.ok(!redact(JSON.stringify({ password: 'prefix"' + 'Q'.repeat(240) })).includes('Q'.repeat(20)));
  assert.ok(!redact('{"password": "' + 'Q'.repeat(50)).includes('Q'.repeat(20)));
  assert.ok(!redact(JSON.stringify(JSON.stringify({ api_key: 'Q'.repeat(50) }))).includes('Q'.repeat(20)), 'a JSON body escaped inside a string');
});

test('R3: denial extraction on adversarial output finishes fast', () => {
  const out = 'Permission denied for command('.repeat(40000);
  const t0 = Date.now();
  problemAndFix('codex', 'refused', { out, err: out.slice(0, 64 * 1024), refused: 1 });
  assert.ok(Date.now() - t0 < 1000, `took ${Date.now() - t0} ms`);
});

test('R4: sessions-root containment is path-aware on both platforms, not a string prefix', () => {
  assert.equal(isInsideRoot('/audit/sessions', '/audit/sessions\\outside/updates.jsonl', posix), false);
  assert.equal(isInsideRoot('/audit/sessions', '/audit/sessions-2/x/updates.jsonl', posix), false);
  assert.equal(isInsideRoot('/audit/sessions', '/audit/sessions', posix), false);
  assert.equal(isInsideRoot('/audit/sessions', '/audit/sessions/enc/sid/updates.jsonl', posix), true);
  assert.equal(isInsideRoot('C:\\s', 'C:\\s2\\x\\updates.jsonl', win32), false);
  assert.equal(isInsideRoot('C:\\s', 'D:\\s\\x\\updates.jsonl', win32), false);
  assert.equal(isInsideRoot('C:\\s', 'C:\\s\\x\\updates.jsonl', win32), true);
});

test('R5: qwen classifies the full terminal error, not the clipped display detail', () => {
  assert.equal(classify('qwen', 1, qwenError('context '.repeat(20) + '[API Error: 402 requires more credits]')).cls, 'quota');
  const lied = JSON.stringify([{ type: 'result', subtype: 'success', is_error: false, result: 'OK', stats: { models: { 'rate limit model': { api: { totalErrors: 2 } } } } }]);
  assert.notEqual(classify('qwen', 0, lied).cls, 'quota', 'a model name in the display detail is not a quota signal');
});

test('R6: hermes answer prose on stdout is not a quota or rejected signal', () => {
  const r = classify('hermes', 1, 'The toolset has no rate limit.', '');
  assert.equal(r.cls, 'cut_short');
});

test('R7: a nonzero vendor exit with a recognised empty shape is still cut_short, except hermes exit 2', () => {
  assert.equal(classify('agy', 7, '{"event":"result","result":{"status":"SUCCESS","response":""}}\n').cls, 'cut_short');
  assert.equal(classify('hermes', 2, '', 'bad args').cls, 'empty');
});

test('the redaction check can go red', () => {
  assert.ok(('x ' + fakeKey('sk-')).includes('sk-FAKE'));
});
