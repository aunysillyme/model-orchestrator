import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { preflight, snippetFor } from './install.js';

export const START = '<!-- model-orchestrator:start -->';
export const END = '<!-- model-orchestrator:end -->';
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const refuse = (message) => Object.assign(new Error(message), { code: 'PREFLIGHT' });

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
  const block = Buffer.from(`${START}\n${snippet.trimEnd()}\n${END}`);
  if (start === -1 && end === -1) {
    const separator = original.length && original.at(-1) !== 10 ? '\n\n' : original.length ? '\n' : '';
    return Buffer.concat([original, Buffer.from(separator), block, Buffer.from('\n')]);
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
  const content = markedContent(priorRules || Buffer.alloc(0), snippet, rulesPath);
  const block = content.subarray(content.indexOf(START), content.indexOf(END) + Buffer.byteLength(END));
  const appended = !priorRules?.includes(START);
  const entries = [{ rel: targets[0], original: priorRules, content, activation: {
    kind: 'rules', blockHash: createHash('sha256').update(block).digest('hex'), created: priorRules === null,
    addedPrefix: appended && priorRules?.length ? (priorRules.at(-1) === 10 ? '\n' : '\n\n') : '',
    addedSuffix: appended ? '\n' : ''
  } }];
  if (primary.id === 'claude-code') {
    const settingsPath = join(project, targets[1]);
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
