#!/usr/bin/env node
// cli-run: one entrypoint for the agent CLI lanes.
//
// THE GUARANTEE, stated exactly: exit 0 means the lane returned a STRUCTURALLY
// ACCEPTED, NON-EMPTY final response, judged on that lane's native terminal
// event, with the lane-specific error checks applied. It does not mean the
// task was done. A refusal that parses cleanly is exit 0. When you have a real
// contract, say so: --expect-file PATH (a non-empty file written during this
// run) or --expect-json (the response parses as JSON) turn an unmet contract
// into exit 10.
//
// Why the wrapper exists: every agent CLI can exit 0 having produced nothing.
// A run that reports success and delivers nothing is indistinguishable from a
// model failure, so it gets blamed on the model. This tool reads each lane's
// NATIVE terminal event and refuses to call an empty run a success.
//
//   grok    --output-format json        -> stopReason == "end_turn" and text non-empty
//   codex   exec --json --color never -o F -> terminal {"type":"turn.completed"} and F non-empty
//   agy     --output-format stream-json -> terminal {"event":"result"} status SUCCESS, response non-empty
//   hermes  -z                          -> its exit code is already honest (0 ok / 1 none / 2 bad args)
//   qwen    -o json                     -> terminal {"type":"result"} subtype "success", is_error false,
//                                          result non-empty AND not "[API Error: ...]",
//                                          AND every stats.models.*.api.totalErrors == 0
//
// The prompt travels in argv because that is each vendor's documented headless
// shape (-p / exec). argv is visible to other processes on the machine and is
// bounded by the OS ARG_MAX, so: no secrets in a prompt, and very large briefs
// should be referenced by path in the prompt rather than pasted into it.
//
// Exit codes: one per failure CLASS, so the code says what to do next.
//   0   ok: structurally accepted non-empty response (and every --expect-* contract met)
//   10  empty: ran and delivered nothing, or a contract was not met
//   11  no_output: produced no output at all
//   12  timeout: the lane AND its descendants are killed as a process group
//   13  unavailable: missing binary, disabled in lanes.json, or lanes.json malformed
//   14  auth: the lane's own error says a credential is missing or not logged in
//   15  quota: the lane's own error says usage limit, credits or rate limit
//   16  rejected: the upstream rejected the request (bad model id, bad request)
//   17  refused: no deliverable, and the lane reports tool calls a hook or deny rule blocked
//   18  cut_short: no trustworthy finish: a missing or non-success terminal event, a lane
//       killed by a signal, output past the 16 MiB buffer, or a nonzero vendor exit
//   130 / 143  cli-run itself received SIGINT / SIGTERM: the lane's process group was killed first
//   2   usage error in cli-run itself
// A run that delivered AND had tool calls refused is still 0, with refused=N and a
// problem/fix pair on the terminal. The vendor's own exit code is logged as cli_rc.
// Precedence when several signals are present: auth, quota, rejected, refused,
// cut_short, empty. Only the lane's authoritative error fields are searched,
// never the model's prose, so an answer that merely mentions "rate limit" is
// not a quota failure.
//
// The durable log stores a FIXED reason code and class per run (see REASONS,
// CLASS_CODES), never a provider-supplied string. Bounded vendor stderr and the
// problem/fix lines go to your terminal only, redacted.
//
// ROUTE: which model and reasoning effort a lane ran with.
// A lane with no --model and no lanes.json default inherits whatever its own
// config file says, which is invisible from here and is how a documented route
// silently stops being the route that runs. --model / --effort pin it per call,
// `defaults` in lanes.json pins it per lane, and every run logs the value that
// was REQUESTED plus where the request came from (flag, lanes.json, or nothing
// at all). It does not log an "actual". One lane of five (grok) does report a
// model id in its own output; the other four report none, and a field present
// for one lane and absent for four is worse than no field. It would also be a
// provider-supplied string, which this log deliberately never holds.

import { spawn, spawnSync } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, appendFileSync, mkdtempSync, rmSync, accessSync, constants, realpathSync, statSync, lstatSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname, delimiter, resolve, relative, isAbsolute, sep } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LANES = ['grok', 'codex', 'agy', 'hermes', 'qwen'];
export const OK = 0, NO_DELIVERABLE = 10, NO_OUTPUT = 11, TIMEOUT = 12, UNAVAILABLE = 13, USAGE = 2;
export const AUTH = 14, QUOTA = 15, REJECTED = 16, REFUSED = 17, CUT_SHORT = 18;

// The closed set of failure classes. Every judged run lands in exactly one, and
// the class owns the exit code. `interrupted` (cli-run itself was signalled)
// is logged as a class but exits 130 or 143.
export const CLASS_CODES = {
  ok: OK, empty: NO_DELIVERABLE, no_output: NO_OUTPUT, timeout: TIMEOUT, unavailable: UNAVAILABLE,
  auth: AUTH, quota: QUOTA, rejected: REJECTED, refused: REFUSED, cut_short: CUT_SHORT
};

// Every reason that may reach the durable log. A judge or the wrapper picks
// one of these; anything else is written as 'unknown'. Provider text never
// enters this field, whatever it contains.
export const REASONS = new Set([
  'ok', 'not_json', 'bad_stop_reason', 'empty_text', 'no_terminal_event', 'empty_output_file',
  'bad_status', 'empty_response', 'exit_nonzero', 'empty_stdout', 'bad_event_array', 'bad_last_event',
  'not_result', 'bad_subtype', 'is_error', 'result_not_string', 'empty_result', 'api_error_in_result',
  'telemetry_absent', 'total_errors_unreadable', 'total_errors', 'contract_unmet', 'error_message_not_string',
  'judge_raised', 'timeout', 'unavailable', 'killed', 'disabled', 'lanes_json_malformed', 'no_output', 'unknown'
]);

const LOG = join(homedir(), '.ai-orchestrator', 'cli-run.log.jsonl');

// On win32, a PATH entry never holds a bare "grok": npm and vendor installers
// drop "grok.cmd" (or .exe/.bat/.ps1), the same way any Windows shell resolves
// a bare command through %PATHEXT%. Trying the bare name first keeps this a
// no-op on POSIX and matches an already-extensioned name (a .exe someone put
// on PATH directly) on Windows too. Kept in sync with src/detect.js's which(),
// which this file cannot import: it ships standalone into a user's install.
function candidateExtensions() {
  if (process.platform !== 'win32') return [''];
  const pathext = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD';
  return ['', ...pathext.split(';').filter(Boolean)];
}

function which(bin) {
  const dirs = (process.env['PATH'] || '').split(delimiter).filter(Boolean);
  const home = homedir();
  dirs.push(join(home, '.local', 'bin'), join(home, '.grok', 'bin'), join(home, '.npm-global', 'bin'));
  const exts = candidateExtensions();
  for (const d of dirs) {
    for (const ext of exts) {
      const p = join(d, bin + ext);
      try {
        if (!statSync(p).isFile()) continue; // a directory named like the binary is not the binary
        accessSync(p, constants.X_OK);
        return p;
      } catch {
        /* next */
      }
    }
  }
  return null;
}

// Scan JSON-lines output for the LAST line that satisfies `want`, parsing only
// candidate lines and retaining one object. Untrusted CLI output can be large.
function lastJsonLine(out, needle, want) {
  let found = null;
  let start = 0;
  const text = String(out);
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end);
    start = end + 1;
    if (line.length > 1_000_000 || line.indexOf(needle) === -1) continue;
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try {
      const o = JSON.parse(t);
      if (want(o)) found = o;
    } catch {
      /* not JSON, skip */
    }
  }
  return found;
}

// --- judges: (rc, out, err, extra) -> { text, reason, detail } ---------------
// `reason` is a fixed code from REASONS (durable). `detail` is a human line for
// the terminal and MAY contain provider values; it is never logged.
// Every field access is type-guarded: a malformed payload returns a verdict,
// never throws.
const fail = (reason, detail) => ({ text: null, reason, detail });
const pass = (text, detail) => ({ text, reason: 'ok', detail });

export function judgeGrok(rc, out) {
  let o;
  try {
    o = JSON.parse(out);
  } catch {
    return fail('not_json', 'stdout was not JSON');
  }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return fail('not_json', 'JSON was not an object');
  const stop = o.stopReason;
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  if (stop !== 'end_turn') return fail('bad_stop_reason', `stopReason=${JSON.stringify(stop)}`);
  return text ? pass(text, 'stopReason=end_turn') : fail('empty_text', 'end_turn but empty text');
}

export function judgeCodex(rc, out, err, fileText) {
  const completed = lastJsonLine(out, 'turn.completed', (o) => o && o.type === 'turn.completed') !== null;
  const text = typeof fileText === 'string' ? fileText.trim() : '';
  if (!completed) return fail('no_terminal_event', 'no terminal turn.completed event');
  return text ? pass(text, 'turn.completed') : fail('empty_output_file', 'turn.completed but -o file empty');
}

export function judgeAgy(rc, out) {
  const ev = lastJsonLine(out, '"result"', (o) => o && o.event === 'result');
  if (ev === null) return fail('no_terminal_event', 'no terminal result event');
  if (!ev.result || typeof ev.result !== 'object' || Array.isArray(ev.result)) return fail('bad_last_event', 'terminal result was not an object');
  const term = ev.result;
  const status = term.status;
  const text = typeof term.response === 'string' ? term.response.trim() : '';
  if (status !== 'SUCCESS') return fail('bad_status', `status=${JSON.stringify(status)}`);
  return text ? pass(text, 'status=SUCCESS') : fail('empty_response', 'SUCCESS but empty response');
}

export function judgeHermes(rc, out, err) {
  const text = String(out || '').trim();
  if (rc !== 0) {
    let why = { 1: 'no final response (agent produced nothing)', 2: 'bad args, or completed with an empty response' }[rc] || 'unknown failure';
    // hermes collapses every upstream failure into one exit code; its stderr
    // is the only place the cause is named.
    const blob = String(err || '').toLowerCase(); // stderr only: stdout is the agent's own prose
    if (hermesQuotaText(blob)) why += ': upstream free tier degraded or limited, a retry is reasonable';
    else if (blob.includes('toolset')) why += ': invalid --toolsets value, a caller bug and not a lane fault';
    return fail('exit_nonzero', `hermes exit ${rc}: ${why}`);
  }
  return text ? pass(text, 'exit 0') : fail('empty_stdout', 'exit 0 but empty stdout');
}

export function judgeQwen(rc, out) {
  let events;
  try {
    events = JSON.parse(out);
  } catch {
    return fail('not_json', 'stdout was not JSON');
  }
  if (!Array.isArray(events) || events.length === 0) return fail('bad_event_array', 'JSON was not a non-empty event array');
  const term = events[events.length - 1];
  if (!term || typeof term !== 'object' || Array.isArray(term)) return fail('bad_last_event', 'last event was not an object');
  if (term.type !== 'result') return fail('not_result', `last event was ${JSON.stringify(term.type)}, not result`);
  if (term.subtype !== 'success') {
    const e = term.error;
    if (e && typeof e === 'object' && e.message !== undefined && typeof e.message !== 'string') {
      return fail('error_message_not_string', `subtype=${JSON.stringify(term.subtype)}, error.message was not a string`);
    }
    const msg = e && typeof e === 'object' && typeof e.message === 'string' ? e.message : e ? String(e) : '';
    return fail('bad_subtype', `subtype=${JSON.stringify(term.subtype)}` + (msg ? `: ${redact(msg).slice(0, 120)}` : ''));
  }
  if (term.is_error) return fail('is_error', 'is_error true');
  if (term.result != null && typeof term.result !== 'string') return fail('result_not_string', `result was ${typeof term.result}, not a string`);
  const text = (term.result || '').trim();
  if (!text) return fail('empty_result', 'success but empty result');
  // qwen reports success even when the upstream API rejected the call; the
  // error text lands in `result`. These two checks are the honest ones.
  if (text.startsWith('[API Error:')) return fail('api_error_in_result', `success flag lied, result is an API error: ${redact(text).slice(0, 140)}`);
  const stats = term.stats;
  const models = stats && typeof stats === 'object' ? stats.models : null;
  if (!models || typeof models !== 'object' || Array.isArray(models) || Object.keys(models).length === 0) {
    return fail('telemetry_absent', 'success but stats.models absent: cannot verify totalErrors'); // absent telemetry is an unknown, not a zero
  }
  for (const [name, m] of Object.entries(models)) {
    const api = m && typeof m === 'object' ? m.api : null;
    const errs = api && typeof api === 'object' ? api.totalErrors : undefined;
    if (!Number.isInteger(errs)) return fail('total_errors_unreadable', `success but ${name} has no readable totalErrors`);
    if (errs) return fail('total_errors', `success flag lied, ${name} reported ${errs} API error(s)`);
  }
  return pass(text, `subtype=success, totalErrors=0 across ${Object.keys(models).length} model(s)`);
}

// --- route: model and effort per lane --------------------------------------
// Each vendor spells these differently, and the spelling was read from each
// CLI's own --help, not remembered. A lane with `effort: null` has no reasoning
// flag at all; asking for one there is a usage error, never a silent drop.
//   grok    -m MODEL   --reasoning-effort EFFORT
//   codex   -m MODEL   -c model_reasoning_effort="EFFORT"   (a TOML override, hence the quotes)
//   agy     --model M  --effort EFFORT                      (low|medium|high)
//   hermes  -m MODEL   --reasoning LEVEL                    (none|minimal|...)
//   qwen    -m MODEL   no reasoning flag
export const LANE_FLAGS = {
  grok: { model: (v) => ['-m', v], effort: (v) => ['--reasoning-effort', v] },
  codex: { model: (v) => ['-m', v], effort: (v) => ['-c', `model_reasoning_effort="${v}"`] },
  agy: { model: (v) => ['--model', v], effort: (v) => ['--effort', v] },
  hermes: { model: (v) => ['-m', v], effort: (v) => ['--reasoning', v] },
  qwen: { model: (v) => ['-m', v], effort: null }
};

// Auto is deliberately a small, static ladder. It is not a vendor capability
// probe and it never chooses the top of a vendor's effort range.
export const AUTO_EFFORT = {
  codex: { small: 'medium', large: 'high' },
  grok: { small: 'medium', large: 'high' },
  agy: { small: 'medium', large: 'high' },
  hermes: { small: 'medium', large: 'high' }
};

export function gitChangedLines(cwd) {
  try {
    const r = spawnSync('git', ['diff', '--numstat', '-z', 'HEAD'], { cwd, timeout: 5000, maxBuffer: 1024 * 1024 });
    if (r.error || r.status !== 0) return null;
    let total = 0;
    for (const row of String(r.stdout).split('\0')) {
      if (!row) continue;
      const [added, removed] = row.split('\t');
      total += (Number.isFinite(Number(added)) ? Number(added) : 0) + (Number.isFinite(Number(removed)) ? Number(removed) : 0);
    }
    const listed = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd, timeout: 5000, maxBuffer: 1024 * 1024 });
    if (listed.error || listed.status !== 0) return null;
    const root = realpathSync(cwd);
    const deadline = Date.now() + 2000;
    let files = 0, bytes = 0, truncated = false;
    for (const rel of String(listed.stdout).split('\0')) {
      if (!rel) continue;
      if (files >= 200 || Date.now() > deadline) { truncated = true; break; }
      const p = resolve(root, rel);
      if (p !== root && !p.startsWith(root + '/') && !p.startsWith(root + '\\')) continue;
      let st;
      try { st = lstatSync(p); } catch { continue; }
      if (!st.isFile()) continue;
      const limit = Math.min(st.size, 256 * 1024, 2 * 1024 * 1024 - bytes);
      if (limit <= 0) { truncated = true; break; }
      let fd;
      try {
        fd = openSync(p, 'r');
        const buf = Buffer.alloc(Math.min(limit, 64 * 1024));
        let read = 0, last = -1;
        while (read < limit && Date.now() <= deadline) {
          const n = readSync(fd, buf, 0, Math.min(buf.length, limit - read), read);
          if (!n) break;
          for (let i = 0; i < n; i++) if (buf[i] === 10) total++;
          last = buf[n - 1];
          read += n;
        }
        if (read && last !== 10) total++;
        bytes += read;
        if (read < st.size || Date.now() > deadline) truncated = true;
      } catch {
        // A changed file disappearing is ordinary repository churn. The caller
        // falls back to prompt sizing only when the git probes themselves fail.
      } finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
      files++;
      if (bytes >= 2 * 1024 * 1024) { truncated = true; break; }
    }
    return { lines: total, truncated };
  } catch {
    return null;
  }
}

export function resolveAutoEffort(lane, requested, prompt, audit, cwd = process.cwd()) {
  if (requested !== 'auto') return { resolved: requested || null, basis: requested ? 'explicit' : 'none', scope: null, truncated: false };
  const promptScope = prompt.length;
  if (!audit) {
    const bucket = promptScope < 4000 ? 'small' : 'large';
    return { resolved: AUTO_EFFORT[lane][bucket], basis: 'prompt_chars', scope: promptScope, truncated: false };
  }
  const git = gitChangedLines(cwd);
  const scope = Math.max(promptScope, git ? git.lines : 0);
  // Audit is a stakes floor. Scope records the larger independently observed
  // input, but never moves an audit above or below high.
  return { resolved: 'high', basis: 'audit_floor', scope, truncated: !!(git && git.truncated) };
}

// A model id or effort level becomes an argv element and, for codex, part of a
// TOML value. Bounding the charset is what makes both safe: no leading dash (a
// value cannot become a flag), no quote, space or control character (a value
// cannot break out of the TOML string), and a length cap so a config file
// cannot push an unbounded string into the durable log.
export const ROUTE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,63}$/;
export function badRouteValue(kind, v) {
  if (typeof v !== 'string' || !ROUTE_VALUE.test(v)) {
    return `--${kind} must be 1 to 64 characters of letters, digits, dot, underscore, colon, at, slash, plus or dash, and may not start with a dash: ${JSON.stringify(v)}`;
  }
  return null;
}

// --- adapters: build argv for a lane -------------------------------------
// Route flags go in front of the prompt for every lane, because two lanes
// (hermes, codex) take the prompt as a positional argument and a flag after it
// is either ignored or read as part of it.
function routeFlags(lane, opts) {
  const spec = LANE_FLAGS[lane];
  const out = [];
  if (!spec) return out;
  if (opts.model) out.push(...spec.model(opts.model));
  if (opts.effort && spec.effort) out.push(...spec.effort(opts.effort));
  return out;
}

export function buildArgv(lane, binary, prompt, opts, tmp) {
  const timeout = opts.timeout;
  const route = routeFlags(lane, opts);
  switch (lane) {
    case 'grok':
      return { argv: [binary, '--output-format', 'json', ...route, '-p', prompt] };
    case 'codex': {
      const last = join(tmp, 'last.txt');
      const argv = [binary, 'exec', '--json', '--color', 'never', '--skip-git-repo-check', '-o', last];
      if (opts.audit) argv.push('--sandbox', 'read-only'); // an audit lane that can write is a bug
      argv.push(...route);
      argv.push(prompt);
      return { argv, outFile: last };
    }
    case 'agy': {
      const mins = Math.max(1, Math.round(timeout / 60));
      return { argv: [binary, '--print-timeout', `${mins}m`, '--output-format', 'stream-json', ...route, '-p', prompt] };
    }
    case 'hermes':
      return { argv: [binary, '-z', ...route, prompt, '--usage-file', join(tmp, 'usage.json')] };
    case 'qwen': {
      const argv = [binary, '-o', 'json', ...route];
      if (opts.safeMode) argv.push('--safe-mode');
      argv.push('-p', prompt);
      return { argv };
    }
    default:
      throw new Error('unknown lane ' + lane);
  }
}

export function judge(lane, rc, out, err, outFile) {
  switch (lane) {
    case 'grok':
      return judgeGrok(rc, out);
    case 'codex':
      return judgeCodex(rc, out, err, outFile && existsSync(outFile) ? readFileSync(outFile, 'utf8') : '');
    case 'agy':
      return judgeAgy(rc, out);
    case 'hermes':
      return judgeHermes(rc, out, err);
    case 'qwen':
      return judgeQwen(rc, out);
    default:
      throw new Error('unknown lane ' + lane);
  }
}

// A judge is type-guarded, but this is the backstop: an exception from any
// judge would escape main() as cli-run's own crash and be misread as a
// wrapper bug. It becomes a classifiable verdict instead (class cut_short).
export function safeJudge(lane, rc, out, err, outFile) {
  try {
    return judge(lane, rc, out, err, outFile);
  } catch (e) {
    return fail('judge_raised', `judge raised ${(e && e.name) || 'Error'}: ${(e && e.message) || e}`);
  }
}

// --- failure classes: WHY a run failed --------------------------------------
// Every function here returns a safe default instead of throwing. Signals are
// read from a lane's authoritative error fields only, never from assistant
// prose, and each one was taken from a captured vendor shape, not guessed.

// Terminal output only; nothing redacted here reaches the durable log anyway.
// Redact BEFORE clipping: a clip first can cut a long token so its tail no
// longer matches any pattern.
export const SECRET_PATTERNS = [
  // A JSON string value, escapes included; an unterminated value (a clipped line) runs to the end.
  // The optional backslashes also catch a JSON body escaped inside another string.
  [/(\\?"(?:api[_-]?key|token|secret|password|access[_-]?token)\\?"\s*:\s*)\\?"(?:[^"\\]|\\.)*(?:"|$)/gi, '$1"[REDACTED]"'],
  [/(authorization\s*:\s*)(\S+)\s+\S+/gi, '$1$2 [REDACTED]'],
  [/([?&](?:token|key|api_key|access_token|sig)=)[^&\s"'<>]+/gi, '$1[REDACTED]'],
  [/(bearer\s+)[A-Za-z0-9._+/=-]{8,}/gi, '$1[REDACTED]'],
  [/sk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]'],
  [/xai-[A-Za-z0-9_-]{8,}/g, '[REDACTED]'],
  [/ghp_[A-Za-z0-9_-]{8,}/g, '[REDACTED]'],
  [/AIza[A-Za-z0-9_-]{8,}/g, '[REDACTED]']
];
export function redact(text) {
  if (typeof text !== 'string') return text;
  let s = text;
  for (const [pat, repl] of SECRET_PATTERNS) s = s.replace(pat, repl);
  return s;
}

function* jsonLines(out) {
  for (const raw of String(out || '').split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('{') || line.length > 1_000_000) continue;
    let o;
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    if (o && typeof o === 'object' && !Array.isArray(o)) yield o;
  }
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// codex: only its own `error`, `turn.failed` and error-item events. Never an
// agent_message, which is the model talking.
export function codexErrorEventsText(out) {
  const parts = [];
  for (const o of jsonLines(out)) {
    if (o.type === 'error' && typeof o.message === 'string') parts.push(o.message);
    else if (o.type === 'turn.failed') {
      if (isObj(o.error) && typeof o.error.message === 'string') parts.push(o.error.message);
      else if (typeof o.error === 'string') parts.push(o.error);
    } else if (o.type === 'item.completed' && isObj(o.item) && o.item.type === 'error' && typeof o.item.message === 'string') {
      parts.push(o.item.message);
    }
  }
  return parts.join('\n');
}

// agy: only the terminal result event's own status and error fields.
export function agyResultFieldsText(out) {
  const parts = [];
  for (const o of jsonLines(out)) {
    if (o.event !== 'result' || !isObj(o.result)) continue;
    if (typeof o.result.status === 'string') parts.push(o.result.status);
    const e = o.result.error;
    if (typeof e === 'string') parts.push(e);
    else if (isObj(e) && typeof e.message === 'string') parts.push(e.message);
  }
  return parts.join('\n');
}

// codex often carries the upstream's JSON error body as a string inside
// `message`; one level is unwrapped to the human-readable text underneath.
function unwrapJsonMessage(msg) {
  try {
    const p = JSON.parse(msg);
    if (isObj(p) && isObj(p.error) && typeof p.error.message === 'string') return p.error.message;
  } catch {
    /* not JSON */
  }
  return msg;
}

// The single most specific native codex error, preferring a top-level `error`
// event over `turn.failed`, so a problem line names the real cause instead of
// "no terminal turn.completed event".
export function codexPrimaryError(out) {
  const errors = [], failed = [];
  for (const o of jsonLines(out)) {
    if (o.type === 'error' && typeof o.message === 'string' && o.message) errors.push(unwrapJsonMessage(o.message));
    else if (o.type === 'turn.failed') {
      const m = isObj(o.error) ? o.error.message : o.error;
      if (typeof m === 'string' && m) failed.push(unwrapJsonMessage(m));
    }
  }
  return errors[0] || failed[0] || null;
}

function hermesQuotaText(lower) {
  return lower.includes('no usable content') || lower.includes('limit') || lower.includes('degraded');
}

// qwen: the terminal event's full error text, and a result that is an API error.
// Never the display detail, which is clipped and can carry a model name.
export function qwenErrorText(out) {
  let events;
  try {
    events = JSON.parse(out);
  } catch {
    return '';
  }
  const term = Array.isArray(events) && events.length ? events[events.length - 1] : null;
  if (!isObj(term)) return '';
  const parts = [];
  if (typeof term.error === 'string') parts.push(term.error);
  else if (isObj(term.error) && typeof term.error.message === 'string') parts.push(term.error.message);
  if (typeof term.result === 'string' && term.result.trim().startsWith('[API Error:')) parts.push(term.result);
  return parts.join('\n');
}

function authoritativeBlob(lane, out, err, detail, rc) {
  if (lane === 'codex') return `${codexErrorEventsText(out)}\n${err || ''}`;
  if (lane === 'agy') return `${agyResultFieldsText(out)}\n${err || ''}`;
  if (lane === 'hermes') return rc !== 0 ? String(err || '') : '';
  if (lane === 'qwen') return `${qwenErrorText(out)}\n${err || ''}`;
  return `${detail || ''}\n${err || ''}`; // grok: no auth, quota or rejected signal is defined
}

export function sigAuth(lane, blob) {
  const b = blob.toLowerCase();
  if (lane === 'qwen') return b.includes('missing api key');
  if (lane === 'agy') return b.includes('you are not logged into antigravity') || b.includes('not authenticated');
  return false; // codex, grok, hermes: no documented native auth signal
}

export function sigQuota(lane, blob) {
  const b = blob.toLowerCase();
  if (lane === 'qwen') return b.includes('[api error: 402') || b.includes('requires more credits') || blob.includes(' 429') || b.includes('rate limit');
  if (lane === 'codex') return blob.includes('usage_limit_exceeded') || b.includes("you've hit your usage limit");
  if (lane === 'hermes') return hermesQuotaText(b);
  return false;
}

export function sigRejected(lane, blob) {
  const b = blob.toLowerCase();
  if (lane === 'qwen') return b.includes('[api error: 400') || b.includes('no endpoints found') || b.includes('failed to parse grammar');
  if (lane === 'codex') return blob.includes('invalid_request_error');
  if (lane === 'hermes') return b.includes('toolset');
  return false;
}

// Which judge reasons mean the lane never reached a trustworthy finish, as
// opposed to finishing cleanly with nothing in it (class empty).
const CUT_SHORT_REASONS = {
  grok: new Set(['not_json', 'bad_stop_reason']),
  codex: new Set(['no_terminal_event']),
  agy: new Set(['no_terminal_event', 'bad_last_event']),
  qwen: new Set(['not_json', 'bad_event_array', 'bad_last_event', 'not_result', 'error_message_not_string']),
  hermes: new Set()
};
function isCutShort(lane, reason, rc) {
  if (reason === 'judge_raised') return true;
  if (reason === 'ok') return true; // text came back but the vendor exited nonzero
  // A nonzero vendor exit no signal explains never finished on its own terms.
  // hermes' exit 2 is the one honest vendor code for "bad args, or an empty response".
  if (rc !== 0) return !(lane === 'hermes' && rc === 2);
  return !!(CUT_SHORT_REASONS[lane] && CUT_SHORT_REASONS[lane].has(reason));
}

// --- refused: how many tool calls a hook or deny rule blocked ----------------
// null means the lane gave no readable signal, which is an unknown, never 0.
export function refusedQwen(out) {
  let events;
  try {
    events = JSON.parse(out);
  } catch {
    return null;
  }
  if (!Array.isArray(events) || !events.length || !isObj(events[events.length - 1])) return null;
  const pd = events[events.length - 1].permission_denials;
  return Array.isArray(pd) ? pd.length : null;
}

export function refusedAgy(out) {
  let found = false, count = 0;
  for (const o of jsonLines(out)) {
    found = true;
    const e = isObj(o.step_update) && isObj(o.step_update.tool_info) ? o.step_update.tool_info.error : null;
    if (isObj(e) && e.type === 'TOOL_ERROR' && typeof e.message === 'string') {
      const m = e.message.toLowerCase();
      if (m.includes('permission check failed') || m.includes('matches user-configured deny rule')) count++;
    }
  }
  return found ? count : null;
}

// codex's router writes one `Rejected(` line per blocked command on stderr.
// Each line counts. Prose such as "operation not permitted" in an answer does
// not: it matches a model merely explaining the phrase.
const CODEX_ROUTER_REJECTED = /codex_core::tools::router:[^\n]*Rejected\(/gi;
export function refusedCodex(out, err) {
  let count = (String(err || '').match(CODEX_ROUTER_REJECTED) || []).length;
  for (const o of jsonLines(out)) {
    // Forward-compatible only: a structural denial item, never prose.
    if (o.type === 'item.completed' && isObj(o.item) && (o.item.type === 'command_denied' || o.item.type === 'denied')) count++;
  }
  return count || null;
}

// grok never reports a refusal in stdout. It lives in the session transcript,
// ~/.grok/sessions/<cwd, percent-encoded>/<sessionId>/updates.jsonl, one
// {"params":{"sessionId","update"}} envelope per line. Two denial shapes are
// counted: a PreToolUse hook run with status.blocked, and grok's own deny-rule
// engine ("Denied by permission policy"). The sessionId comes from lane output,
// so it is held to a narrow charset before any path is built, the resolved path
// must stay inside the sessions root, every counted line must name the same
// session, and the read is capped.
export const GROK_SESSION_ID = /^[A-Za-z0-9-]{8,64}$/;
export const GROK_TRANSCRIPT_CAP = 5 * 1024 * 1024;
// grok encodes the cwd the way Python's urllib.parse.quote(cwd, safe="") does.
function percentEncodePath(p) {
  return encodeURIComponent(p).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
// Path-aware containment. A string-prefix test accepts a sibling such as
// "sessions-2", or on POSIX a directory literally named "sessions\outside".
export function isInsideRoot(root, p, pathApi = { relative, isAbsolute, sep }) {
  const rel = pathApi.relative(root, p);
  return !!rel && !pathApi.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + pathApi.sep);
}
export function refusedGrok(out, { root = process.env.CLI_RUN_GROK_SESSIONS_ROOT || join(homedir(), '.grok', 'sessions'), cwd = process.cwd(), cap = GROK_TRANSCRIPT_CAP } = {}) {
  let o;
  try {
    o = JSON.parse(out);
  } catch {
    return null;
  }
  const sid = isObj(o) ? o.sessionId : null;
  if (typeof sid !== 'string' || !GROK_SESSION_ID.test(sid)) return null;
  const path = join(root, percentEncodePath(cwd), sid, 'updates.jsonl');
  let data;
  let fd;
  try {
    const rootReal = realpathSync(root);
    const pathReal = realpathSync(path);
    if (!isInsideRoot(rootReal, pathReal)) return null;
    if (!statSync(pathReal).isFile()) return null;
    fd = openSync(pathReal, 'r');
    const buf = Buffer.alloc(Math.max(0, Math.min(cap, statSync(pathReal).size)));
    let read = 0;
    while (read < buf.length) {
      const n = readSync(fd, buf, read, buf.length - read, read);
      if (!n) break;
      read += n;
    }
    data = buf.subarray(0, read).toString('utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) try { closeSync(fd); } catch {}
  }
  let count = 0, matched = false;
  for (const rec of jsonLines(data)) {
    if (!isObj(rec.params) || rec.params.sessionId !== sid) continue;
    matched = true;
    const u = rec.params.update;
    if (!isObj(u)) continue;
    if (u.sessionUpdate === 'hook_execution' && Array.isArray(u.runs)) {
      for (const r of u.runs) if (isObj(r) && isObj(r.status) && r.status.blocked === true) count++;
    } else if (u.sessionUpdate === 'tool_call_update' && u.status === 'failed') {
      let blob = '';
      try { blob = JSON.stringify(u.content ?? '').toLowerCase(); } catch {}
      if (blob.includes('denied by permission policy') || blob.includes('hook denied')) count++;
    }
  }
  return matched ? count : null;
}

export function countRefused(lane, out, err, opts) {
  try {
    if (lane === 'qwen') return refusedQwen(out);
    if (lane === 'agy') return refusedAgy(out);
    if (lane === 'codex') return refusedCodex(out, err);
    if (lane === 'grok') return refusedGrok(out, opts);
    return null; // hermes: no native refusal signal
  } catch {
    return null;
  }
}

// Runs after the lane has exited, so adversarial output must not make it slow:
// the input is bounded and every repeat is bounded. Redacted before any match
// can clip a secret.
const DENIAL_SCAN_BYTES = 256 * 1024;
function firstDenialText(out, err) {
  const blob = redact(`${String(out || '').slice(0, DENIAL_SCAN_BYTES)}\n${String(err || '').slice(0, DENIAL_SCAN_BYTES)}`);
  for (const pat of [
    /Permission denied for command\([^)\n]{0,200}\)\. Matches user-configured deny rule\./,
    /Denied by permission policy:[^\n"]{0,160}/,
    /Hook denied:[^\n"]{0,160}/,
    /denied:[^\n"]{0,160}/,
    /[Rr]ejected:[^\n"]{0,160}/,
    /error=exec_command failed:[^\n]{0,160}/
  ]) {
    const m = pat.exec(blob);
    if (m) return m[0].trim();
  }
  return null;
}

// A lane often paraphrases a refusal in its own words; a short head of its
// answer names it when no exact denial phrase matches.
function deliverableSnippet(out, limit = 160) {
  let o;
  try {
    o = JSON.parse(out);
  } catch {
    return redact(String(out || '').slice(0, 4096)).trim().slice(0, limit) || null;
  }
  if (!isObj(o)) return null;
  for (const k of ['text', 'response', 'result']) if (typeof o[k] === 'string' && o[k].trim()) return redact(o[k].slice(0, 4096)).trim().slice(0, limit);
  return null;
}

const FIX = {
  auth: 'set the credential the message above names (its environment variable, or the lane\'s own login command), then rerun',
  quota: 'switch to another lane, or wait for the reset time if the message gave one',
  rejected: 'correct the model id, flag or request the upstream message names',
  refused: 'adjust the hook or deny rule named above, or give this lane the tool it needs',
  cut_short: 'rerun once; if it recurs, run without --quiet and read the lane\'s stderr on the terminal',
  empty: 'rerun once, or use another lane',
  timeout: 'raise --timeout, or split the brief into smaller pieces',
  no_output: 'rerun once; if it recurs, check that the lane runs on its own outside cli-run'
};

// A one-line problem naming the concrete cause, and a one-line fix. The caller
// relays both. Returns { problem: null, fix: null } when there is nothing to say.
export function problemAndFix(lane, cls, { out = '', err = '', detail = '', refused = null, authoritative = null } = {}) {
  const cause = typeof authoritative === 'string' && authoritative.trim() ? redact(authoritative).trim() : null;
  const d = typeof detail === 'string' && detail ? redact(detail) : null;
  const tag = `cli-run[${lane}]`;
  const denial = () => firstDenialText(out, err) || deliverableSnippet(out) || d;
  switch (cls) {
    case 'auth': return { problem: `${tag} auth: ${cause || d || 'missing or invalid credentials'}`, fix: FIX.auth };
    case 'quota': return { problem: `${tag} quota: ${cause || d || 'rate limit or credits exhausted'}`, fix: FIX.quota };
    case 'rejected': return { problem: `${tag} rejected: ${cause || d || 'the upstream rejected the request'}`, fix: FIX.rejected };
    case 'refused': return { problem: `${tag} refused: ${denial() || 'a hook or deny rule blocked the call'}`, fix: FIX.refused };
    case 'cut_short': return { problem: `${tag} cut short: ${d || 'no terminal success event, cause not identifiable'}`, fix: FIX.cut_short };
    case 'empty': return { problem: `${tag} empty: ${d || 'completed but delivered nothing'}`, fix: FIX.empty };
    case 'timeout': return { problem: `${tag} timeout: ${d || 'exceeded the wall clock'}`, fix: FIX.timeout };
    case 'unavailable': return { problem: `${tag} unavailable: ${d || 'binary not found on PATH'}`, fix: `install the ${lane} CLI and put it on PATH, or enable it in lanes.json` };
    case 'no_output': return { problem: `${tag} no output: the process wrote nothing to stdout or stderr`, fix: FIX.no_output };
    case 'ok':
      if (Number.isInteger(refused) && refused > 0) {
        return { problem: `${tag} ok, but ${refused} call(s) were refused: ${denial() || 'a hook or deny rule blocked part of the call'}`, fix: FIX.refused };
      }
      return { problem: null, fix: null };
    default:
      return { problem: null, fix: null };
  }
}

// Classify a judged run. `reason`/`detail` are the judge's own (not the
// wrapper's decorated detail). A nonzero vendor exit is never ok, whatever
// came back. Never throws.
export function classifyRun(lane, { rc = 0, out = '', err = '', reason = '', detail = '', text = '', refusedOpts } = {}) {
  out = typeof out === 'string' ? out : '';
  err = typeof err === 'string' ? err : '';
  detail = typeof detail === 'string' ? detail : '';
  const refused = countRefused(lane, out, err, refusedOpts);
  let cls;
  try {
    if (text && rc === 0) cls = 'ok';
    else if (!out.trim() && !err.trim()) cls = 'no_output';
    else {
      const blob = authoritativeBlob(lane, out, err, detail, rc);
      if (sigAuth(lane, blob)) cls = 'auth';
      else if (sigQuota(lane, blob)) cls = 'quota';
      else if (sigRejected(lane, blob)) cls = 'rejected';
      else if (Number.isInteger(refused) && refused > 0) cls = 'refused';
      else if (isCutShort(lane, reason, rc)) cls = 'cut_short';
      else cls = 'empty';
    }
  } catch {
    cls = 'cut_short';
  }
  return { cls, refused };
}

// --- the process boundary --------------------------------------------------
// The lane runs DETACHED, so it leads its own process group. On timeout (or an
// output-buffer overrun) the whole group is killed, not just the direct child:
// an agent CLI that shelled out to a tool must not keep working after the
// wrapper has reported 12. A child that calls setsid() itself escapes this
// boundary; that is documented, not hidden.
// Models often wrap JSON in one markdown fence. --expect-json accepts exactly that shape:
// the whole trimmed response is one fenced block, optionally tagged json. Prose before or
// after the fence still fails, because then the deliverable is not the JSON (#17).
export function unfence(text) {
  const t = String(text).trim();
  const m = /^```(?:json|JSON)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/.exec(t);
  return m ? m[1].trim() : t;
}

// --- Windows: spawning a lane without a shell ------------------------------
// Node's fix for CVE-2024-27980 makes spawn() throw EINVAL for a .bat/.cmd
// target unless shell:true is set: launching a batch file always goes
// through cmd.exe, and cmd.exe reads metacharacters (& | ^ < > ( ) % " and
// space) directly off the command line before the target program's own argv
// is parsed, even inside quotes. A lane's argv[1] here is a user PROMPT, text
// this wrapper does not control the contents of, so that is a real injection
// surface, not a theoretical one.
//
// npm installs every CLI on Windows as a "cmd-shim": a short .cmd launcher
// that hands off to node with a script path (see npm's own `cmd-shim`
// package). Reading that path out and spawning node directly sidesteps
// cmd.exe, and the injection surface it carries, entirely: this is the
// preferred path, used whenever the shim matches the shape cmd-shim writes.
//
// A LANE whose .cmd/.bat does not match (hand-written, or an older cmd-shim
// layout) is refused, not run through cmd.exe: a batch file re-reads its
// arguments through %* after cmd.exe has already parsed them once, which is
// the case CVE-2024-27980 is about, and no escaping fully contains user text
// through both passes. Removing that path beats guarding it.
//
// The cmd.exe path survives only for a caller that opts in with
// { allowCmdFallback: true } and passes arguments it fully controls (the
// installer's own `npm install -g <pinned spec>`, whose npm.cmd is not a
// cmd-shim). It uses the caret-escaping algorithm documented at
// https://qntm.org/cmd and used by `cross-spawn`: quote each argument for
// CommandLineToArgvW, THEN caret-escape cmd.exe's own metacharacters, THEN
// pass the whole line with windowsVerbatimArguments so Node does not
// re-quote it a second, conflicting way.
const NPM_CMD_SHIM = /"%_prog%"\s+"([^"]+)"\s*%\*/;
export function resolveCmdShim(cmdPath) {
  let text;
  try {
    text = readFileSync(cmdPath, 'utf8');
  } catch {
    return null;
  }
  const m = NPM_CMD_SHIM.exec(text);
  if (!m) return null;
  const dp0 = /^%~?dp0%?[\\/]?/i;
  if (!dp0.test(m[1])) return null; // only the %dp0%-relative shape cmd-shim writes
  const rel = m[1].replace(dp0, '').replace(/\\/g, '/');
  let script;
  try {
    script = resolve(dirname(cmdPath), rel);
    if (!statSync(script).isFile()) return null;
  } catch {
    return null;
  }
  // Only ever hand off to node for a real JS entry point; anything else (a
  // shim generated for a non-node binary, or a hand-edited file) falls
  // through to the cmd.exe fallback instead of being executed as a script.
  return /\.(m?js|cjs)$/i.test(script) ? script : null;
}

function escapeCmdArg(arg) {
  let s = String(arg);
  // A run of backslashes immediately before a quote (or at the very end of
  // the argument) must be doubled, or CommandLineToArgvW on the receiving
  // end eats one; this is the standard Windows argv-quoting rule, not a
  // cmd.exe-specific one.
  s = s.replace(/(\\*)"/g, '$1$1\\"');
  s = s.replace(/(\\*)$/, '$1$1');
  s = `"${s}"`;
  // cmd.exe reads these characters off the raw command line and acts on
  // them (pipe, redirect, chain, subshell, percent-expand, the caret escape
  // itself) whether or not they sit inside a quoted argument.
  return s.replace(/[()%!^"<>&|;, ]/g, '^$&');
}

function buildCmdExeCommand(cmdPath, args) {
  return [escapeCmdArg(cmdPath), ...args.map(escapeCmdArg)].join(' ');
}

// Decides what spawn() actually receives. POSIX and a plain .exe/extensionless
// binary on win32 are unchanged: no shell, argv passed straight through.
export function windowsSpawnPlan(argv, platform = process.platform, { allowCmdFallback = false } = {}) {
  const [bin, ...args] = argv;
  if (platform !== 'win32' || !/\.(cmd|bat)$/i.test(bin)) {
    return { command: bin, args, options: {} };
  }
  const script = resolveCmdShim(bin);
  if (script) return { command: process.execPath, args: [script, ...args], options: {} };
  if (!allowCmdFallback) {
    return {
      refuse: `${bin} is a batch file that is not a standard npm shim, and cli-run never passes a prompt through cmd.exe. Reinstall the CLI with npm (npm install -g <package>) so npm writes a standard shim, or put the CLI's .exe first on PATH.`
    };
  }
  const comspec = process.env.ComSpec || process.env.COMSPEC || 'C:\\Windows\\System32\\cmd.exe';
  return { command: comspec, args: ['/d', '/s', '/c', buildCmdExeCommand(bin, args)], options: { windowsVerbatimArguments: true } };
}

// Kill a lane and everything it spawned. POSIX: the detached process group.
// Windows has no process groups a signal can reach, so taskkill walks the
// tree (#18): whether the direct child is node (the resolved-shim path) or
// cmd.exe (the fallback), taskkill /T reaches every descendant either way.
// taskkill is resolved by an absolute path under SystemRoot rather than a
// bare command name: this call must not depend on PATH containing
// System32, which real callers cannot guarantee (this project's own test
// harness deliberately narrows PATH to isolate a fake lane, and hit
// exactly this on windows-latest CI: `spawn taskkill ENOENT`) and a
// sandboxed or otherwise stripped-down environment might not either.
// %SystemRoot% is the documented, always-set location; %windir% is the
// older equivalent kept as a fallback; C:\Windows is the last resort.
export function taskkillPath(env = process.env) {
  // Always a Windows path, built with a literal backslash rather than
  // node:path's join(): join() picks its separator from the HOST running
  // this code, not from the OS the path describes, so on a POSIX host (this
  // test suite runs on all three) it would join with "/" and silently
  // produce a path Windows itself would not recognize as one.
  const root = String(env.SystemRoot || env.windir || 'C:\\Windows').replace(/[\\/]+$/, '');
  return `${root}\\System32\\taskkill.exe`;
}

export function killTree(pid, platform = process.platform, deps = { kill: (p, sig) => process.kill(p, sig), spawn }) {
  if (platform === 'win32') {
    const child = deps.spawn(taskkillPath(), ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    // Fire-and-forget: nothing here awaits taskkill's own exit. But a spawn
    // failure (ENOENT if this host's layout is unusual, EPERM, ...) still
    // emits an async 'error' event on the returned ChildProcess, and Node
    // treats an EventEmitter's unheard 'error' as fatal, crashing the whole
    // wrapper mid-run over what should be a best-effort cleanup step.
    if (child && typeof child.on === 'function') child.on('error', () => {});
    return 'taskkill';
  }
  deps.kill(-pid, 'SIGKILL');
  return 'group';
}

export function runBounded(argv, timeoutSec, maxBuffer = 16 * 1024 * 1024) {
  return new Promise((resolveRun) => {
    const t0 = Date.now();
    let child = null;
    let interrupted = null;
    // Signal handlers go on BEFORE the spawn. The child starts running the
    // moment spawn() forks, so a handler registered afterwards leaves a window
    // in which the lane is alive and a SIGTERM to the wrapper would take the
    // default action: the wrapper dies, the detached lane lives on. CI on a slow
    // runner hit exactly that window.
    const killGroup = () => {
      if (!child) return;
      try {
        killTree(child.pid);
      } catch {
        try {
          child.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
    };
    const onSignal = (sig) => {
      if (interrupted) {
        killGroup();
        process.exit(128 + (sig === 'SIGINT' ? 2 : 15));
      }
      interrupted = sig;
      killGroup();
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    try {
      const plan = windowsSpawnPlan(argv);
      if (plan.refuse) throw new Error(plan.refuse); // reported as lane unavailable, exit 13
      child = spawn(plan.command, plan.args, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', ...plan.options });
    } catch (e) {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      return resolveRun({ status: null, signal: null, stdout: '', stderr: '', error: e, seconds: 0 });
    }
    if (interrupted) killGroup(); // a signal landed between registering and forking
    // Streaming decoders: a multibyte UTF-8 character split across two chunks
    // must not become replacement characters. Limits are counted in BYTES.
    const outDec = new StringDecoder('utf8');
    const errDec = new StringDecoder('utf8');
    let out = '';
    let err = '';
    let outBytes = 0;
    let errBytes = 0;
    let timedOut = false;
    let overrun = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killGroup();
    }, timeoutSec * 1000);
    child.stdout.on('data', (d) => {
      outBytes += d.length;
      if (outBytes > maxBuffer) {
        if (!overrun) {
          overrun = true;
          killGroup();
        }
        return;
      }
      out += outDec.write(d);
    });
    child.stderr.on('data', (d) => {
      errBytes += d.length;
      if (errBytes <= 64 * 1024) err += errDec.write(d);
    });
    const finish = (status, signal, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      out += outDec.end();
      err += errDec.end();
      // Resolve on the child's exit with a short grace for the pipes, so a stray
      // descendant holding stdout cannot keep this promise open.
      setTimeout(() => resolveRun({ status, signal, stdout: out, stderr: err, error, timedOut, overrun, interrupted, outBytes, seconds: (Date.now() - t0) / 1000 }), 20);
    };
    child.on('error', (e) => finish(null, null, e));
    child.on('exit', (status, signal) => {
      // exit fires when the direct child ends; kill the rest of its group so a
      // detached grandchild cannot outlive a run that ended normally either.
      killGroup();
      finish(status, signal, null);
    });
  });
}

function log(rec) {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, JSON.stringify(rec) + '\n');
  } catch {
    /* logging never changes the outcome */
  }
}

// lanes.json sits beside this script. ABSENT = every lane enabled (the
// documented default). PRESENT BUT UNREADABLE OR MALFORMED = no lane enabled:
// a half-written config must fail closed, never re-enable what the installer
// disabled. Returns null when the file is bad so the caller can say so.
export function laneConfig(here = dirname(fileURLToPath(import.meta.url))) {
  const p = join(here, 'lanes.json');
  if (!existsSync(p)) return { enabled: LANES, defaults: {} };
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    if (!j || typeof j !== 'object' || !Array.isArray(j.enabled)) return null;
    if (!j.enabled.every((l) => typeof l === 'string' && LANES.includes(l))) return null;
    // `defaults` pins a model and effort per lane. It is optional; present and
    // malformed fails closed with the rest of the file, because a half-written
    // route is exactly the silent-inheritance problem this field exists to fix.
    const defaults = {};
    if (j.defaults !== undefined) {
      if (!j.defaults || typeof j.defaults !== 'object' || Array.isArray(j.defaults)) return null;
      for (const [lane, d] of Object.entries(j.defaults)) {
        if (!LANES.includes(lane)) return null;
        if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
        const { model, effort, ...rest } = d;
        if (Object.keys(rest).length) return null;
        if (model !== undefined && badRouteValue('model', model)) return null;
        if (effort !== undefined) {
          if (badRouteValue('effort', effort)) return null;
          if (effort.startsWith('auto') && effort !== 'auto') return null;
          if (!LANE_FLAGS[lane] || !LANE_FLAGS[lane].effort) return null; // a lane with no reasoning flag cannot have one pinned
        }
        defaults[lane] = { model: model ?? null, effort: effort ?? null };
      }
    }
    return { enabled: j.enabled, defaults };
  } catch {
    return null;
  }
}

// Kept as the narrow question most callers ask. null still means malformed.
export function enabledLanes(here = dirname(fileURLToPath(import.meta.url))) {
  const c = laneConfig(here);
  return c === null ? null : c.enabled;
}

// Flag beats lanes.json beats nothing. `source` is what makes the log audit-worthy:
// 'lane_default' means this run inherited the vendor CLI's own config, unseen from here.
export function resolveRoute(lane, opts, defaults) {
  const d = (defaults && defaults[lane]) || {};
  const model = opts.model ?? d.model ?? null;
  const effort = opts.effort ?? d.effort ?? null;
  const src = (flag, def) => (flag != null ? 'flag' : def != null ? 'lanes.json' : 'lane_default');
  return { model, effort, model_source: src(opts.model, d.model), effort_source: src(opts.effort, d.effort) };
}

function usage(msg) {
  if (msg) console.error('cli-run: ' + msg);
  console.error(`usage: cli-run <${LANES.join('|')}> "<prompt>" [--brief FILE] [--timeout SECS] [--quiet]
                [--model ID] [--effort LEVEL] [--expect-file PATH] [--expect-json]
       cli-run codex --audit "<prompt>"          read-only sandbox (audit shape)
       cli-run qwen [--safe-mode] "<prompt>"     qwen-only flag
       cli-run --doctor [--run]                  enabled lanes, binaries, and the route each one is pinned to

  --model / --effort pin what a lane runs with, instead of letting it inherit its
  own config. Every lane takes --model; every lane except qwen takes --effort.
  Levels are the vendor's own (agy low|medium|high, hermes none|minimal|...): an
  unknown level is rejected by the lane, and reported by class (codex: rejected, 16).
  Exit codes: 0 ok, 10 empty, 11 no output, 12 timeout, 13 unavailable, 14 auth,
  15 quota, 16 rejected, 17 refused, 18 cut short. Failures print a problem and a fix line.
  auto sizes per call: below 4,000 prompt characters is medium, otherwise high; a codex audit is always high. Auto never resolves above high.
  Pin them per lane instead of per call with "defaults" in bin/lanes.json.`);
  return USAGE;
}

// Bounded, control-character-free head of vendor stderr for the terminal.
// Never logged: provider text can echo whatever the prompt contained.
function stderrHead(err, n = 300) {
  const s = redact(String(err || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')).trim();
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// MANIFEST.json sits one level above bin/. Only the primary id is read from it,
// and only to explain why the primary is absent from the lane list.
function installedPrimary(here = dirname(fileURLToPath(import.meta.url))) {
  const p = join(here, '..', 'MANIFEST.json');
  try {
    if (!existsSync(p) || statSync(p).size > 1024 * 1024) return null;
    const m = JSON.parse(readFileSync(p, 'utf8'));
    return m && typeof m.primary === 'string' && /^[a-z0-9-]+$/.test(m.primary) ? m.primary : null;
  } catch {
    return null;
  }
}

// --doctor: the first thing to run after install.
export async function doctor(run) {
  const cfg = laneConfig();
  if (cfg === null) {
    console.error('doctor: lanes.json exists but is malformed; fix it first');
    return USAGE;
  }
  const { enabled, defaults } = cfg;
  let bad = 0;
  console.log(`doctor: ${enabled.length} enabled lane(s): ${enabled.join(', ') || 'none'}`);
  const primary = installedPrimary();
  if (primary && !enabled.includes(primary)) console.log(`  note: ${primary} is the primary agent and is not an executable lane`);
  if (!enabled.length) {
    console.error('doctor: inactive: no executable lanes enabled. Use level 1 for a single-agent setup, or re-run the installer with a supported CLI selected.');
    return UNAVAILABLE;
  }
  for (const lane of LANES) {
    const on = enabled.includes(lane);
    const bin = which(lane);
    const d = defaults[lane] || {};
    // A disabled lane has no route worth reporting; saying "not pinned" there
    // reads as a finding about a lane that is not going to run.
    const route = !on ? '' : d.effort === 'auto' ? `route ${d.model || 'lane default'}/auto (sized per call)` : d.model || d.effort ? `route ${d.model || 'lane default'}/${d.effort || 'lane default'}` : 'route not pinned (inherits the lane\'s own config)';
    let line = `  ${lane.padEnd(7)} ${on ? 'enabled ' : 'disabled'} ${bin ? 'binary ok' : 'binary MISSING'}${route ? '  ' + route : ''}`;
    if (on && !bin) bad++;
    if (on && bin && run) {
      const rc = await main([lane, 'Reply with exactly the word OK and nothing else.', '--timeout', '120', '--quiet']);
      line += rc === OK ? '  canary ok' : `  canary FAILED rc=${rc}`;
      if (rc !== OK) bad++;
    }
    console.log(line);
  }
  console.log(bad ? `doctor: ${bad} problem(s)` : 'doctor: all enabled lanes ' + (run ? 'answered' : 'present'));
  console.log('doctor checks presence and, with --run, a one-word canary. It does not check vendor versions.');
  console.log('"route not pinned" means that lane runs on whatever its own config file says, which this tool cannot see. Pin it in lanes.json "defaults" if the route matters.');
  return bad ? NO_DELIVERABLE : OK;
}

// Opt-in contracts. A refusal that parses cleanly is a structurally accepted
// response; these are how a caller says "that is not enough for this task".
// --expect-file compares the artifact AFTER the run with a snapshot taken
// BEFORE it: the file must exist, be non-empty, and be new or changed (a
// different content hash, or a later mtime). An artifact that already existed
// and was not touched fails, however recent it is; a timestamp window alone
// cannot prove this run produced it.
export function snapshotFile(p) {
  try {
    const st = statSync(p);
    if (!st.isFile()) return { exists: true, file: false };
    return { exists: true, file: true, mtimeMs: st.mtimeMs, size: st.size, sha: createHash('sha256').update(readFileSync(p)).digest('hex') };
  } catch {
    return { exists: false };
  }
}

export function checkContracts(opts, text, before) {
  if (opts.expectFile) {
    const p = resolve(opts.expectFile);
    const after = snapshotFile(p);
    if (!after.exists) return `--expect-file: ${p} does not exist after the run`;
    if (!after.file || after.size === 0) return `--expect-file: ${p} is empty or not a regular file`;
    if (before && before.exists) {
      const changed = !before.file || after.sha !== before.sha || after.mtimeMs > before.mtimeMs;
      if (!changed) return `--expect-file: ${p} existed before the run and was not changed by it (same content, same mtime); a pre-existing artifact is not this run's deliverable`;
    }
  }
  if (opts.expectJson) {
    try {
      JSON.parse(unfence(text));
    } catch {
      return '--expect-json: the response is not valid JSON (a single ```json fence around the whole response is accepted; prose around it is not)';
    }
  }
  return null;
}

export async function main(argv) {
  const VALUE = new Set(['--brief', '--timeout', '--model', '--effort', '--expect-file']);
  const BOOL = new Set(['--quiet', '--audit', '--safe-mode', '--doctor', '--run', '--expect-json']);
  const args = [...argv];
  const opts = { timeout: 900, quiet: false, audit: false, model: null, effort: null, safeMode: false, brief: null, doctor: false, run: false, expectFile: null, expectJson: false };
  const positional = [];
  while (args.length) {
    const a = args.shift();
    if (VALUE.has(a)) {
      const v = args.shift();
      if (v === undefined || v.startsWith('--')) return usage(`${a} requires a value`);
      if (a === '--brief') opts.brief = v;
      else if (a === '--timeout') opts.timeout = Number(v);
      else if (a === '--expect-file') opts.expectFile = v;
      else if (a === '--effort') opts.effort = v;
      else opts.model = v;
    } else if (BOOL.has(a)) {
      if (a === '--quiet') opts.quiet = true;
      else if (a === '--audit') opts.audit = true;
      else if (a === '--doctor') opts.doctor = true;
      else if (a === '--run') opts.run = true;
      else if (a === '--expect-json') opts.expectJson = true;
      else opts.safeMode = true;
    } else if (a.startsWith('--')) return usage('unknown flag ' + a);
    else positional.push(a);
  }
  if (opts.doctor) {
    if (positional.length) return usage('--doctor takes no lane or prompt');
    return doctor(opts.run);
  }
  if (opts.run) return usage('--run only applies with --doctor');
  const lane = positional[0];
  if (!LANES.includes(lane)) return usage('lane must be one of ' + LANES.join(', '));
  if (positional.length > 2) return usage('unexpected extra argument: ' + positional.slice(2).join(' '));
  if (positional[1] !== undefined && opts.brief) return usage('give a prompt OR --brief, not both');
  let prompt = positional[1];
  if (opts.brief) {
    try {
      if (!statSync(opts.brief).isFile()) return usage('--brief must be a file: ' + opts.brief);
      prompt = readFileSync(opts.brief, 'utf8');
    } catch (e) {
      return usage('cannot read --brief ' + opts.brief + ': ' + (e && e.code ? e.code : e));
    }
  }
  if (!prompt) return usage('give a prompt or --brief FILE');
  if (!Number.isFinite(opts.timeout) || opts.timeout <= 0) return usage('--timeout must be a positive number of seconds');
  if (opts.audit && lane !== 'codex') return usage('--audit is codex-only');
  if (opts.safeMode && lane !== 'qwen') return usage('--safe-mode is qwen-only');
  for (const [kind, v] of [['model', opts.model], ['effort', opts.effort]]) {
    if (v == null) continue;
    const bad = badRouteValue(kind, v);
    if (bad) return usage(bad);
    if (kind === 'effort' && v.startsWith('auto') && v !== 'auto') return usage('--effort auto must be spelled exactly');
  }
  // qwen has no reasoning flag. Dropping --effort silently would leave the caller
  // believing a route that never happened, which is the defect this feature fixes.
  if (opts.effort && !(LANE_FLAGS[lane] && LANE_FLAGS[lane].effort)) return usage(`${lane} has no reasoning-effort flag; --effort is not available on this lane`);

  const digest = createHash('sha256').update(prompt).digest('hex').slice(0, 12);
  const base = { lane, prompt_sha256_12: digest, prompt_chars: prompt.length };
  const cfg = laneConfig();
  // Resolve the route BEFORE the refusals below. A run that never reached a lane
  // was still a request for one, and a failure record with no route is the exact
  // gap this feature exists to close. A malformed lanes.json has no usable
  // defaults, so the flags stand alone and say so.
  const route = resolveRoute(lane, opts, cfg === null ? {} : cfg.defaults);
  const sizing = resolveAutoEffort(lane, route.effort, prompt, opts.audit);
  opts.model = route.model;
  opts.effort = sizing.resolved;
  Object.assign(base, {
    model_requested: route.model,
    effort_requested: route.effort,
    model_source: route.model_source,
    effort_source: route.effort_source,
    effort_resolved: sizing.resolved,
    effort_basis: sizing.basis,
    effort_scope: sizing.scope,
    effort_truncated: sizing.truncated
  });
  const enabled = cfg === null ? null : cfg.enabled;
  const unavailable = ({ msg, reason, fix }) => {
    console.error('cli-run: ' + msg);
    if (!opts.quiet) console.error(`cli-run fix: ${fix}`);
    log({ ...base, verdict: 'unavailable', class: 'unavailable', rc: UNAVAILABLE, refused: null, reason });
    return UNAVAILABLE;
  };
  if (enabled === null) {
    return unavailable({ msg: 'lanes.json exists but is not a valid {"enabled": [...]} file; refusing every lane until it is fixed', reason: 'lanes_json_malformed', fix: 'fix bin/lanes.json, or delete it to enable every lane' });
  }
  if (!enabled.includes(lane)) {
    return unavailable({ msg: `${lane} is not enabled in lanes.json`, reason: 'disabled', fix: `add "${lane}" to "enabled" in bin/lanes.json, or use an enabled lane` });
  }
  const binary = which(lane);
  if (!binary) {
    return unavailable({ msg: `${lane} not found on PATH`, reason: 'unavailable', fix: `install the ${lane} CLI and put it on PATH` });
  }

  if (route.effort === 'auto' && !opts.quiet) console.error(`cli-run: effort auto -> ${sizing.resolved} (${sizing.basis})`);

  const tmp = mkdtempSync(join(tmpdir(), 'cli-run-'));
  const before = opts.expectFile ? snapshotFile(resolve(opts.expectFile)) : null;
  try {
    const { argv: cmd, outFile } = buildArgv(lane, binary, prompt, opts, tmp);
    const r = await runBounded(cmd, opts.timeout);
    const out = r.stdout || '';
    const err = r.stderr || '';
    let verdict, reason, detail, cls, text = '', refused = null;
    if (r.interrupted) {
      verdict = 'interrupted'; reason = 'killed'; detail = `cli-run received ${r.interrupted}; the lane's process group was killed`; cls = 'interrupted';
    } else if (r.timedOut) {
      verdict = 'timeout'; reason = 'timeout'; detail = `exceeded ${opts.timeout}s; process group killed`; cls = 'timeout';
    } else if (r.overrun) {
      verdict = 'no_deliverable'; reason = 'no_output'; detail = 'output exceeded the 16 MiB buffer; process group killed'; cls = 'cut_short';
    } else if (r.error) {
      verdict = 'unavailable'; reason = 'unavailable'; detail = r.error.message; cls = 'unavailable';
    } else if (r.signal || r.status === null) {
      // A lane killed by a signal has no honest exit status. Whatever it printed
      // before dying is not a deliverable; a null status must never become exit 0.
      verdict = 'killed'; reason = 'killed'; detail = `lane killed by ${r.signal || 'unknown signal'}`; cls = 'cut_short';
    } else {
      const j = safeJudge(lane, r.status, out, err, outFile);
      reason = j.reason;
      detail = j.detail;
      ({ cls, refused } = classifyRun(lane, { rc: r.status, out, err, reason: j.reason, detail: j.detail, text: j.text || '' }));
      if (r.status !== 0) {
        // A nonzero vendor exit is a failure on the vendor's own terms, whether or
        // not something parseable came back. The class names why; the vendor's
        // own code is kept as cli_rc, and its stderr head shows on the terminal.
        verdict = 'exit_nonzero';
        if (reason === 'ok') reason = 'exit_nonzero';
        const head = stderrHead(err);
        detail = `lane exited ${r.status}` + (head ? `; stderr: ${head}` : '') + (j.reason !== 'ok' ? `; ${j.detail}` : '');
      } else if (cls === 'ok') {
        const unmet = checkContracts(opts, j.text, before);
        if (unmet) {
          verdict = 'no_deliverable'; reason = 'contract_unmet'; detail = unmet; cls = 'empty';
        } else {
          verdict = 'ok'; text = j.text;
        }
      } else if (cls === 'no_output') {
        verdict = 'no_output'; reason = 'no_output';
      } else {
        verdict = 'no_deliverable';
        const head = stderrHead(err);
        if (head) detail += `; stderr: ${head}`;
      }
    }
    const code = cls === 'interrupted' ? 128 + (r.interrupted === 'SIGINT' ? 2 : 15) : CLASS_CODES[cls];
    if (text && code === OK) process.stdout.write(text + '\n');
    const routeNote = route.model || route.effort ? `${route.model || 'lane default'}/${route.effort || 'lane default'}` : 'lane default';
    if (!opts.quiet) {
      console.error(`cli-run[${lane}] ${verdict} rc=${code} class=${cls} refused=${refused === null ? 'null' : refused} ${r.seconds.toFixed(1)}s raw=${r.outBytes || 0}B route=${routeNote} :: ${redact(detail)}`);
      let authoritative = null;
      if (lane === 'codex' && (cls === 'quota' || cls === 'rejected')) authoritative = codexPrimaryError(out);
      const pf = problemAndFix(lane, cls, { out, err, detail, refused, authoritative });
      if (pf.problem) console.error('cli-run problem: ' + redact(pf.problem).slice(0, 600));
      if (pf.fix) console.error('cli-run fix: ' + pf.fix);
    }
    // Durable log: fixed reason code, fixed class and structural numbers only.
    log({ ...base, verdict, class: cls in CLASS_CODES || cls === 'interrupted' ? cls : 'unknown', rc: code, cli_rc: r.status, signal: r.signal || null, refused: Number.isInteger(refused) ? refused : null, seconds: Math.round(r.seconds * 100) / 100, raw_bytes: r.outBytes || 0, deliverable_bytes: Buffer.byteLength(text), reason: REASONS.has(reason) ? reason : 'unknown' });
    return code;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
  } catch {
    return false;
  }
}
if (isEntryPoint()) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
