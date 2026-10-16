// Capability classes: an ordered lane preference plus one shared eligibility block.
// Installed-lane detection and Claude tier names come from the existing modules.
import { dirname, join, resolve } from 'node:path';
import { LANES } from '../bin/cli-run.mjs';
import { readRegularFile } from './bounded-file.js';
import { which } from './detect.js';
import { resolveClassModel, validateSnapshot } from './models.js';

const CLASS_NAMES = ['frontier', 'fast', 'swarm'];
const USAGE = 'usage: aunx route --class frontier|fast|swarm [--data public|private] [--write] [--json]';

/** @param {{dir?: string, cwd?: string}} [options] */
export function classFileCandidates({ dir, cwd = process.cwd() } = {}) {
  const list = [];
  if (dir !== undefined) list.push(join(resolve(cwd, dir), 'classes.json'));
  list.push(join(cwd, 'ai-orchestrator', 'classes.json'));
  list.push(join(cwd, 'classes.json'));
  return [...new Set(list)];
}

export function parseClasses(text) {
  const json = JSON.parse(text);
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  if (!json.classes || typeof json.classes !== 'object' || Array.isArray(json.classes)) return null;
  if (!json.eligibility || typeof json.eligibility !== 'object' || Array.isArray(json.eligibility)) return null;
  for (const key of ['public', 'private', 'read', 'write']) {
    if (!Array.isArray(json.eligibility[key]) || json.eligibility[key].some((lane) => typeof lane !== 'string')) return null;
  }
  for (const name of Object.keys(json.classes)) {
    if (!Array.isArray(json.classes[name])) return null;
  }
  return json;
}

/** @param {{dir?: string, cwd?: string}} [options] */
export function loadClassFile({ dir, cwd = process.cwd() } = {}) {
  for (const path of classFileCandidates({ dir, cwd })) {
    let raw;
    try { raw = readRegularFile(path, 1024 * 1024).toString('utf8'); }
    catch (error) {
      if (error && error.code === 'ENOENT') continue;
      throw error;
    }
    let config;
    try { config = parseClasses(raw); }
    catch { config = null; }
    if (!config) throw new Error(`classes.json is malformed: ${path}`);
    return { path, config };
  }
  throw new Error('classes.json not found');
}

function snapshotBeside(path) {
  let text;
  try { text = readRegularFile(join(dirname(path), 'MANIFEST.json'), 1024 * 1024).toString('utf8'); }
  catch (error) {
    if (error && error.code === 'ENOENT') return null;
    console.error('aunx: model snapshot unavailable; using the tier family');
    return null;
  }
  try {
    const manifest = JSON.parse(text);
    if (!manifest || manifest.models == null) return null;
    return validateSnapshot(manifest.models, { allowHeld: true, fresh: false });
  } catch {
    console.error('aunx: model snapshot unavailable; using the tier family');
    return null;
  }
}

// Returns null when the argv is an ordinary task route. Class flags are strict.
export function takeClassFlags(args) {
  const mode = args.some((arg) => arg === '--class' || arg === '--data' || arg === '--write' || arg === '--json');
  if (!mode) return null;
  let className = null;
  let data = 'private';
  let write = false;
  let json = false;
  let sawData = false;
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--class') {
      if (className) throw new Error('duplicate --class');
      const value = args[++i];
      if (!CLASS_NAMES.includes(value)) throw new Error(USAGE);
      className = value;
    } else if (flag === '--data') {
      if (sawData) throw new Error('duplicate --data');
      const value = args[++i];
      if (value !== 'public' && value !== 'private') throw new Error('--data must be public or private');
      data = value;
      sawData = true;
    } else if (flag === '--write') {
      if (write) throw new Error('duplicate --write');
      write = true;
    } else if (flag === '--json') {
      if (json) throw new Error('duplicate --json');
      json = true;
    } else if (typeof flag === 'string' && flag.startsWith('--')) throw new Error('unknown flag ' + flag);
    else rest.push(flag);
  }
  if (!className) throw new Error(USAGE);
  if (rest.length) throw new Error(USAGE);
  return { className, data, write, json };
}

/** @param {any} config
 * @param {{name?: string, data?: string, write?: boolean, installed?: (lane: string) => boolean, snapshot?: any}} [options] */
export function resolveCapabilityClass(config, { name, data = 'private', write = false, installed = (lane) => Boolean(which(lane)), snapshot = null } = {}) {
  const list = config && config.classes ? config.classes[name] : undefined;
  if (!Array.isArray(list)) throw new Error(`unknown class ${name}`);
  const dataKey = data === 'public' ? 'public' : 'private';
  const modeKey = write ? 'write' : 'read';
  const dataSet = new Set(config.eligibility[dataKey]);
  const modeSet = new Set(config.eligibility[modeKey]);
  const skipped = [];
  for (const entry of list) {
    const lane = entry && typeof entry.lane === 'string' ? entry.lane : '';
    const effortOk = !entry || entry.effort == null || typeof entry.effort === 'string';
    const modelOk = !entry || entry.model == null || typeof entry.model === 'string';
    if (!lane || !effortOk || !modelOk) {
      skipped.push({ lane: lane || '?', reason: 'malformed preference' });
      continue;
    }
    if (!LANES.includes(lane)) {
      skipped.push({ lane, reason: 'unknown lane' });
      continue;
    }
    if (!installed(lane)) {
      skipped.push({ lane, reason: 'not installed' });
      continue;
    }
    if (!dataSet.has(lane)) {
      skipped.push({ lane, reason: `not eligible for ${dataKey} data` });
      continue;
    }
    if (!modeSet.has(lane)) {
      skipped.push({ lane, reason: `not eligible to ${modeKey}` });
      continue;
    }
    return { lane, model: resolveClassModel(entry.model, snapshot), effort: entry.effort == null ? null : entry.effort, skipped };
  }
  return { lane: null, model: null, effort: null, skipped };
}

export function formatClassRoute(result, json) {
  const model = result.lane ? (result.model || 'default') : null;
  const effort = result.lane ? (result.effort == null ? 'none' : result.effort) : null;
  if (json) return JSON.stringify({ lane: result.lane, model, effort, skipped: result.skipped });
  const lines = [];
  if (result.lane) lines.push(`${result.lane} model=${model} effort=${effort}`);
  for (const skip of result.skipped) lines.push(`skipped ${skip.lane}: ${skip.reason}`);
  if (!result.lane) lines.push('no eligible lane');
  return lines.join('\n');
}

/** @param {{className?: string, data?: string, write?: boolean, json?: boolean}} flags
 * @param {{dir?: string, cwd?: string}} [options] */
export function routeClass(flags, { dir, cwd = process.cwd() } = {}) {
  const loaded = loadClassFile({ dir, cwd });
  const snapshot = snapshotBeside(loaded.path);
  const result = resolveCapabilityClass(loaded.config, { name: flags.className, data: flags.data, write: flags.write, snapshot });
  process.stdout.write(formatClassRoute(result, flags.json) + '\n');
  if (!result.lane && flags.json) console.error('no eligible lane');
  return result.lane ? 0 : 13;
}
