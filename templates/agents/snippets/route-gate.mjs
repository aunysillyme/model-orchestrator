#!/usr/bin/env node
// route-gate.mjs: UserPromptSubmit hook for {{PRIMARY_NAME}}.
//
// Reads the route-gate table out of {{RULES_FILE_REL}} and injects it as
// additionalContext on every turn, so the routing table is read at runtime
// from the one place it is generated (the rules file), never a second
// hand-typed copy that can drift from it.
//
// Fail-open by design: a miss here is a stray context string, not a gate.
// This script always exits 0, reads at most 64 KB, and never executes
// anything it reads. See docs/audit-brief.md for the threat model.
import { readFileSync, realpathSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';

// Rendered at install time from the level and directory the user chose.
// Never hardcoded: a level 1 install points this at ORCHESTRATOR.md, level
// 2+ at ROUTING.md, and a --dir outside the project resolves to an absolute
// path instead of a relative one.
const RULES_FILE_REL = {{RULES_FILE_REL_JSON}};

const MAX_READ = 64 * 1024; // bounded read: this is a rules file, not a log
const MAX_CONTEXT = 4000; // bounded injection: a table, not the whole file
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
    /* keep the unresolved value; the readFileSync below reports the real failure */
  }
  return join(root, RULES_FILE_REL);
}

function main() {
  // Drain stdin. This hook uses no field from the JSON input Claude Code
  // sends; it only needs to consume the pipe so the call does not hang.
  try {
    readFileSync(0);
  } catch {
    /* nothing piped, or already closed: fine */
  }

  const path = resolveRulesPath();
  if (!path) return fallback('CLAUDE_PROJECT_DIR is not set, so ' + RULES_FILE_REL + ' could not be located');

  let text;
  try {
    text = readFileSync(path, 'utf8').slice(0, MAX_READ);
  } catch (e) {
    return fallback('could not read ' + path + ' (' + ((e && e.code) || e) + ')');
  }

  const s = text.indexOf(START);
  const e = s === -1 ? -1 : text.indexOf(END, s);
  if (s === -1 || e === -1) return fallback(path + ' has no route-gate block');

  return text.slice(s, e + END.length).slice(0, MAX_CONTEXT);
}

let additionalContext;
try {
  additionalContext = main();
} catch (err) {
  additionalContext = fallback('route-gate.mjs failed unexpectedly (' + ((err && err.message) || err) + ')');
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext
    }
  })
);
