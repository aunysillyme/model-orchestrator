import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { preflight, snippetFor, ACTIVATION_JSON_BYTE_CAP } from './install.js';

export const START = '<!-- model-orchestrator:start -->';
export const END = '<!-- model-orchestrator:end -->';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const refuse = (message) => Object.assign(new Error(message), { code: 'PREFLIGHT' });
const CRLF = Buffer.from('\r\n');
// R2: match the file's own line ending for the block this run inserts or
// replaces, so a CRLF file stays CRLF instead of picking up a mixed file.
const eolOf = (original) => (original.indexOf(CRLF) !== -1 ? '\r\n' : '\n');
// R1: refuse a pre-existing JSON file over the stated cap before it is read,
// the same way invalid JSON is refused today, without ever loading its bytes.
function refuseIfOversized(path) {
  if (existsSync(path) && statSync(path).size > ACTIVATION_JSON_BYTE_CAP) {
    throw refuse(`${path}: larger than the ${ACTIVATION_JSON_BYTE_CAP} byte (10 MB) cap on a pre-existing settings/MCP JSON file; nothing written`);
  }
}

function mergeHooks(settings, incoming, path) {
  if (!object(settings) || (settings.hooks !== undefined && !object(settings.hooks))) {
    throw refuse(`${path}: expected a JSON object with an optional hooks object`);
  }
  const hooks = { ...settings.hooks };
  const ownership = [];
  for (const [event, groups] of Object.entries(incoming)) {
    const existing = hooks[event] === undefined ? [] : hooks[event];
    if (!Array.isArray(existing) || existing.some((group) => !object(group) || !Array.isArray(group.hooks))) {
      throw refuse(`${path}: hooks.${event} must contain hook groups`);
    }
    // A hook only counts as wired under the same matcher: the same command under a
    // narrower matcher never fires for the tools the snippet's group targets.
    const key = (group, hook) => JSON.stringify([group.matcher ?? '', hook.command, hook.args || []]);
    const seen = new Set(existing.flatMap((group) => group.hooks.filter(object).map((hook) => key(group, hook))));
    const added = [];
    for (const group of groups) {
      const missing = group.hooks.filter((hook) => {
        if (seen.has(key(group, hook))) return false;
        seen.add(key(group, hook));
        return true;
      });
      if (missing.length) {
        added.push({ ...group, hooks: missing });
        const { hooks: ignored, ...attributes } = group;
        for (const hook of missing) ownership.push({ event, group: attributes, hook });
      }
    }
    hooks[event] = [...existing, ...added];
  }
  return { settings: { ...settings, hooks }, ownership };
}

function markedContent(original, snippet, path) {
  const start = original.indexOf(START);
  const end = original.indexOf(END);
  const nl = eolOf(original);
  const body = snippet.trimEnd().split('\n').join(nl);
  const block = Buffer.from(`${START}${nl}${body}${nl}${END}`);
  if (start === -1 && end === -1) {
    const separator = original.length && original.at(-1) !== 10 ? nl + nl : original.length ? nl : '';
    return Buffer.concat([original, Buffer.from(separator), block, Buffer.from(nl)]);
  }
  if (start < 0 || end < start || original.indexOf(START, start + START.length) !== -1 || original.indexOf(END, end + END.length) !== -1) {
    throw refuse(`${path}: expected one matching ${START} / ${END} block`);
  }
  return Buffer.concat([original.subarray(0, start), block, original.subarray(end + Buffer.byteLength(END))]);
}

export function assertSnippetPrimary(primary) {
  // Chat apps have no project rules target; their paste step remains manual.
  return !!primary?.rulesFile;
}

function appliedRules(snippet, files, project, path) {
  const match = snippet.match(/^```markdown\r?\n([\s\S]*?)^```[ \t]*(?:\r?\n|$)/m);
  if (!match) throw refuse(`${path}: missing routing rules in generated snippet`);
  let body = match[1].trimEnd();
  const manifest = files.find((file) => file.rel === 'MANIFEST.json');
  if (manifest) {
    const rulesDir = JSON.parse(manifest.content).dir;
    const rel = relative(resolve(project), resolve(rulesDir)).split(sep).join('/') || '.';
    // Manual guides may use an absolute path for a rules folder outside the
    // project. Applied instructions always keep the reference project-relative.
    for (const absolute of new Set([rulesDir, rulesDir.split(sep).join('/')])) body = body.replaceAll(absolute, rel);
  }
  return body;
}

// Read and validate every user file before the installer writes anything.
// Activation ownership records only the inserted block and added hook entries.
export function planSnippetApplication({ primary, project, files }) {
  if (!assertSnippetPrimary(primary)) return [];
  const targets = [primary.rulesFile];
  if (primary.id === 'claude-code') targets.push(join('.claude', 'settings.json'));
  const problems = preflight(targets.map((rel) => ({ rel })), project);
  if (problems.length) throw refuse(problems.join('; '));
  const rulesPath = join(project, targets[0]);
  const priorRules = existsSync(rulesPath) ? readFileSync(rulesPath) : null;
  const snippet = files.find((f) => f.rel === snippetFor(primary))?.content;
  if (snippet === undefined) throw refuse(`${rulesPath}: missing generated rules snippet`);
  const content = markedContent(priorRules || Buffer.alloc(0), appliedRules(snippet, files, project, rulesPath), rulesPath);
  const block = content.subarray(content.indexOf(START), content.indexOf(END) + Buffer.byteLength(END));
  const appended = !priorRules?.includes(START);
  const entries = [{ rel: targets[0], original: priorRules, content, activation: {
    kind: 'rules', blockHash: createHash('sha256').update(block).digest('hex'), created: priorRules === null,
    addedPrefix: appended && priorRules?.length ? (priorRules.at(-1) === 10 ? '\n' : '\n\n') : '',
    addedSuffix: appended ? '\n' : ''
  } }];
  if (primary.id === 'claude-code') {
    const settingsPath = join(project, targets[1]);
    refuseIfOversized(settingsPath);
    const priorSettings = existsSync(settingsPath) ? readFileSync(settingsPath) : null;
    let settings = {};
    if (priorSettings) {
      try { settings = JSON.parse(priorSettings.toString('utf8')); }
      catch { throw refuse(`${settingsPath}: invalid JSON; nothing written`); }
    }
    const incoming = JSON.parse(files.find((f) => f.rel === 'settings.hooks.snippet.json').content);
    const merged = mergeHooks(settings, incoming.hooks, settingsPath);
    entries.push({ rel: targets[1], original: priorSettings,
      content: priorSettings && JSON.stringify(settings) === JSON.stringify(merged.settings) ? priorSettings : JSON.stringify(merged.settings, null, 2) + '\n',
      activation: { kind: 'hooks', hooks: merged.ownership, created: priorSettings === null, hadHooks: Object.hasOwn(settings, 'hooks'), originalEvents: Object.keys(settings.hooks || {}) }
    });
  }
  return entries.map((file) => ({ ...file, root: 'project', mode: 0o644, applySnippet: true }));
}
