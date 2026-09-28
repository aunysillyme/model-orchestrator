import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { preflight } from './install.js';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const refuse = (message) => Object.assign(new Error(message), { code: 'PREFLIGHT' });
const configPlaceholder = '/ABSOLUTE/PATH/TO/obsidian-tc.config.json';
const needsConfiguration = (server) => server?.env?.OBSIDIAN_TC_CONFIG === configPlaceholder;

// Only cataloged project-local targets are eligible. A snippet for a vendor's
// global config is useful setup guidance, never permission to edit that file.
export function planCompanionApplication({ primary, tools = [], project, files, platform = process.platform }) {
  const host = primary?.projectMcp;
  const selected = tools.filter((tool) => tool.mcpSnippets?.[primary?.id]);
  if (!host || !selected.length) return [];
  const problems = preflight([{ rel: host.file }], project);
  if (problems.length) throw refuse(problems.join('; '));
  const path = join(project, host.file);
  const original = existsSync(path) ? readFileSync(path) : null;
  let settings = {};
  if (original) {
    try { settings = JSON.parse(original.toString('utf8')); }
    catch { throw refuse(`${path}: invalid JSON; nothing written`); }
  }
  if (!object(settings) || (settings[host.key] !== undefined && !object(settings[host.key]))) {
    throw refuse(`${path}: expected a JSON object with an optional ${host.key} object`);
  }
  const servers = { ...settings[host.key] };
  const added = {};
  const companionRegistrations = [];
  for (const tool of selected) {
    const rel = tool.mcpSnippets[primary.id];
    const snippet = files.find((file) => (file.root || 'dir') === 'dir' && file.rel.split('\\').join('/') === rel);
    if (!snippet) throw refuse(`${tool.id}: missing registration snippet ${rel}`);
    let incoming;
    try { incoming = JSON.parse(snippet.content.toString())[host.key]?.[tool.id]; }
    catch { throw refuse(`${tool.id}: invalid registration snippet ${rel}`); }
    if (!object(incoming)) throw refuse(`${tool.id}: missing server object in ${rel}`);
    // The installed JSON templates use npx for this stdio server. Windows
    // requires the vendor-documented cmd wrapper (OBSIDIAN-TC.md Windows).
    if (platform === 'win32' && incoming.command === 'npx') {
      incoming = { ...incoming, command: 'cmd', args: ['/d', '/c', 'npx', ...(incoming.args || [])] };
    }
    let status;
    if (Object.hasOwn(servers, tool.id)) {
      status = isDeepStrictEqual(servers[tool.id], incoming) ? 'present' : 'conflict';
    } else {
      status = 'added';
      servers[tool.id] = incoming;
      added[tool.id] = incoming;
    }
    companionRegistrations.push({ id: tool.id, status, needsConfiguration: needsConfiguration(servers[tool.id]) });
  }
  const content = Object.keys(added).length
    ? JSON.stringify({ ...settings, [host.key]: servers }, null, 2) + '\n'
    : original;
  return [{
    rel: host.file, root: 'project', mode: 0o644, original, content,
    applySnippet: true,
    activation: { kind: 'mcp', key: host.key, hadKey: Object.hasOwn(settings, host.key), servers: added },
    companionRegistrations
  }];
}

// The generated README can use conditional guidance before a merge is planned;
// the terminal supplies registrations to describe the observed merge result.
export function companionRegistrationSteps({ primary, tools = [], project, dir, applySnippets = false, registrations } = {}) {
  const root = resolve(project || process.cwd());
  const docs = resolve(dir || 'ai-orchestrator');
  const host = primary?.projectMcp;
  const states = registrations?.flatMap((entry) => entry.companionRegistrations || []);
  const steps = [];
  for (const tool of tools) {
    const rel = tool.mcpSnippets?.[primary?.id];
    const snippet = rel ? join(docs, rel) : join(docs, 'mcp');
    const state = states?.find((item) => item.id === tool.id);
    const registered = applySnippets && host && rel;
    if (!registered) {
      if (!rel) {
        steps.push(`${tool.id}: follow ${join(docs, tool.id.toUpperCase() + '.md')} to set it up with ${primary?.chatName || primary?.name || 'your agent'}`);
        continue;
      }
      const target = host ? join(root, host.file) : 'your agent\'s MCP config (user-managed)';
      steps.push(`${tool.id}: merge ${snippet} into ${target}; follow ${join(docs, tool.id.toUpperCase() + '.md')} for prerequisites`);
      continue;
    }
    if (state?.status === 'conflict') {
      steps.push(`${tool.id}: review the existing ${tool.id} entry in ${join(root, host.file)} against ${snippet} (existing entry kept)`);
      continue;
    }
    if (tool.id === 'codecalc') {
      steps.push(`codecalc: if uv or Python 3.10+ is missing, install it using ${join(docs, 'CODECALC.md')}`);
    } else if (tool.id === 'obsidian-tc' && (!state || state.needsConfiguration)) {
      steps.push(`obsidian-tc: set OBSIDIAN_TC_CONFIG in ${join(root, host.file)} to your config file path; follow ${join(docs, 'OBSIDIAN-TC.md')} for vault setup`);
    }
  }
  return steps;
}
