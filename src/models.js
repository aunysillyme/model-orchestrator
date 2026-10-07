import { spawn } from 'node:child_process';
import { lstatSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readRegularFile } from './bounded-file.js';
import { MODEL_POLICY } from './catalog.js';
import { killTree } from '../bin/cli-run.mjs';

export const MODEL_DOCS = 'https://platform.claude.com/docs/en/models/overview.md';
const CAP = 256 * 1024;
const ID = /^claude-([a-z]+)-(\d+(?:-\d+)*)(?:-\d{8})?$/;
const fail = message => { throw new Error(`models: ${message}`); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const price = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const cells = line => line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;

function readModelFile(path) {
  const absolute = resolve(path);
  // Source snapshots are data only. Parent links could redirect a check to
  // unrelated data, so require canonical directory paths as well as a regular file.
  for (let parent = dirname(absolute); ; parent = dirname(parent)) {
    const stat = lstatSync(parent);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Object.assign(new Error('models: unsafe source directory; use its canonical path'), { code: 'UNSAFE_FILE' });
    if (parent === dirname(parent)) break;
  }
  return readRegularFile(absolute, CAP);
}

export function parseLineup(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => /^\s*\| Feature\s*\|/.test(line));
  if (start < 0) fail('official compare table missing');
  const names = cells(lines[start]).slice(1);
  const rows = {};
  for (const line of lines.slice(start + 2)) {
    if (!/^\s*\|/.test(line)) break;
    const [key, ...values] = cells(line);
    rows[key.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')] = values;
  }
  if (rows['Claude API ID']?.length !== names.length || rows.Pricing?.length !== names.length || names.length > 20) fail('official table missing IDs or pricing');
  const lineup = {};
  names.forEach((name, i) => {
    const match = /^Claude ([A-Za-z]+) (\d+(?:\.\d+)*)$/.exec(name);
    const ids = [...rows['Claude API ID'][i].matchAll(/`([^`]+)`/g)];
    const prices = [...rows.Pricing[i].matchAll(/\$(\d+(?:\.\d+)?)/g)].map(m => Number(m[1]));
    const family = match?.[1].toLowerCase();
    const id = ids[0]?.[1];
    if (!match || ids.length !== 1 || rows['Claude API ID'][i].split('`').length !== 3 || prices.length !== 2 || !prices.every(price)
      || !ID.test(id) || ID.exec(id)[1] !== family || !new RegExp(`^claude-${family}-${match[2].replaceAll('.', '-')}${family === 'haiku' ? '(?:-\\d{8})?' : ''}$`).test(id) || lineup[family]) fail('unparseable official model column');
    lineup[family] = { id, price_in: prices[0], price_out: prices[1], price_basis: /^From\b/.test(rows.Pricing[i]) ? 'from' : 'base' };
  });
  return lineup;
}

function validateLineup(lineup) {
  if (!object(lineup) || !Object.keys(lineup).length || Object.keys(lineup).length > 20) fail('invalid lineup');
  for (const [family, model] of Object.entries(lineup)) {
    if (!/^[a-z]{1,20}$/.test(family) || !object(model) || !ID.test(model.id) || ID.exec(model.id)[1] !== family || !price(model.price_in) || !price(model.price_out)) fail('invalid lineup model or price');
  }
}

// Only explicit candidate-specific approvals change family awareness or price ceilings.
export function resolveModels(lineup, aliases = {}, previous = null, { approveFamilies = [], approveTiers = {} } = {}) {
  validateLineup(lineup);
  if (previous) validateSnapshot(previous, { allowHeld: true, fresh: false });
  const known = new Set([...Object.values(MODEL_POLICY.tiers).map(t => t.family), ...(previous?.known_unrouted_families || [])]);
  for (const approval of approveFamilies) {
    const parts = typeof approval === 'string' ? approval.split('=') : [];
    const [family, id] = parts;
    if (parts.length !== 2 || !family || !id || !Object.hasOwn(lineup, family) || lineup[family].id !== id) fail('family approval must match the current model ID');
    known.add(family);
  }
  const escalations = Object.keys(lineup).filter(f => !known.has(f)).map(family => ({ code: 'NEW_FAMILY', family, model_id: lineup[family].id }));
  const tiers = {};
  for (const [tier, policy] of Object.entries(MODEL_POLICY.tiers)) {
    const current = lineup[policy.family];
    const old = previous?.tiers[tier];
    const baseline = old?.approved || policy;
    const alias = aliases[policy.family];
    const alias_loads = typeof alias === 'string' && ID.test(alias) && ID.exec(alias)[1] === policy.family ? alias : null;
    const candidate = current ? { model_id: current.id, value: alias_loads === current.id ? policy.family : current.id, alias_loads, price_in: current.price_in, price_out: current.price_out } : null;
    const increased = current && (current.price_in > baseline.price_in || current.price_out > baseline.price_out);
    const approved = candidate && approveTiers[tier] === current.id;
    const held = !current || (!approved && (increased || old?.held === true));
    const retained = old?.approved ? Object.fromEntries(['model_id', 'value', 'alias_loads', 'price_in', 'price_out'].filter(k => old.approved[k] !== undefined).map(k => [k, old.approved[k]])) : { price_in: policy.price_in, price_out: policy.price_out };
    tiers[tier] = { family: policy.family, ...(candidate || {}), candidate, held, approved: held ? retained : candidate };
    if (held) escalations.push({ code: !current ? 'MISSING_FAMILY' : increased ? 'PRICE_UP' : 'APPROVAL_PENDING', tier, family: policy.family, ...(current ? { model_id: current.id } : {}) });
  }
  return { schema: 1, source: MODEL_DOCS, as_of: new Date().toISOString(), policy_checked: MODEL_POLICY.checked, known_unrouted_families: [...known].filter(f => !Object.values(MODEL_POLICY.tiers).some(t => t.family === f)).sort(), lineup, tiers, escalations };
}

export function validateSnapshot(snapshot, { allowHeld = false, fresh = true } = {}) {
  if (!object(snapshot) || snapshot.schema !== 1 || snapshot.source !== MODEL_DOCS || snapshot.policy_checked !== MODEL_POLICY.checked) fail('invalid snapshot schema or source');
  const age = Date.now() - stamp(snapshot.as_of);
  if (!Number.isFinite(age) || age < -300000 || (fresh && age > 72 * 3600000)) fail('snapshot timestamp is stale, future or invalid');
  validateLineup(snapshot.lineup);
  if (!Array.isArray(snapshot.known_unrouted_families) || snapshot.known_unrouted_families.some(f => typeof f !== 'string' || !/^[a-z]{1,20}$/.test(f))) fail('invalid known families');
  if (!Array.isArray(snapshot.escalations) || snapshot.escalations.length > 30 || snapshot.escalations.some(e => !object(e) || !['NEW_FAMILY', 'MISSING_FAMILY', 'PRICE_UP', 'APPROVAL_PENDING'].includes(e.code))) fail('invalid escalation');
  if (!object(snapshot.tiers) || Object.keys(snapshot.tiers).length !== Object.keys(MODEL_POLICY.tiers).length) fail('invalid tiers');
  for (const [tier, policy] of Object.entries(MODEL_POLICY.tiers)) {
    const entry = snapshot.tiers[tier];
    if (!object(entry) || entry.family !== policy.family || typeof entry.held !== 'boolean' || !object(entry.approved) || !price(entry.approved.price_in) || !price(entry.approved.price_out)) fail('invalid approved tier baseline');
    for (const block of [entry.approved, entry.candidate]) {
      if (block === null) continue;
      if (!object(block) || !price(block.price_in) || !price(block.price_out)) fail('invalid model candidate');
      if (block.model_id !== undefined && (!ID.test(block.model_id) || ID.exec(block.model_id)[1] !== policy.family || ![block.model_id, policy.family].includes(block.value)
        || (block.value === policy.family && block.alias_loads !== block.model_id))) fail('invalid candidate identity');
      if (block.alias_loads != null && (!ID.test(block.alias_loads) || ID.exec(block.alias_loads)[1] !== policy.family)) fail('invalid alias identity');
    }
    if (entry.held && allowHeld) continue;
    const current = snapshot.lineup[policy.family];
    if (entry.held || !current || entry.model_id !== current.id || ![current.id, policy.family].includes(entry.value) || (entry.value === policy.family && entry.alias_loads !== current.id)
      || entry.price_in !== current.price_in || entry.price_out !== current.price_out || entry.approved.model_id !== current.id || entry.approved.value !== entry.value || entry.approved.price_in !== current.price_in || entry.approved.price_out !== current.price_out) fail('tier value is held or not current');
  }
  const known = new Set([...Object.values(MODEL_POLICY.tiers).map(t => t.family), ...snapshot.known_unrouted_families]);
  if (!allowHeld && (snapshot.escalations.length || Object.keys(snapshot.lineup).some(f => !known.has(f)))) fail('unapproved escalation in snapshot');
  return snapshot;
}

export function readSnapshot(path, options) {
  let snapshot;
  try { snapshot = JSON.parse(readModelFile(path).toString('utf8')); }
  catch (error) { if (error.code === 'UNSAFE_FILE') throw error; fail('cannot read snapshot JSON'); }
  return validateSnapshot(snapshot, options);
}

export function checkModels(snapshot, project) {
  validateSnapshot(snapshot);
  const root = realpathSync(resolve(project));
  const errors = [];
  for (const [tier, policy] of Object.entries(MODEL_POLICY.tiers)) {
    for (const agent of policy.agents) {
      try {
        for (const dir of ['.claude', '.claude/agents']) if (!lstatSync(join(root, dir)).isDirectory() || lstatSync(join(root, dir)).isSymbolicLink()) fail('unsafe agent directory');
        const text = readRegularFile(join(root, '.claude', 'agents', `${agent}.md`), CAP).toString('utf8');
        const front = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
        const lines = front?.split(/\r?\n/).filter(l => /^model:/.test(l)) || [];
        const value = lines.length === 1 ? /^model:[ \t]*([a-z0-9-]+)[ \t]*$/.exec(lines[0])?.[1] : null;
        if (value !== snapshot.tiers[tier].value) errors.push(`${agent}: model differs from resolved tier`);
        if (value?.startsWith('claude-') && !Object.values(snapshot.lineup).some(m => m.id === value)) errors.push(`${agent}: legacy or unknown model is not current`);
      } catch { errors.push(`${agent}: missing or unsafe agent definition`); }
    }
  }
  return errors;
}

async function fetchDocs() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(MODEL_DOCS, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) fail('official documentation fetch failed');
    let length = 0; const chunks = [];
    for await (const chunk of response.body) { length += chunk.length; if (length > CAP) { controller.abort(); fail('official document exceeds size limit'); } chunks.push(chunk); }
    return Buffer.concat(chunks).toString('utf8');
  } finally { clearTimeout(timer); }
}

// Isolated, no-tool paid canaries are opt-in. No fallback to broader permissions.
export async function probeAlias(family) {
  const directory = mkdtempSync(join(tmpdir(), 'orch-model-probe-'));
  try {
    return await new Promise(done => {
      let output = ''; let settled = false; let child;
      const finish = value => { if (settled) return; settled = true; clearTimeout(timer); done(value); };
      const stop = () => { if (!child?.pid) return; try { killTree(child.pid); } catch { try { child.kill('SIGKILL'); } catch {} } };
      const timer = setTimeout(() => { stop(); finish(null); }, 30000);
      try {
        child = spawn('claude', ['-p', 'reply with ok', '--model', family, '--output-format', 'json', '--setting-sources', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--tools', ''], { cwd: directory, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'ignore'] });
        child.stdout.on('data', chunk => { if (settled) return; output += chunk.toString(); if (Buffer.byteLength(output) > CAP) { stop(); finish(null); } });
        child.once('error', () => finish(null));
        child.once('close', code => {
          try { const result = JSON.parse(output); const keys = Object.keys(result.modelUsage || {}); finish(code === 0 && result.subtype === 'success' && !result.is_error && keys.length === 1 && ID.test(keys[0]) && ID.exec(keys[0])[1] === family ? keys[0] : null); }
          catch { finish(null); }
        });
      } catch { finish(null); }
    });
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

export async function modelsMain(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    console.log('aunx models --probe [--docs FILE] [--previous SNAPSHOT] [--probe-aliases] [--approve-family family=current-id] [--approve-tier tier=current-id]\naunx models --check SNAPSHOT --project PATH\nProbe prints JSON only; redirect it to a snapshot file. Default probes use official full IDs and no vendor calls. Alias canaries are opt-in paid calls. Approvals apply only to the exact current candidate. Check is offline.'); return 0;
  }
  const flags = {}; const approveFamilies = []; const approveTiers = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (['--probe', '--probe-aliases'].includes(flag)) { if (flags[flag]) fail('duplicate option'); flags[flag] = true; }
    else if (['--check', '--project', '--docs', '--previous', '--approve-family', '--approve-tier'].includes(flag)) {
      const value = args[++i]; if (!value || value.startsWith('--')) fail('missing option value');
      if (flag === '--approve-family') approveFamilies.push(value);
      else if (flag === '--approve-tier') { const match = /^(deep|standard|fast)=(claude-[a-z]+-[0-9-]+)$/.exec(value); if (!match || approveTiers[match[1]]) fail('invalid tier approval'); approveTiers[match[1]] = match[2]; }
      else { if (flags[flag]) fail('duplicate option'); flags[flag] = value; }
    } else fail('unknown models option');
  }
  if (flags['--check']) {
    if (!flags['--project'] || flags['--probe'] || flags['--docs'] || flags['--previous'] || flags['--probe-aliases'] || approveFamilies.length || Object.keys(approveTiers).length) fail('check requires only snapshot and project');
    const errors = checkModels(readSnapshot(flags['--check']), flags['--project']);
    if (errors.length) { for (const error of errors) console.error(`models: ${error}`); return 1; }
    console.log('models: all 8 installed agents match the current snapshot'); return 0;
  }
  if (!flags['--probe'] || flags['--project']) fail('use models --probe or --check SNAPSHOT --project PATH');
  const lineup = parseLineup(flags['--docs'] ? readModelFile(flags['--docs']).toString('utf8') : await fetchDocs());
  // Validate the previous snapshot and approvals before any optional paid canary.
  const previous = flags['--previous'] ? readSnapshot(flags['--previous'], { allowHeld: true, fresh: false }) : null;
  resolveModels(lineup, {}, previous, { approveFamilies, approveTiers });
  const aliases = {};
  if (flags['--probe-aliases']) {
    for (const family of [...new Set(Object.values(MODEL_POLICY.tiers).map(t => t.family))]) { const id = await probeAlias(family); if (id) aliases[family] = id; }
    if (!Object.keys(aliases).length) { console.error('models: all alias probes failed; no snapshot produced'); return 3; }
  }
  const snapshot = resolveModels(lineup, aliases, previous, { approveFamilies, approveTiers });
  process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
  if (snapshot.escalations.length) { console.error('models: approval required; snapshot cannot be installed'); return 1; }
  return 0;
}
