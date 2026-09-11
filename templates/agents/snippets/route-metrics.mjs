#!/usr/bin/env node
// route-metrics.mjs: routing telemetry hook for {{PRIMARY_NAME}}.
//
// Answers "is my agent actually routing and delegating?" by turning five
// hook events into one JSON line each, appended to
// ~/.ai-orchestrator/route-metrics.jsonl (the same directory bin/cli-run.mjs
// already logs to, and the same os.homedir() resolution it uses):
//
//   UserPromptSubmit                 -> {event:"turn"}
//   PreToolUse (matcher Agent|Task)  -> {event:"dispatch", subagent_type, background}
//   SubagentStart                    -> {event:"start", agent_type}
//   SubagentStop                     -> {event:"end", agent_type?, duration_s?}
//   Stop                             -> {event:"route", lane}, parsed from the LAST
//                                        <!-- route: <lane> | <why> --> marker in
//                                        last_assistant_message (documented source;
//                                        the transcript can lag, so that is never read)
//
// Pure telemetry, fail-open by design: this script prints NOTHING to stdout
// (stdout on UserPromptSubmit/SubagentStart becomes model context) and always
// exits 0, whether or not a line was written. A miss here is a missing log
// line, never a blocked turn.
//
// The durable log holds no provider-supplied string: prompt text, tool
// descriptions, and the "why" half of the route marker are never read into a
// field, only the named, charset-bounded values below. See docs/audit-brief.md.
//
// Second entry point: `node route-metrics.mjs --summary [--since <ISO date>]`
// prints a plain-text report from the log and exits 0 without touching stdin.
import { createHash } from 'node:crypto';
import {
  existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, unlinkSync, renameSync,
  statSync, readdirSync
} from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const HOME_DIR = join(homedir(), '.ai-orchestrator');
const LOG_FILE = join(HOME_DIR, 'route-metrics.jsonl');
const STATE_DIR = join(HOME_DIR, 'route-metrics.state');

const STDIN_MAX_BYTES = 8 * 1024 * 1024; // size cap: a giant or runaway payload is truncated, not parsed
const STDIN_DRAIN_MS = 1000; // hard cap: never let an open, never-closed stdin pipe hold this hook open
const LOG_ROTATE_BYTES = 5 * 1024 * 1024; // rotate to .1 above this size
const STATE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // prune state files older than 24h
const TOKEN_CHARSET = /[^A-Za-z0-9_.+-]/g; // session_id, subagent_type, agent_type, lane tokens
const TOKEN_MAX_LEN = 64;
const SESSION_ID_MAX_LEN = 128;

// Strip anything outside the allowed charset and cap length, so no field in
// the durable log can carry an arbitrary provider- or model-supplied string
// (a newline, a control character, shell metacharacters, or just length).
function sanitize(raw, maxLen) {
  if (typeof raw !== 'string' || raw.length === 0) return '';
  return raw.replace(TOKEN_CHARSET, '').slice(0, maxLen);
}

function stateKeyFor(agentId) {
  if (typeof agentId !== 'string' || agentId.length === 0) return null;
  return createHash('sha256').update(agentId).digest('hex');
}

// Best-effort housekeeping: a leaked state file (a SubagentStop that never
// arrived) should not accumulate forever. Run on SubagentStart only, since
// that is the one event guaranteed to fire at least as often as starts happen.
function pruneOldState() {
  let names;
  try {
    names = readdirSync(STATE_DIR);
  } catch {
    return; // no state dir yet: nothing to prune
  }
  const cutoff = Date.now() - STATE_MAX_AGE_MS;
  for (const name of names) {
    const p = join(STATE_DIR, name);
    try {
      if (statSync(p).mtimeMs < cutoff) unlinkSync(p);
    } catch {
      /* a race with another process touching the same file is not an error here */
    }
  }
}

function recordStart(agentId, agentType) {
  const key = stateKeyFor(agentId);
  if (!key) return;
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(join(STATE_DIR, key + '.json'), JSON.stringify({ ts: Date.now(), agent_type: agentType }));
  } catch {
    /* telemetry never blocks the run */
  }
}

// Reads and deletes the state file for this agent_id. Returns {agentType,
// durationS}, either possibly null: no agent_id and no state file both mean
// "none", which the caller reflects by omitting the field entirely.
function consumeStart(agentId) {
  const key = stateKeyFor(agentId);
  if (!key) return { agentType: null, durationS: null };
  const p = join(STATE_DIR, key + '.json');
  let agentType = null;
  let durationS = null;
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    if (parsed && typeof parsed.ts === 'number') durationS = Math.max(0, (Date.now() - parsed.ts) / 1000);
    if (parsed && typeof parsed.agent_type === 'string' && parsed.agent_type) agentType = parsed.agent_type;
  } catch {
    /* no state file, or it was unreadable: none, not an error */
  }
  try {
    unlinkSync(p);
  } catch {
    /* already gone */
  }
  return { agentType, durationS };
}

function appendLog(record) {
  try {
    mkdirSync(HOME_DIR, { recursive: true });
    let size = 0;
    try {
      size = statSync(LOG_FILE).size;
    } catch {
      /* file does not exist yet: size stays 0 */
    }
    if (size > LOG_ROTATE_BYTES) {
      try {
        renameSync(LOG_FILE, LOG_FILE + '.1');
      } catch {
        /* a concurrent rotation losing this race is not worth failing over */
      }
    }
    appendFileSync(LOG_FILE, JSON.stringify(record) + '\n');
  } catch {
    /* telemetry never blocks the run */
  }
}

// Parses the LAST <!-- route: <lane> | <why> --> marker out of text. The
// "why" half is captured only to be discarded: it is never read into a
// variable that reaches the log. Returns an array of lane tokens (split on
// "+", the documented way to log more than one lane from a single marker),
// or ["missing"] when there is no marker at all.
export function extractLane(text) {
  if (typeof text !== 'string' || text.length === 0) return ['missing'];
  const re = /<!--\s*route:\s*([^|>]*)\|[^>]*-->/g;
  let match;
  let last = null;
  while ((match = re.exec(text)) !== null) last = match;
  if (!last) return ['missing'];
  // A token carrying any character outside the charset is logged as
  // "invalid", never stripped into a plausible-looking lane: stripping
  // `main","evil":"1` would log a lane named "mainevil1" that nobody chose.
  const parts = last[1]
    .split('+')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((t) => (t.length > TOKEN_MAX_LEN || /[^A-Za-z0-9_.-]/.test(t) ? 'invalid' : t));
  return parts.length ? parts : ['missing'];
}

// Turns one parsed hook-input object into a log record, or null when the
// event is not one this hook measures (or PreToolUse fired for a tool other
// than Agent/Task, which the settings matcher should already have excluded;
// this is a defensive second check, not the primary gate).
export function buildRecord(input, now = () => new Date().toISOString()) {
  if (!input || typeof input !== 'object') return null;
  const sessionId = sanitize(input.session_id, SESSION_ID_MAX_LEN) || 'unknown';
  const ts = now();
  const base = { ts, v: 1 };

  switch (input.hook_event_name) {
    case 'UserPromptSubmit':
      return { ...base, event: 'turn', session_id: sessionId };

    case 'PreToolUse': {
      if (input.tool_name !== 'Agent' && input.tool_name !== 'Task') return null;
      const toolInput = (input.tool_input && typeof input.tool_input === 'object') ? input.tool_input : {};
      const subagentType = sanitize(toolInput.subagent_type, TOKEN_MAX_LEN) || 'general-purpose';
      const background = toolInput.run_in_background === true;
      return { ...base, event: 'dispatch', session_id: sessionId, subagent_type: subagentType, background };
    }

    case 'SubagentStart': {
      pruneOldState();
      const agentType = sanitize(input.agent_type, TOKEN_MAX_LEN) || 'unknown';
      recordStart(input.agent_id, agentType);
      return { ...base, event: 'start', session_id: sessionId, agent_type: agentType };
    }

    case 'SubagentStop': {
      const { agentType, durationS } = consumeStart(input.agent_id);
      const record = { ...base, event: 'end', session_id: sessionId };
      if (agentType) record.agent_type = agentType;
      if (durationS !== null) record.duration_s = durationS;
      return record;
    }

    case 'Stop':
      return { ...base, event: 'route', session_id: sessionId, lane: extractLane(input.last_assistant_message) };

    default:
      return null;
  }
}

// Drain stdin without ever blocking on it, bounded by BOTH time and size. A
// bare `readFileSync(0)` waits for EOF, so a caller that pipes in and never
// closes its end left the process running indefinitely (the same class of
// bug route-gate.mjs and subagent-context.mjs already fix). The size cap is
// this hook's own addition: hook input is normally small, so a payload past
// the cap is treated as truncated and parsed as nothing, never partially.
function drainStdinBounded(timeoutMs, maxBytes) {
  return new Promise((resolve) => {
    let settled = false;
    let bytes = 0;
    let truncated = false;
    const chunks = [];
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        process.stdin.removeAllListeners('data');
        process.stdin.removeAllListeners('end');
        process.stdin.removeAllListeners('error');
        process.stdin.pause();
      } catch {
        /* stdin may already be gone */
      }
      resolve({ data: truncated ? null : Buffer.concat(chunks).toString('utf8'), truncated });
    };
    const timer = setTimeout(finish, timeoutMs);
    if (timer.unref) timer.unref();
    try {
      process.stdin.on('data', (chunk) => {
        if (truncated) return;
        bytes += chunk.length;
        if (bytes > maxBytes) {
          truncated = true;
          return finish();
        }
        chunks.push(chunk);
      });
      process.stdin.on('end', finish);
      process.stdin.on('error', finish);
      process.stdin.resume();
    } catch {
      finish();
    }
  });
}

async function runHook() {
  const { data } = await drainStdinBounded(STDIN_DRAIN_MS, STDIN_MAX_BYTES);
  if (data) {
    let input;
    try {
      input = JSON.parse(data);
    } catch {
      input = null; // invalid JSON: log nothing
    }
    if (input) {
      try {
        const record = buildRecord(input);
        if (record) appendLog(record);
      } catch {
        /* telemetry never blocks or fails the run */
      }
    }
  }
  process.exit(0); // fail-open, always: a miss here is a missing log line, never a blocked turn
}

// ---- --summary: a plain-text report, no stdin involved ----

function parseLines(text) {
  const records = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      /* one bad line (a torn write, a rotation race) does not sink the report */
    }
  }
  return records;
}

function formatNumber(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

function runSummary(args) {
  if (!existsSync(LOG_FILE)) {
    console.log('route-metrics: no data yet (' + LOG_FILE + ' does not exist).');
    return process.exit(0);
  }
  const sinceIdx = args.indexOf('--since');
  const since = sinceIdx !== -1 ? Date.parse(args[sinceIdx + 1]) : NaN;
  let records = parseLines(readFileSync(LOG_FILE, 'utf8'));
  if (!Number.isNaN(since)) records = records.filter((r) => Date.parse(r.ts) >= since);

  const turns = records.filter((r) => r.event === 'turn').length;
  const routes = records.filter((r) => r.event === 'route');
  const covered = routes.filter((r) => !(Array.isArray(r.lane) && r.lane.length === 1 && r.lane[0] === 'missing')).length;
  const coveragePct = turns > 0 ? (covered / turns) * 100 : null;

  const laneCounts = new Map();
  for (const r of routes) {
    for (const lane of Array.isArray(r.lane) ? r.lane : []) laneCounts.set(lane, (laneCounts.get(lane) || 0) + 1);
  }

  const dispatches = records.filter((r) => r.event === 'dispatch');
  const dispatchCounts = new Map();
  for (const r of dispatches) dispatchCounts.set(r.subagent_type, (dispatchCounts.get(r.subagent_type) || 0) + 1);

  const starts = records.filter((r) => r.event === 'start').length;
  const noMatchingStart = Math.max(0, dispatches.length - starts);

  const ends = records.filter((r) => r.event === 'end' && r.agent_type && typeof r.duration_s === 'number');
  const durationsByType = new Map();
  for (const r of ends) {
    if (!durationsByType.has(r.agent_type)) durationsByType.set(r.agent_type, []);
    durationsByType.get(r.agent_type).push(r.duration_s);
  }

  const lines = [];
  lines.push('route-metrics summary' + (Number.isNaN(since) ? '' : ' since ' + args[sinceIdx + 1]));
  lines.push('turns: ' + turns);
  lines.push('route-marker coverage: ' + (coveragePct === null ? 'no turns yet' : formatNumber(coveragePct) + '%') + ' (' + covered + '/' + turns + ')');
  lines.push('lanes by count:');
  if (laneCounts.size === 0) lines.push('  (none)');
  for (const [lane, count] of [...laneCounts.entries()].sort((a, b) => b[1] - a[1])) lines.push('  ' + lane + ': ' + count);
  lines.push('dispatches by subagent_type:');
  if (dispatchCounts.size === 0) lines.push('  (none)');
  for (const [type, count] of [...dispatchCounts.entries()].sort((a, b) => b[1] - a[1])) lines.push('  ' + type + ': ' + count);
  lines.push('dispatches with no matching start: ' + noMatchingStart + ' (a hook or guard blocked them before launch)');
  lines.push('duration by agent_type (mean / max, seconds):');
  if (durationsByType.size === 0) lines.push('  (none)');
  for (const [type, durs] of durationsByType) {
    const mean = durs.reduce((a, b) => a + b, 0) / durs.length;
    lines.push('  ' + type + ': ' + formatNumber(mean) + ' / ' + formatNumber(Math.max(...durs)));
  }
  console.log(lines.join('\n'));
  process.exit(0);
}

const args = process.argv.slice(2);
if (args.includes('--summary')) {
  runSummary(args);
} else {
  runHook();
}
