import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

export const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
export const RESULTS = join(ROOT, 'proof', 'results.json');
export const isMain = url => Boolean(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(url));
export function scratch() { return mkdtempSync(join(tmpdir(), 'model-orchestrator-proof-')); }
export function clean(path) { rmSync(path, { recursive: true, force: true }); }
export function run(args, options = {}) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 30000, cwd: ROOT, ...options });
  if (result.error) throw result.error;
  return result;
}
export function median(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const center = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[center] : (sorted[center - 1] + sorted[center]) / 2;
}
export function timed(fn) {
  const start = process.hrtime.bigint();
  const result = fn();
  return { result, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}
export function fixtureEnv(dir) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (['PATH', 'HOME', 'USERPROFILE'].includes(key.toUpperCase())) delete env[key];
  return { ...env, PATH: join(dir, 'bin'), HOME: dir, USERPROFILE: dir };
}
export function stubLane(dir, name, source) {
  mkdirSync(join(dir, 'bin'), { recursive: true });
  const script = join(dir, 'bin', `${name}.cjs`);
  writeFileSync(script, source);
  if (process.platform === 'win32') {
    writeFileSync(join(dir, 'bin', `${name}.cmd`), '@ECHO off\r\nSET "_prog=node"\r\n"%_prog%" "%dp0%'+name+'.cjs" %*\r\n');
  } else {
    writeFileSync(join(dir, 'bin', name), '#!' + process.execPath + '\n' + source, { mode: 0o755 });
  }
  return script;
}
export function entry(id, label, value, unit, sampleSize, method, script, extra = {}) {
  const now = new Date();
  const expires = new Date(now);
  expires.setUTCDate(expires.getUTCDate() + 14);
  return { id, label, kind: 'reproducible', value, unit, measuredAt: now.toISOString().slice(0, 10), method, sampleSize, script: `proof/scripts/${script}`, expiresAt: expires.toISOString().slice(0, 10), ...extra };
}
export function readResults() { return JSON.parse(readFileSync(RESULTS, 'utf8')); }
export function validateResults(data, now = new Date()) {
  const errors = [];
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.entries) || !data.entries.length) return ['Expected schemaVersion 1 with measured entries'];
  const today = now.toISOString().slice(0, 10);
  const ids = new Set();
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  for (const item of data.entries) {
    if (!item || typeof item.id !== 'string' || ids.has(item.id)) { errors.push('Entry id must be unique'); continue; }
    ids.add(item.id);
    if (typeof item.value !== 'number' || !Number.isFinite(item.value)) errors.push(`${item.id}: value must be finite`);
    if (!Number.isInteger(item.sampleSize) || item.sampleSize < 1) errors.push(`${item.id}: sample size must be positive`);
    if (!['reproducible', 'author-setup'].includes(item.kind)) errors.push(`${item.id}: unknown measurement kind`);
    for (const key of ['label', 'unit', 'method', 'script']) if (typeof item[key] !== 'string' || !item[key].trim()) errors.push(`${item.id}: ${key} is required`);
    if (!validDate(item.measuredAt) || !validDate(item.expiresAt)) errors.push(`${item.id}: valid ISO dates required`);
    else {
      if (item.measuredAt > today) errors.push(`${item.id}: measurement is in the future`);
      if (item.expiresAt < item.measuredAt) errors.push(`${item.id}: expiry precedes measurement`);
      if (item.expiresAt < today) errors.push(`${item.id}: expired ${item.expiresAt}`);
    }
    const localAuthorSource = item.kind === 'author-setup' && item.script === 'author setup, re-measured locally';
    if (!localAuthorSource && (typeof item.script !== 'string' || !/^proof\/scripts\/[A-Za-z0-9_-]+\.js$/.test(item.script))) errors.push(`${item.id}: script must name a proof script`);
  }
  return errors;
}
