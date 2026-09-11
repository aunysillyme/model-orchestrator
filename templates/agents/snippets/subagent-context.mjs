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
// This script always exits 0 and never executes anything it reads.
import { readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

try {
  readFileSync(0);
} catch {
  /* nothing piped, or already closed: fine */
}

// Rendered at install time so a --dir outside the project still names an
// honest path rather than a hardcoded one.
const RULES_FILE_REL = {{RULES_FILE_REL_JSON}};
const TASK_BUNDLE_REL = {{TASK_BUNDLE_REL_JSON}};

const additionalContext = [
  'SUBAGENT CONTEXT (model-orchestrator).',
  'Routing rules: ' + RULES_FILE_REL + (isAbsolute(RULES_FILE_REL) ? '.' : ' (relative to the project root).'),
  'Task bundle format: ' + TASK_BUNDLE_REL + '.',
  'Report contract: say what you did, what you did NOT do, and what you could not verify. "Unverified" is acceptable; a confident guess is not. Stop at the bound your brief set, and never claim work you cannot show.',
  'You are a delegate: do not route further work to another subagent yourself, and do not mark your own output as the final verification of it.'
].join(' ');

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SubagentStart',
      additionalContext
    }
  })
);
