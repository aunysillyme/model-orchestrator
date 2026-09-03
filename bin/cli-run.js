#!/usr/bin/env node
// cli-run: one entrypoint for the agent CLI lanes. Exit 0 means the deliverable
// exists. Nothing else.
//
// Why: every agent CLI can exit 0 having produced nothing. A run that reports
// success and delivers nothing is indistinguishable from a model failure, so it
// gets blamed on the model. This tool reads each lane's NATIVE terminal event
// and refuses to call an empty run a success.
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
//   0   deliverable present
//   10  ran, produced no deliverable   <- the class this tool exists to catch
//   11  produced no output at all
//   12  timed out
//   13  lane unavailable (missing binary, or not enabled in lanes.json)
//   2   usage error in cli-run itself
//   *   anything else is passed through from the CLI

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, appendFileSync, mkdtempSync, rmSync, accessSync, constants, realpathSync, statSync } from 'node:fs';
import { join, dirname, delimiter } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const LANES = ['grok', 'codex', 'agy', 'hermes', 'qwen'];
export const OK = 0, NO_DELIVERABLE = 10, NO_OUTPUT = 11, TIMEOUT = 12, UNAVAILABLE = 13, USAGE = 2;

const LOG = join(homedir(), '.ai-orchestrator', 'cli-run.log.jsonl');

function which(bin) {
  const dirs = (process.env.PATH || '').split(delimiter).filter(Boolean);
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
// candidate lines (a cheap substring test first) and retaining one object.
// Untrusted CLI output can be large; retaining every parsed object is what
// turned a big stream into an out-of-memory abort.
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

// --- judges: (rc, out, err, extra) -> { text: string|null, detail: string } ---
// Every field access is type-guarded. A malformed payload returns a verdict,
// never throws: a crash would surface as a cli-run usage error and a lane
// emitting garbage would be misreported as a bug in this tool.

export function judgeGrok(rc, out) {
  let o;
  try {
    o = JSON.parse(out);
  } catch {
    return { text: null, detail: 'stdout was not JSON' };
  }
  if (!o || typeof o !== 'object') return { text: null, detail: 'JSON was not an object' };
  const stop = o.stopReason;
  const text = typeof o.text === 'string' ? o.text.trim() : '';
  if (stop !== 'end_turn') return { text: null, detail: `stopReason=${JSON.stringify(stop)}` };
  return text ? { text, detail: 'stopReason=end_turn' } : { text: null, detail: 'end_turn but empty text' };
}

export function judgeCodex(rc, out, err, fileText) {
  const completed = lastJsonLine(out, 'turn.completed', (o) => o && o.type === 'turn.completed') !== null;
  const text = typeof fileText === 'string' ? fileText.trim() : '';
  if (!completed) return { text: null, detail: 'no terminal turn.completed event' };
  return text ? { text, detail: 'turn.completed' } : { text: null, detail: 'turn.completed but -o file empty' };
}

export function judgeAgy(rc, out) {
  const ev = lastJsonLine(out, '"result"', (o) => o && o.event === 'result');
  if (ev === null) return { text: null, detail: 'no terminal result event' };
  const term = ev.result && typeof ev.result === 'object' && !Array.isArray(ev.result) ? ev.result : {};
  const status = term.status;
  const text = typeof term.response === 'string' ? term.response.trim() : '';
  if (status !== 'SUCCESS') return { text: null, detail: `status=${JSON.stringify(status)}` };
  return text ? { text, detail: 'status=SUCCESS' } : { text: null, detail: 'SUCCESS but empty response' };
}

export function judgeHermes(rc, out, err) {
  const text = String(out || '').trim();
  if (rc !== 0) {
    const why = { 1: 'no final response (agent produced nothing)', 2: 'bad args, or completed with an empty response' }[rc] || 'unknown failure';
    return { text: null, detail: `hermes exit ${rc}: ${why}` };
  }
  return text ? { text, detail: 'exit 0' } : { text: null, detail: 'exit 0 but empty stdout' };
}

export function judgeQwen(rc, out) {
  let events;
  try {
    events = JSON.parse(out);
  } catch {
    return { text: null, detail: 'stdout was not JSON' };
  }
  if (!Array.isArray(events) || events.length === 0) return { text: null, detail: 'JSON was not a non-empty event array' };
  const term = events[events.length - 1];
  if (!term || typeof term !== 'object' || Array.isArray(term)) return { text: null, detail: 'last event was not an object' };
  if (term.type !== 'result') return { text: null, detail: `last event was ${JSON.stringify(term.type)}, not result` };
  if (term.subtype !== 'success') {
    const e = term.error;
    const msg = e && typeof e === 'object' && typeof e.message === 'string' ? e.message : e ? String(e) : '';
    return { text: null, detail: `subtype=${JSON.stringify(term.subtype)}` + (msg ? `: ${msg.slice(0, 120)}` : '') };
  }
  if (term.is_error) return { text: null, detail: 'is_error true' };
  if (term.result != null && typeof term.result !== 'string') return { text: null, detail: `result was ${typeof term.result}, not a string` };
  const text = (term.result || '').trim();
  if (!text) return { text: null, detail: 'success but empty result' };
  // qwen reports success even when the upstream API rejected the call; the
  // error text lands in `result`. These two checks are the honest ones.
  if (text.startsWith('[API Error:')) return { text: null, detail: `success flag lied, result is an API error: ${text.slice(0, 140)}` };
  const stats = term.stats;
  const models = stats && typeof stats === 'object' ? stats.models : null;
  if (!models || typeof models !== 'object' || Array.isArray(models) || Object.keys(models).length === 0) {
    // Absent telemetry is an unknown, not a zero.
    return { text: null, detail: 'success but stats.models absent: cannot verify totalErrors' };
  }
  for (const [name, m] of Object.entries(models)) {
    const api = m && typeof m === 'object' ? m.api : null;
    const errs = api && typeof api === 'object' ? api.totalErrors : undefined;
    if (!Number.isInteger(errs)) return { text: null, detail: `success but ${name} has no readable totalErrors` };
    if (errs) return { text: null, detail: `success flag lied, ${name} reported ${errs} API error(s)` };
  }
  return { text, detail: `subtype=success, totalErrors=0 across ${Object.keys(models).length} model(s)` };
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
       cli-run codex --audit "<prompt>"          read-only sandbox (audit shape)
       cli-run qwen [--model ID] [--safe-mode] "<prompt>"`);
  return USAGE;
}

export function main(argv) {
  // Strict: a value flag needs a value that is not itself a flag, every flag is
  // known, and there is exactly one prompt (positional or --brief, not both).
  // `qwen p --model --safe-mode` must not read "--safe-mode" as the model id.
  const VALUE = new Set(['--brief', '--timeout', '--model']);
  const BOOL = new Set(['--quiet', '--audit', '--safe-mode']);
  const args = [...argv];
  const opts = { timeout: 900, quiet: false, audit: false, model: null, safeMode: false, brief: null };
  const positional = [];
  while (args.length) {
    const a = args.shift();
    if (VALUE.has(a)) {
      const v = args.shift();
      if (v === undefined || v.startsWith('--')) return usage(`${a} requires a value`);
      if (a === '--brief') opts.brief = v;
      else if (a === '--timeout') opts.timeout = Number(v);
      else opts.model = v;
    } else if (BOOL.has(a)) {
      if (a === '--quiet') opts.quiet = true;
      else if (a === '--audit') opts.audit = true;
      else opts.safeMode = true;
    } else if (a.startsWith('--')) return usage('unknown flag ' + a);
    else positional.push(a);
  }
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
  // Lane-specific flags fail loudly on the wrong lane. Silently ignoring
  // --safe-mode reads as a guarantee that was never applied.
  if (opts.audit && lane !== 'codex') return usage('--audit is codex-only');
  if ((opts.model || opts.safeMode) && lane !== 'qwen') return usage('--model and --safe-mode are qwen-only');

  const enabled = enabledLanes();
  if (enabled === null) {
    console.error('cli-run: lanes.json exists but is not a valid {"enabled": [...]} file; refusing every lane until it is fixed');
    log({ lane, verdict: 'unavailable', rc: UNAVAILABLE, detail: 'lanes.json malformed' });
    return UNAVAILABLE;
  }
  if (!enabled.includes(lane)) {
    console.error(`cli-run: ${lane} is not enabled in lanes.json`);
    log({ lane, verdict: 'unavailable', rc: UNAVAILABLE, detail: 'disabled in lanes.json' });
    return UNAVAILABLE;
  }
  const binary = which(lane);
  if (!binary) {
    console.error(`cli-run: ${lane} not found on PATH`);
    log({ lane, verdict: 'unavailable', rc: UNAVAILABLE, detail: 'binary not found' });
    return UNAVAILABLE;
  }

  const tmp = mkdtempSync(join(tmpdir(), 'cli-run-'));
  try {
    const { argv: cmd, outFile } = buildArgv(lane, binary, prompt, opts, tmp);
    const t0 = Date.now();
    // stdin closed on purpose: codex exec blocks forever on an open stdin and
    // writes a zero-byte file while looking alive. The wall clock is ours
    // because macOS ships no `timeout`.
    // SIGKILL on timeout: an agent CLI mid-tool-call can ignore SIGTERM and outlive the wall clock.
    const r = spawnSync(cmd[0], cmd.slice(1), { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: opts.timeout * 1000, killSignal: 'SIGKILL', maxBuffer: 16 * 1024 * 1024 });
    const secs = (Date.now() - t0) / 1000;
    const out = r.stdout || '';
    const err = r.stderr || '';
    let verdict, detail, text = '', code;
    if (r.error && r.error.code === 'ETIMEDOUT') {
      verdict = 'timeout'; detail = `exceeded ${opts.timeout}s`; code = TIMEOUT;
    } else if (r.error) {
      verdict = 'unavailable'; detail = r.error.message; code = UNAVAILABLE;
    } else if (r.signal || r.status === null) {
      // A lane killed by a signal has no honest exit status. Whatever it printed
      // before dying is not a deliverable; a null status must never become exit 0.
      verdict = 'killed'; detail = `lane killed by ${r.signal || 'unknown signal'}`; code = NO_DELIVERABLE;
    } else {
      const j = judge(lane, r.status, out, err, outFile);
      text = j.text || '';
      detail = j.detail;
      if (text) { verdict = 'ok'; code = OK; }
      else if (!out.trim() && !err.trim()) { verdict = 'no_output'; code = NO_OUTPUT; }
      else { verdict = 'no_deliverable'; code = NO_DELIVERABLE; }
      if (r.status !== 0 && code === OK) code = r.status; // a lane that failed on its own terms keeps its code
    }
    if (text) process.stdout.write(text + '\n');
    if (!opts.quiet) console.error(`cli-run[${lane}] ${verdict} rc=${code} ${secs.toFixed(1)}s raw=${out.length}B :: ${detail}`);
    // The log keeps a digest of the prompt, never its text: briefs can carry
    // material that should not sit in a durable file.
    const digest = createHash('sha256').update(prompt).digest('hex').slice(0, 12);
    // The durable log keeps the structural class of the verdict (the part of
    // `detail` before the first colon), never provider-supplied message text,
    // which can echo whatever the prompt or the upstream error contained.
    const reason = String(detail).split(':')[0].slice(0, 80);
    log({ lane, verdict, rc: code, cli_rc: r.status, signal: r.signal || null, seconds: Math.round(secs * 100) / 100, raw_bytes: out.length, deliverable_bytes: text.length, reason, prompt_sha256_12: digest, prompt_chars: prompt.length });
    return code;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// Run main only when this file is the entry point. Compare real paths, so a
// symlink such as ~/.local/bin/cli-run -> bin/cli-run.js still runs.
function isEntryPoint() {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
  } catch {
    return false;
  }
}
if (isEntryPoint()) {
  process.exit(main(process.argv.slice(2)));
}
