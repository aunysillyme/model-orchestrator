#!/usr/bin/env node
// subagent-context.mjs: SubagentStart hook for {{PRIMARY_NAME}}.
//
// A Claude Code subagent loads this project's CLAUDE.md hierarchy at start
// (code.claude.com/docs/en/sub-agents), so it already has the standing
// rules. What it does not have is this task's scope, and it can be tempted
// to route further work itself or to mark its own output verified. This
// hook injects a short, static reminder of where the rest lives and what
// "delegate" means.
//
// Fail-open by design: a miss here is a stray context string, not a gate.
// This script always exits 0, never executes anything it reads, and never
// blocks on stdin past a short bound (see drainStdin below).
import { isAbsolute } from 'node:path';

// Rendered at install time so a --dir outside the project still names an
// honest path rather than a hardcoded one.
const RULES_FILE_REL = {{RULES_FILE_REL_JSON}};
const TASK_BUNDLE_REL = {{TASK_BUNDLE_REL_JSON}};
const STDIN_DRAIN_MS = 250; // hard cap: never let an open, never-closed stdin pipe hold this hook open

const additionalContext = [
  'SUBAGENT CONTEXT (model-orchestrator).',
  'Routing rules: ' + RULES_FILE_REL + (isAbsolute(RULES_FILE_REL) ? '.' : ' (relative to the project root).'),
  'Task bundle format: ' + TASK_BUNDLE_REL + '.',
  'Report contract: say what you did, what you did NOT do, and what you could not verify. "Unverified" is acceptable; a confident guess is not. Stop at the bound your brief set, and never claim work you cannot show.',
  'You are a delegate: do not route further work to another subagent yourself, and do not mark your own output as the final verification of it.'
].join(' ');

// Drain stdin without ever blocking on it. A bare `readFileSync(0)` waits
// for stdin to reach EOF, so a caller that pipes into this hook and never
// closes its end of the pipe left the process running indefinitely. This
// races the real 'end' event against a hard timeout instead: whichever
// settles first wins, and the timer is unref'd so it can never itself be
// the reason the process stays alive past a normal exit.
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

drainStdin(STDIN_DRAIN_MS).then(() => {
  const payload = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext
    }
  });
  // Exit only after the write's callback fires, so a buffered write to a
  // pipe is not truncated by an exit that races ahead of it.
  process.stdout.write(payload, () => process.exit(0));
});
