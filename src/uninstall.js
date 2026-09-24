import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { dirProblems, realRoot } from './install.js';

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
    return { bytes: readFileSync(fd), stat: actual };
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

// Validate every path and type before removing anything. The manifest is an
// inventory, never authority to expand the two roots supplied by the caller.
export function uninstallFiles({ dir, project, dry = false }) {
  const roots = { dir: targetRoot(dir), project: targetRoot(project) };
  const manifest = entry('MANIFEST.json', roots);
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

  const files = Object.entries(data.files).map(([key, digest]) => {
    const item = entry(key, roots);
    if (item.abs === manifest.abs) throw refused(`manifest cannot manage itself: ${key}`);
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw refused(`invalid content hash for ${key}`);
    return { ...item, digest };
  });
  const directories = (data.directories || []).map((key) => entry(key, roots, true));
  const seen = new Set([manifest.abs]);
  for (const item of [...files, ...directories]) {
    if (seen.has(item.abs)) throw refused(`duplicate manifest path: ${item.key}`);
    seen.add(item.abs);
    inspect(item);
  }

  const actions = [];
  const backupTargets = [...files, manifest];
  if (data.primary === 'claude-code') backupTargets.push(entry('[project] CLAUDE.md', roots), entry('[project] .claude/settings.json', roots));
  for (const item of backupTargets) {
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
  let edited = false;
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
  const disappearing = new Set(pending.map((item) => item.abs));
  if (!edited) disappearing.add(manifest.abs);
  const empty = [];
  directories.sort((a, b) => b.abs.split(sep).length - a.abs.split(sep).length || a.abs.localeCompare(b.abs));
  for (const item of directories) {
    if (!inspect(item)) continue;
    if (readdirSync(item.abs).every((name) => disappearing.has(join(item.abs, name)))) {
      disappearing.add(item.abs);
      empty.push(item);
    }
  }

  if (!dry) {
    // A changed type or symlink detected here still refuses the whole run.
    for (const item of [...files, ...directories, manifest]) inspect(item);
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
