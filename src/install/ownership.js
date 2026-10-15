import { join, resolve, sep } from 'node:path';
import { MANIFEST_BYTE_CAP, readRegularFile } from '../bounded-file.js';


// Three classes of generated file.
//   MACHINE_OWNED  structured configuration: refreshed when its bytes change so
//                  a new selection applies (MANIFEST.json, bin/lanes.json).
//   RUNTIME        executables and units: rewritten when the installed copy is
//                  byte-identical to what a previous run generated (the manifest
//                  hash proves nobody edited it), kept and reported as a conflict
//                  when it was edited, kept and reported as unverifiable when no
//                  manifest exists. --upgrade-runtime forces this class only.
//   documents      everything else: the user may have edited them; kept unless --force.
export const MACHINE_OWNED = new Set(['MANIFEST.json', 'bin/lanes.json']);
export const RUNTIME = new Set([
  '.claude/hooks/route-gate.mjs',
  '.claude/hooks/subagent-context.mjs',
  '.claude/hooks/route-metrics.mjs',
  'bin/cli-run.mjs',
  'vm/setup-vm.sh',
  'vm/docker-compose.yml',
  'vm/gateway.config.yaml',
  'vm/jobs/weekly-audit.sh',
  'vm/jobs/weekly-audit.service',
  'vm/jobs/weekly-audit.timer'
]);
// MACHINE_OWNED and RUNTIME are keyed with forward slashes (they read as
// prose in the comment above them, and every caller needs the same one
// spelling regardless of host OS); an f.rel or a writeFiles() "written" path
// is built with path.join, so it is backslash-separated on win32. Both sets
// must be checked against the SAME normalized form, or a win32 install
// silently drops bin/lanes.json and every RUNTIME file from set membership
// (found: bin/cli.js's own "applied:"/existing-runtime checks did exactly
// that before this was exported for them to use too).
// separator is a parameter (default the real path.sep) so a test can prove
// the win32 case from any host, the same pattern which()'s platform
// parameter already uses.
export function toPosixRel(rel, separator = sep) {
  return rel.split(separator).join('/');
}
export function fileClass(rel, separator = sep) {
  const r = toPosixRel(rel, separator);
  if (MACHINE_OWNED.has(r)) return 'owned';
  if (RUNTIME.has(r)) return 'runtime';
  return 'document';
}

export function readManifest(dir) {
  try {
    const j = JSON.parse(readRegularFile(join(resolve(dir), 'MANIFEST.json'), MANIFEST_BYTE_CAP).toString('utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}
