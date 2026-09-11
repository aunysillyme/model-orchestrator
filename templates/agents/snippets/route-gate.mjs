#!/usr/bin/env node
// route-gate.mjs: UserPromptSubmit hook for {{PRIMARY_NAME}}.
//
// Reads the route-gate table out of {{RULES_FILE_REL}} and injects it as
// additionalContext on every turn, so the routing table is read at runtime
// from the one place it is generated (the rules file), never a second
// hand-typed copy that can drift from it.
//
// Fail-open by design: a miss here is a stray context string, not a gate.
// This script always exits 0, never blocks on stdin past a short bound,
// reads at most 64 KB of the rules file through a fixed-size buffer (never
// a full read of an arbitrarily large or non-regular file), and never
// executes anything it reads. See docs/audit-brief.md for the threat model.
import { statSync, openSync, readSync, closeSync, realpathSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

// Rendered at install time from the level and directory the user chose.
// Never hardcoded: a level 1 install points this at ORCHESTRATOR.md, level
// 2+ at ROUTING.md, and a --dir outside the project resolves to an absolute
// path instead of a relative one.
const RULES_FILE_REL = {{RULES_FILE_REL_JSON}};

const MAX_READ = 64 * 1024; // bounded read: this is a rules file, not a log
const MAX_CONTEXT = 4000; // bounded injection: a table, not the whole file
const STDIN_DRAIN_MS = 250; // hard cap: never let an open, never-closed stdin pipe hold this hook open
const START = '<!-- route-gate:start -->';
const END = '<!-- route-gate:end -->';

function fallback(reason) {
  return 'route-gate: ' + reason + '. Pick the lane before acting: read ' + RULES_FILE_REL + ' yourself.';
}

function resolveRulesPath() {
  if (isAbsolute(RULES_FILE_REL)) return RULES_FILE_REL;
  const projectDir = process.env.CLAUDE_PROJECT_DIR;
  if (!projectDir) return null;
  // Resolve through whatever part of the project dir already exists, so a
  // symlinked project folder still resolves to the real path the rules file
  // was written under.
  let root = projectDir;
  try {
    root = realpathSync(projectDir);
  } catch {
    /* keep the unresolved value; the read below reports the real failure */
  }
  return join(root, RULES_FILE_REL);
}

// Bounded, regular-file-only read. statSync (not lstatSync) follows a
// symlink to its target and reports what the target actually is, so a
// symlinked rules file still reads; a FIFO, socket, device or directory at
// the resolved path is refused before any open/read call touches it. That
// check matters: opening a FIFO for reading blocks until a writer opens the
// other end, and a plain readFileSync on any of these can hang or, for a
// huge or sparse regular file, allocate far more than this hook needs. The
// fixed-size buffer plus a single bounded readSync call means the on-disk
// size of the file never determines how much this hook reads or how long it
// takes.
function readBounded(path) {
  let st;
  try {
    st = statSync(path);
  } catch (e) {
    throw Object.assign(new Error('could not stat ' + path + ' (' + ((e && e.code) || e) + ')'), { code: e && e.code });
  }
  if (!st.isFile()) throw new Error(path + ' is not a regular file');
  const buf = Buffer.alloc(MAX_READ);
  let fd;
  try {
    fd = openSync(path, 'r');
    const bytesRead = readSync(fd, buf, 0, MAX_READ, 0);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function computeContext() {
  const path = resolveRulesPath();
  if (!path) return fallback('CLAUDE_PROJECT_DIR is not set, so ' + RULES_FILE_REL + ' could not be located');

  let text;
  try {
    text = readBounded(path);
  } catch (e) {
    return fallback((e && e.message) || String(e));
  }

  const s = text.indexOf(START);
  const e = s === -1 ? -1 : text.indexOf(END, s);
  if (s === -1 || e === -1) return fallback(path + ' has no route-gate block');

  return text.slice(s, e + END.length).slice(0, MAX_CONTEXT);
}

// Drain stdin without ever blocking on it. A bare `readFileSync(0)` waits
// for stdin to reach EOF, so a caller that pipes into this hook and never
// closes its end of the pipe (or a bare TTY with no redirection at all)
// left the process running indefinitely. This races the real 'end' event
// against a hard timeout instead: whichever settles first wins, and the
// timer is unref'd so it can never itself be the reason the process stays
// alive past a normal exit.
function drainStdin(timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
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
        /* stdin may already be gone; nothing left to clean up */
      }
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    if (timer.unref) timer.unref();
    try {
      process.stdin.on('data', () => {});
      process.stdin.on('end', finish);
      process.stdin.on('error', finish);
      process.stdin.resume();
    } catch {
      finish();
    }
  });
}

let additionalContext;
try {
  additionalContext = computeContext();
} catch (err) {
  additionalContext = fallback('route-gate.mjs failed unexpectedly (' + ((err && err.message) || err) + ')');
}

drainStdin(STDIN_DRAIN_MS).then(() => {
  const payload = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext
    }
  });
  // Exit only after the write's callback fires, so a buffered write to a
  // pipe (the common case on Windows, and possible anywhere output exceeds
  // one write's worth) is not truncated by an exit that races ahead of it.
  process.stdout.write(payload, () => process.exit(0));
});
