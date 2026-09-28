import { closeSync, constants, existsSync, fstatSync, ftruncateSync, lstatSync, openSync, readFileSync, readdirSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { dirProblems, globalConfigProblem, realRoot } from './install.js';
import { START, END } from './apply-snippets.js';
import { validateActivationOwnership } from './activation-ownership.js';
import { MANIFEST_BYTE_CAP, readBounded } from './bounded-file.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const refused = (message) => Object.assign(new Error('refusing to uninstall: ' + message), { code: 'UNINSTALL' });

function stat(path) {
  try { return lstatSync(path); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function targetRoot(path) {
  const problems = dirProblems(path);
  if (problems.length) throw refused(problems.join('; '));
  const st = stat(resolve(path));
  if (st?.isSymbolicLink()) throw refused(`target is a symlink: ${path}`);
  if (st && !st.isDirectory()) throw refused(`target is not a directory: ${path}`);
  // As in the installer, ancestors above the chosen root may be system aliases
  // (for example /tmp on macOS). Entries inside the root may never be symlinks.
  return realRoot(path).root;
}

function entry(key, roots, directory = false) {
  if (typeof key !== 'string') throw refused('manifest paths must be strings');
  const project = key.startsWith('[project] ');
  const rel = project ? key.slice('[project] '.length) : key;
  const root = project ? roots.project : roots.dir;
  const isDirRoot = directory && !project && rel === '.';
  if (!isDirRoot && (!rel || isAbsolute(rel) || win32.isAbsolute(rel) || /[\\:\x00-\x1f\x7f]/.test(rel)
      || rel.split('/').some((part) => !part || part === '.' || part === '..'))) {
    throw refused(`invalid manifest path: ${key}`);
  }
  const abs = resolve(root, rel);
  if (!isDirRoot && (abs === root || !abs.startsWith(root + sep))) throw refused(`path leaves its target root: ${key}`);
  const globalProblem = globalConfigProblem(abs);
  if (globalProblem) throw refused(globalProblem);
  return { key, root, abs, directory };
}

function inspect(item) {
  const { root, abs, directory } = item;
  const parts = relative(root, abs).split(sep).filter(Boolean);
  let cur = root;
  // Recheck the root as well as the entry's parents before each removal.
  for (let i = -1; i < parts.length; i++) {
    if (i >= 0) cur = join(cur, parts[i]);
    const st = stat(cur);
    if (!st) return null;
    if (st.isSymbolicLink()) throw refused(`symlink at ${cur}`);
    const wantDirectory = i < parts.length - 1 || directory;
    if (wantDirectory ? !st.isDirectory() : !st.isFile()) throw refused(`unexpected file type at ${cur}`);
    if (i === parts.length - 1) return st;
  }
}

function readRegular(item) {
  const expected = inspect(item);
  if (!expected) return null;
  // Nonblocking open also protects against a regular file being replaced by a
  // FIFO between lstat and open. O_NOFOLLOW protects the final component.
  const fd = openSync(item.abs, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const actual = fstatSync(fd);
    if (!actual.isFile() || actual.dev !== expected.dev || actual.ino !== expected.ino) throw refused(`file changed during inspection: ${item.abs}`);
    return { bytes: item.maxBytes ? readBounded(fd, item.maxBytes) : readFileSync(fd), stat: actual };
  } finally { closeSync(fd); }
}

function removeFile(item, expectedHash) {
  const current = readRegular(item);
  if (!current) return;
  if (hash(current.bytes) !== expectedHash) throw refused(`keep edited ${item.abs}: changed during uninstall`);
  const last = inspect(item);
  if (!last || last.dev !== current.stat.dev || last.ino !== current.stat.ino) throw refused(`file changed during uninstall: ${item.abs}`);
  unlinkSync(item.abs);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function activationEntry(key, ownership, roots) {
  const problem = validateActivationOwnership(key, ownership);
  if (problem) throw refused(problem);
  const item = entry(key, roots);
  return { ...item, ownership };
}

// Only the bytes/config entries recorded by activation belong to this install.
// User content around a block and unrelated settings survive later edits.
function removeActivation(item, bytes) {
  const owned = item.ownership;
  if (owned.kind === 'rules') {
    let start = bytes.indexOf(START);
    let end = bytes.indexOf(END);
    if (start === -1 && end === -1) return { content: bytes, edited: false };
    if (start < 0 || end < start || bytes.indexOf(START, start + START.length) !== -1 || bytes.indexOf(END, end + END.length) !== -1) return { content: bytes, edited: true };
    end += Buffer.byteLength(END);
    if (hash(bytes.subarray(start, end)) !== owned.blockHash) return { content: bytes, edited: true };
    const prefix = Buffer.from(owned.addedPrefix);
    const suffix = Buffer.from(owned.addedSuffix);
    if (prefix.length && bytes.subarray(start - prefix.length, start).equals(prefix)) start -= prefix.length;
    if (suffix.length && bytes.subarray(end, end + suffix.length).equals(suffix)) end += suffix.length;
    const content = Buffer.concat([bytes.subarray(0, start), bytes.subarray(end)]);
    return { content: owned.created && content.length === 0 ? null : content, edited: false };
  }
  let data;
  try { data = JSON.parse(bytes.toString('utf8')); }
  catch { return { content: bytes, edited: true }; }
  if (!object(data)) return { content: bytes, edited: true };
  let edited = false;
  let changed = false;
  if (owned.kind === 'hooks') {
    if (data.hooks === undefined) return { content: bytes, edited: false };
    if (!object(data.hooks)) return { content: bytes, edited: true };
    for (const record of owned.hooks) {
      const groups = data.hooks[record.event];
      if (groups === undefined) continue;
      if (!Array.isArray(groups) || groups.some((group) => !object(group) || !Array.isArray(group.hooks))) { edited = true; continue; }
      let removed = false;
      for (let index = 0; index < groups.length; index++) {
        const group = groups[index];
        const { hooks, ...attributes } = group;
        if (!same(attributes, record.group)) continue;
        const match = hooks.findIndex((hook) => same(hook, record.hook));
        if (match === -1) continue;
        hooks.splice(match, 1);
        if (!hooks.length) groups.splice(index, 1);
        changed = removed = true;
        break;
      }
      if (!removed && groups.some((group) => group.hooks.some((hook) => object(hook) && hook.command === record.hook.command && same(hook.args || [], record.hook.args || [])))) edited = true;
      if (!groups.length && !owned.originalEvents.includes(record.event)) delete data.hooks[record.event];
    }
    if (!owned.hadHooks && Object.keys(data.hooks).length === 0) delete data.hooks;
  } else {
    const servers = data[owned.key];
    if (servers === undefined) return { content: bytes, edited: false };
    if (!object(servers)) return { content: bytes, edited: true };
    for (const [name, configuration] of Object.entries(owned.servers)) {
      if (!Object.hasOwn(servers, name)) continue;
      if (!same(servers[name], configuration)) { edited = true; continue; }
      delete servers[name];
      changed = true;
    }
    if (!owned.hadKey && Object.keys(servers).length === 0) delete data[owned.key];
  }
  return { content: !changed ? bytes : owned.created && Object.keys(data).length === 0 ? null : Buffer.from(JSON.stringify(data, null, 2) + '\n'), edited };
}

function applyRemoval(item, plan) {
  const current = readRegular(item);
  if (!current || !current.bytes.equals(plan.original)) throw refused(`file changed during uninstall: ${item.abs}`);
  const backup = plan.backup;
  writeFileSync(backup, current.bytes, { flag: 'wx', mode: current.stat.mode & 0o777 });
  const last = inspect(item);
  if (!last || last.dev !== current.stat.dev || last.ino !== current.stat.ino) throw refused(`file changed during uninstall: ${item.abs}`);
  if (plan.content === null) unlinkSync(item.abs);
  else {
    const fd = openSync(item.abs, constants.O_WRONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
    try {
      const actual = fstatSync(fd);
      if (!actual.isFile() || actual.dev !== current.stat.dev || actual.ino !== current.stat.ino) throw refused(`file changed during uninstall: ${item.abs}`);
      ftruncateSync(fd, 0);
      writeFileSync(fd, plan.content);
    } finally { closeSync(fd); }
  }
}

// Validate every path and type before removing anything. The manifest is an
// inventory, never authority to expand the two roots supplied by the caller.
export function uninstallFiles({ dir, project, dry = false }) {
  const roots = { dir: targetRoot(dir), project: targetRoot(project) };
  const manifest = { ...entry('MANIFEST.json', roots), maxBytes: MANIFEST_BYTE_CAP };
  const saved = readRegular(manifest);
  if (!saved) throw refused(`missing manifest: ${join(resolve(dir), 'MANIFEST.json')}`);
  let data;
  try { data = JSON.parse(saved.bytes.toString('utf8')); }
  catch { throw refused(`invalid JSON in ${manifest.abs}`); }
  if (!object(data) || data.generator !== 'model-orchestrator' || !object(data.files)) throw refused(`invalid manifest schema: ${manifest.abs}`);
  for (const name of ['dir', 'project']) {
    if (typeof data[name] !== 'string' || targetRoot(data[name]) !== roots[name]) {
      throw refused(`--${name} differs from the manifest; use the original installation path`);
    }
  }
  if (data.directories !== undefined && !Array.isArray(data.directories)) throw refused('manifest directories must be an array');
  if (data.activation !== undefined && !object(data.activation)) throw refused('manifest activation must be an object');

  const files = Object.entries(data.files).map(([key, digest]) => {
    const item = entry(key, roots);
    if (item.abs === manifest.abs) throw refused(`manifest cannot manage itself: ${key}`);
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw refused(`invalid content hash for ${key}`);
    return { ...item, digest };
  });
  const directories = (data.directories || []).map((key) => entry(key, roots, true));
  const activation = Object.entries(data.activation || {}).map(([key, ownership]) => activationEntry(key, ownership, roots));
  const seen = new Set([manifest.abs]);
  for (const item of [...files, ...directories, ...activation]) {
    if (seen.has(item.abs)) throw refused(`duplicate manifest path: ${item.key}`);
    seen.add(item.abs);
    inspect(item);
  }

  const actions = [];
  const backupTargets = [...files, manifest, ...activation];
  if (data.primary === 'claude-code') backupTargets.push(entry('[project] CLAUDE.md', roots), entry('[project] .claude/settings.json', roots));
  for (const item of new Map(backupTargets.map((target) => [target.abs, target])).values()) {
    const parent = dirname(item.abs);
    if (!inspect({ root: item.root, abs: parent, directory: true })) continue;
    const prefix = basename(item.abs) + '.bak-';
    for (const name of readdirSync(parent).sort()) {
      if (name.startsWith(prefix) && /^\d{8}T\d{6}$/.test(name.slice(prefix.length))) {
        actions.push('  keep backup ' + join(parent, name));
      }
    }
  }
  const pending = [];
  const changes = [];
  let edited = false;
  for (const item of activation) {
    const current = readRegular(item);
    if (!current) { actions.push('  missing activation ' + item.abs); continue; }
    const removal = removeActivation(item, current.bytes);
    if (removal.edited) {
      edited = true;
      actions.push('  keep edited activation ' + item.abs);
    }
    if (removal.content !== null && removal.content.equals(current.bytes)) continue;
    let stamp = Date.now();
    let backup;
    do {
      backup = item.abs + '.bak-' + new Date(stamp).toISOString().replace(/[-:]/g, '').slice(0, 15);
      stamp += 1000;
    } while (existsSync(backup));
    changes.push({ item, original: current.bytes, ...removal, backup });
    actions.push('  backup ' + backup);
    actions.push('  remove activation ' + item.abs);
  }
  for (const item of files) {
    const current = readRegular(item);
    if (!current) actions.push('  missing file ' + item.abs);
    else if (hash(current.bytes) !== item.digest) {
      edited = true;
      actions.push('  keep edited ' + item.abs);
    } else {
      pending.push(item);
      actions.push('  remove file ' + item.abs);
    }
  }
  if (edited) actions.push('  keep manifest ' + manifest.abs);
  else actions.push('  remove file ' + manifest.abs);

  // Compute empty directories against the same plan used by the real run.
  // Foreign entries and kept edits prevent their parents from being removed.
  const disappearing = new Set([...pending.map((item) => item.abs), ...changes.filter((plan) => plan.content === null).map((plan) => plan.item.abs)]);
  const backupParents = new Set(changes.map((plan) => dirname(plan.backup)));
  if (!edited) disappearing.add(manifest.abs);
  const empty = [];
  directories.sort((a, b) => b.abs.split(sep).length - a.abs.split(sep).length || a.abs.localeCompare(b.abs));
  for (const item of directories) {
    if (!inspect(item)) continue;
    if (!backupParents.has(item.abs) && readdirSync(item.abs).every((name) => disappearing.has(join(item.abs, name)))) {
      disappearing.add(item.abs);
      empty.push(item);
    }
  }

  if (!dry) {
    // A changed type or symlink detected here still refuses the whole run.
    for (const item of [...files, ...directories, ...activation, manifest]) inspect(item);
    for (const plan of changes) applyRemoval(plan.item, plan);
    for (const item of pending) removeFile(item, item.digest);
    if (!edited) removeFile(manifest, hash(saved.bytes));
  }
  for (const item of empty) {
    if (!dry) {
      if (!inspect(item)) continue;
      try { rmdirSync(item.abs); }
      catch (error) {
        if (error.code === 'ENOTEMPTY' || error.code === 'EEXIST') continue;
        throw error;
      }
    }
    actions.push('  remove directory ' + item.abs);
  }
  return actions;
}
