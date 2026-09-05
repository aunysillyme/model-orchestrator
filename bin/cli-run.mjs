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
// Exit codes
//   0   structurally accepted non-empty response (and every --expect-* contract met)
//   10  ran, produced no deliverable, or a contract was not met, or killed by signal
//   11  produced no output at all
//   12  timed out (the lane AND its descendants are killed as a process group)
//   13  lane unavailable (missing binary, disabled in lanes.json, or lanes.json malformed)
//   130 / 143  cli-run itself received SIGINT / SIGTERM: the lane's process group was killed first
//   2   usage error in cli-run itself
//   N   the lane exited N != 0: passed through, verdict exit_nonzero, even if text came back
//
// The durable log stores a FIXED reason code per run (see REASONS), never a
// provider-supplied string. Bounded vendor stderr goes to your terminal only.

import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, appendFileSync, mkdtempSync, rmSync, accessSync, constants, realpathSync, statSync } from 'node:fs';
import { join, dirname, delimiter, resolve } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LANES = ['grok', 'codex', 'agy', 'hermes', 'qwen'];
export const OK = 0, NO_DELIVERABLE = 10, NO_OUTPUT = 11, TIMEOUT = 12, UNAVAILABLE = 13, USAGE = 2;

// Every reason that may reach the durable log. A judge or the wrapper picks
// one of these; anything else is written as 'unknown'. Provider text never
// enters this field, whatever it contains.
export const REASONS = new Set([
  'ok', 'not_json', 'bad_stop_reason', 'empty_text', 'no_terminal_event', 'empty_output_file',
  'bad_status', 'empty_response', 'exit_nonzero', 'empty_stdout', 'bad_event_array', 'bad_last_event',
  'not_result', 'bad_subtype', 'is_error', 'result_not_string', 'empty_result', 'api_error_in_result',
  'telemetry_absent', 'total_errors_unreadable', 'total_errors', 'contract_unmet',
  'timeout', 'unavailable', 'killed', 'disabled', 'lanes_json_malformed', 'no_output', 'unknown'
]);

const LOG = join(homedir(), '.ai-orchestrator', 'cli-run.log.jsonl');

function which(bin) {
  const dirs = (process.env['PATH'] || '').split(delimiter).filter(Boolean);
  const home = homedir();
  dirs.push(join(home, '.local', 'bin'), join(home, '.grok', 'bin'), join(home, '.npm-global', 'bin'));
  for (const d of dirs) {
    const p = join(d, bin);
    try {
      if (!statSync(p).isFile()) continue; // a directory named like the binary is not the binary
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      /* next */
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
  const term = ev.result && typeof ev.result === 'object' && !Array.isArray(ev.result) ? ev.result : {};
  const status = term.status;
  const text = typeof term.response === 'string' ? term.response.trim() : '';
  if (status !== 'SUCCESS') return fail('bad_status', `status=${JSON.stringify(status)}`);
  return text ? pass(text, 'status=SUCCESS') : fail('empty_response', 'SUCCESS but empty response');
}

export function judgeHermes(rc, out, err) {
  const text = String(out || '').trim();
  if (rc !== 0) {
    const why = { 1: 'no final response (agent produced nothing)', 2: 'bad args, or completed with an empty response' }[rc] || 'unknown failure';
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
    const msg = e && typeof e === 'object' && typeof e.message === 'string' ? e.message : e ? String(e) : '';
    return fail('bad_subtype', `subtype=${JSON.stringify(term.subtype)}` + (msg ? `: ${msg.slice(0, 120)}` : ''));
  }
  if (term.is_error) return fail('is_error', 'is_error true');
  if (term.result != null && typeof term.result !== 'string') return fail('result_not_string', `result was ${typeof term.result}, not a string`);
  const text = (term.result || '').trim();
  if (!text) return fail('empty_result', 'success but empty result');
  // qwen reports success even when the upstream API rejected the call; the
  // error text lands in `result`. These two checks are the honest ones.
  if (text.startsWith('[API Error:')) return fail('api_error_in_result', `success flag lied, result is an API error: ${text.slice(0, 140)}`);
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

// --- adapters: build argv for a lane -------------------------------------
export function buildArgv(lane, binary, prompt, opts, tmp) {
  const timeout = opts.timeout;
  switch (lane) {
    case 'grok':
      return { argv: [binary, '--output-format', 'json', '-p', prompt] };
    case 'codex': {
      const last = join(tmp, 'last.txt');
      const argv = [binary, 'exec', '--json', '--color', 'never', '--skip-git-repo-check', '-o', last];
      if (opts.audit) argv.push('--sandbox', 'read-only'); // an audit lane that can write is a bug
      argv.push(prompt);
      return { argv, outFile: last };
    }
    case 'agy': {
      const mins = Math.max(1, Math.round(timeout / 60));
      return { argv: [binary, '--print-timeout', `${mins}m`, '--output-format', 'stream-json', '-p', prompt] };
    }
    case 'hermes':
      return { argv: [binary, '-z', prompt, '--usage-file', join(tmp, 'usage.json')] };
    case 'qwen': {
      const argv = [binary, '-o', 'json'];
      if (opts.model) argv.push('-m', opts.model);
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

// --- the process boundary --------------------------------------------------
// The lane runs DETACHED, so it leads its own process group. On timeout (or an
// output-buffer overrun) the whole group is killed, not just the direct child:
// an agent CLI that shelled out to a tool must not keep working after the
// wrapper has reported 12. A child that calls setsid() itself escapes this
// boundary; that is documented, not hidden.
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
        if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
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
      child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
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
export function enabledLanes(here = dirname(fileURLToPath(import.meta.url))) {
  const p = join(here, 'lanes.json');
  if (!existsSync(p)) return LANES;
  try {
    const j = JSON.parse(readFileSync(p, 'utf8'));
    if (!j || typeof j !== 'object' || !Array.isArray(j.enabled)) return null;
    if (!j.enabled.every((l) => typeof l === 'string' && LANES.includes(l))) return null;
    return j.enabled;
  } catch {
    return null;
  }
}

function usage(msg) {
  if (msg) console.error('cli-run: ' + msg);
  console.error(`usage: cli-run <${LANES.join('|')}> "<prompt>" [--brief FILE] [--timeout SECS] [--quiet]
                [--expect-file PATH] [--expect-json]
       cli-run codex --audit "<prompt>"          read-only sandbox (audit shape)
       cli-run qwen [--model ID] [--safe-mode] "<prompt>"
       cli-run --doctor [--run]                  enabled lanes, binaries on PATH; --run sends each a tiny prompt`);
  return USAGE;
}

// Bounded, control-character-free head of vendor stderr for the terminal.
// Never logged: provider text can echo whatever the prompt contained.
function stderrHead(err, n = 300) {
  const s = String(err || '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim();
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
  const enabled = enabledLanes();
  if (enabled === null) {
    console.error('doctor: lanes.json exists but is malformed; fix it first');
    return USAGE;
  }
  let bad = 0;
  console.log(`doctor: ${enabled.length} enabled lane(s): ${enabled.join(', ') || 'none'}`);
  const primary = installedPrimary();
  if (primary && !enabled.includes(primary)) console.log(`  note: ${primary} is the primary agent; it calls cli-run and is not a lane`);
  for (const lane of LANES) {
    const on = enabled.includes(lane);
    const bin = which(lane);
    let line = `  ${lane.padEnd(7)} ${on ? 'enabled ' : 'disabled'} ${bin ? 'binary ok' : 'binary MISSING'}`;
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
      JSON.parse(text);
    } catch {
      return '--expect-json: the response is not valid JSON';
    }
  }
  return null;
}

export async function main(argv) {
  const VALUE = new Set(['--brief', '--timeout', '--model', '--expect-file']);
  const BOOL = new Set(['--quiet', '--audit', '--safe-mode', '--doctor', '--run', '--expect-json']);
  const args = [...argv];
  const opts = { timeout: 900, quiet: false, audit: false, model: null, safeMode: false, brief: null, doctor: false, run: false, expectFile: null, expectJson: false };
  const positional = [];
  while (args.length) {
    const a = args.shift();
    if (VALUE.has(a)) {
      const v = args.shift();
      if (v === undefined || v.startsWith('--')) return usage(`${a} requires a value`);
      if (a === '--brief') opts.brief = v;
      else if (a === '--timeout') opts.timeout = Number(v);
      else if (a === '--expect-file') opts.expectFile = v;
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
  if ((opts.model || opts.safeMode) && lane !== 'qwen') return usage('--model and --safe-mode are qwen-only');

  const digest = createHash('sha256').update(prompt).digest('hex').slice(0, 12);
  const base = { lane, prompt_sha256_12: digest, prompt_chars: prompt.length };
  const enabled = enabledLanes();
  if (enabled === null) {
    console.error('cli-run: lanes.json exists but is not a valid {"enabled": [...]} file; refusing every lane until it is fixed');
    log({ ...base, verdict: 'unavailable', rc: UNAVAILABLE, reason: 'lanes_json_malformed' });
    return UNAVAILABLE;
  }
  if (!enabled.includes(lane)) {
    console.error(`cli-run: ${lane} is not enabled in lanes.json`);
    log({ ...base, verdict: 'unavailable', rc: UNAVAILABLE, reason: 'disabled' });
    return UNAVAILABLE;
  }
  const binary = which(lane);
  if (!binary) {
    console.error(`cli-run: ${lane} not found on PATH`);
    log({ ...base, verdict: 'unavailable', rc: UNAVAILABLE, reason: 'unavailable' });
    return UNAVAILABLE;
  }

  const tmp = mkdtempSync(join(tmpdir(), 'cli-run-'));
  const before = opts.expectFile ? snapshotFile(resolve(opts.expectFile)) : null;
  try {
    const { argv: cmd, outFile } = buildArgv(lane, binary, prompt, opts, tmp);
    const r = await runBounded(cmd, opts.timeout);
    const out = r.stdout || '';
    const err = r.stderr || '';
    let verdict, reason, detail, code, text = '';
    if (r.interrupted) {
      verdict = 'interrupted'; reason = 'killed'; detail = `cli-run received ${r.interrupted}; the lane's process group was killed`; code = 128 + (r.interrupted === 'SIGINT' ? 2 : 15);
    } else if (r.timedOut) {
      verdict = 'timeout'; reason = 'timeout'; detail = `exceeded ${opts.timeout}s; process group killed`; code = TIMEOUT;
    } else if (r.overrun) {
      verdict = 'no_deliverable'; reason = 'no_output'; detail = 'output exceeded the 16 MiB buffer; process group killed'; code = NO_DELIVERABLE;
    } else if (r.error) {
      verdict = 'unavailable'; reason = 'unavailable'; detail = r.error.message; code = UNAVAILABLE;
    } else if (r.signal || r.status === null) {
      // A lane killed by a signal has no honest exit status. Whatever it printed
      // before dying is not a deliverable; a null status must never become exit 0.
      verdict = 'killed'; reason = 'killed'; detail = `lane killed by ${r.signal || 'unknown signal'}`; code = NO_DELIVERABLE;
    } else {
      const j = judge(lane, r.status, out, err, outFile);
      text = j.text || '';
      reason = j.reason;
      detail = j.detail;
      if (r.status !== 0) {
        // A nonzero vendor exit is a failure on the vendor's own terms, whether or
        // not something parseable came back. Pass the code through, keep the
        // verdict honest, and show what the vendor said on stderr.
        verdict = 'exit_nonzero'; code = r.status;
        if (reason === 'ok') reason = 'exit_nonzero';
        const head = stderrHead(err);
        detail = `lane exited ${r.status}` + (head ? `; stderr: ${head}` : '') + (j.reason !== 'ok' ? `; ${j.detail}` : '');
      } else if (text) {
        const unmet = checkContracts(opts, text, before);
        if (unmet) {
          verdict = 'no_deliverable'; reason = 'contract_unmet'; detail = unmet; code = NO_DELIVERABLE;
        } else {
          verdict = 'ok'; code = OK;
        }
      } else if (!out.trim() && !err.trim()) {
        verdict = 'no_output'; reason = 'no_output'; code = NO_OUTPUT;
      } else {
        verdict = 'no_deliverable'; code = NO_DELIVERABLE;
        const head = stderrHead(err);
        if (head) detail += `; stderr: ${head}`;
      }
    }
    if (text && code === OK) process.stdout.write(text + '\n');
    if (!opts.quiet) console.error(`cli-run[${lane}] ${verdict} rc=${code} ${r.seconds.toFixed(1)}s raw=${r.outBytes || 0}B :: ${detail}`);
    // Durable log: fixed reason code and structural numbers only.
    log({ ...base, verdict, rc: code, cli_rc: r.status, signal: r.signal || null, seconds: Math.round(r.seconds * 100) / 100, raw_bytes: r.outBytes || 0, deliverable_bytes: Buffer.byteLength(text), reason: REASONS.has(reason) ? reason : 'unknown' });
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
