import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync, statSync, lstatSync, unlinkSync, openSync, closeSync, fstatSync,
   constants } from 'node:fs';
import { join, dirname, relative, resolve, sep } from 'node:path';
import { validateActivationOwnership } from '../activation-ownership.js';
import { sha256, LEGACY_BRIEF } from './shared.js';
import { realRoot, preflight } from './paths.js';
import { RUNTIME, toPosixRel, fileClass } from './ownership.js';
import { atomicWriteFile, backupPath, ensureBackupDirectory } from './backups.js';

export function readLegacyBrief(path, dir) {
  const problems = preflight([{ rel: LEGACY_BRIEF }], dir);
  if (problems.length) throw Object.assign(new Error(problems.join('; ')), { code: 'PREFLIGHT' });
  const expected = lstatSync(path);
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const actual = fstatSync(fd);
    if (!actual.isFile() || actual.dev !== expected.dev || actual.ino !== expected.ino) {
      throw Object.assign(new Error('legacy brief changed during inspection; re-run the installer'), { code: 'PREFLIGHT' });
    }
    return { content: readFileSync(fd), stat: actual };
  } finally { closeSync(fd); }
}

// Files carry a root: 'dir' for the docs folder, 'project' for the agent
// definitions the user's CLI reads from the project root. Each root gets its
// own preflight; one failure anywhere rolls back everything this run touched.
// Machine-owned files refresh when their bytes change (they carry the selection); other
// existing documents are kept unless --force, or --update-docs for the ones a previous run wrote and nobody edited.
export function writeFiles(files, opts) {
  const { dir, force = false, dry = false, upgradeRuntime = false, updateDocs = false } = opts;
  const roots = { dir, project: opts.project || dir };
  const previous = opts.prevManifest;
  const sameRoot = (kind) => {
    if (typeof previous?.[kind] !== 'string') return false;
    try { return realRoot(previous[kind]).root === realRoot(roots[kind]).root; }
    catch { return false; }
  };
  const sameRoots = { dir: sameRoot('dir'), project: sameRoot('project') };
  const belongsHere = (key) => typeof key === 'string' && sameRoots[key.startsWith('[project] ') ? 'project' : 'dir'];
  // A hash or directory from another project cannot establish ownership here.
  const prevHashes = previous?.files ? Object.fromEntries(Object.entries(previous.files).filter(([key]) => belongsHere(key))) : null;
  if (sameRoots.project && previous?.activation !== undefined) {
    if (!previous.activation || typeof previous.activation !== 'object' || Array.isArray(previous.activation)) {
      throw Object.assign(new Error('invalid activation ownership in previous manifest'), { code: 'PREFLIGHT' });
    }
    for (const [key, ownership] of Object.entries(previous.activation)) {
      const problem = validateActivationOwnership(key, ownership);
      if (problem) throw Object.assign(new Error(problem), { code: 'PREFLIGHT' });
    }
  }
  const activation = previous?.activation && typeof previous.activation === 'object' && !Array.isArray(previous.activation)
    ? Object.fromEntries(Object.entries(previous.activation).filter(([key]) => belongsHere(key))) : {};
  for (const file of files.filter((item) => item.activation)) {
    const key = '[project] ' + toPosixRel(file.rel);
    const prior = activation[key];
    const next = { ...file.activation, created: file.original === null };
    if (prior?.kind === next.kind) {
      next.created = prior.created;
      if (next.kind === 'rules') {
        next.addedPrefix = prior.addedPrefix;
        next.addedSuffix = prior.addedSuffix;
      } else if (next.kind === 'hooks') {
        next.hadHooks = prior.hadHooks;
        next.originalEvents = prior.originalEvents;
        next.hooks = [...new Map([...(prior.hooks || []), ...next.hooks].map((hook) => [JSON.stringify(hook), hook])).values()];
      } else if (next.kind === 'mcp') {
        next.servers = { ...prior.servers, ...next.servers };
        next.hadKey = prior.hadKey;
      }
    }
    activation[key] = next;
  }
  const groups = { dir: files.filter((f) => (f.root || 'dir') === 'dir'), project: files.filter((f) => f.root === 'project') };
  const problems = preflight([{ rel: '.backups/.gitignore' }], dir);
  for (const k of ['dir', 'project']) {
    if (!groups[k].length) continue;
    problems.push(...preflight(groups[k], roots[k]).map((p) => (k === 'project' ? `[project] ${p}` : p)));
  }
  // A legacy brief is a read and possible deletion target, so validate it with
  // the same containment, regular-file and symlink checks as every write.
  const currentBrief = groups.dir.find((f) => f.rel === 'TASK_BRIEF.md');
  const legacyPath = resolve(realRoot(dir).root, LEGACY_BRIEF);
  let hasLegacy = false;
  if (currentBrief) {
    try { lstatSync(legacyPath); hasLegacy = true; } catch { /* absent */ }
    if (hasLegacy) problems.push(...preflight([{ rel: LEGACY_BRIEF }], dir));
  }
  if (!problems.length) {
    for (const f of files.filter((file) => file.applySnippet)) {
      const abs = resolve(roots[f.root], f.rel);
      const current = existsSync(abs) ? readFileSync(abs) : null;
      if (current === null ? f.original !== null : !Buffer.isBuffer(f.original) || !current.equals(f.original)) {
        problems.push(`${abs}: changed since snippet planning; re-run the installer`);
      }
    }
    // Register only the generated hook bytes, or an owned version that this
    // transaction can safely upgrade. Kept unverified code must not be wired.
    if (files.some((file) => file.activation?.kind === 'hooks')) {
      for (const file of files.filter((file) => file.root === 'project' && RUNTIME.has(toPosixRel(file.rel)))) {
        const abs = resolve(roots.project, file.rel);
        if (!existsSync(abs) || force || upgradeRuntime) continue;
        const currentHash = sha256(readFileSync(abs));
        if (currentHash === sha256(file.content) || currentHash === prevHashes?.['[project] ' + toPosixRel(file.rel)]) continue;
        problems.push((`${abs}` +
          ": refusing to activate an edited or unverified hook; inspect it, then re-run with --upgrade-runtime " +
          "to replace it"));
      }
    }
  }
  if (problems.length) {
    const e = new Error('refusing to write:\n  ' + problems.join('\n  '));
    e.code = 'PREFLIGHT';
    throw e;
  }
  const written = [];
  const skipped = [];
  const upgraded = [];      // runtime files replaced because the installed copy was an untouched generated one
  const conflicts = [];     // runtime files kept because the installed copy differs from what we generated
  const unverifiable = [];  // runtime files kept because there is no manifest to compare against
  const lanesWithheld = []; // selected lanes the kept runner does not support
  let lanesHash;
  const docsUpdated = [];   // --update-docs: documents regenerated because the installed copy was an untouched generated one
  const docsConflict = [];  // --update-docs: documents kept because you edited them
  const docsUnverifiable = []; // --update-docs: documents kept because there is no manifest to compare against
  const docsRenamed = [];
  const backups = [];
  const created = [];
  // Only directories actually created by this install are owned. Preserve the
  // previous inventory on reruns; legacy manifests deliberately own none.
  const createdDirectories = new Set(Array.isArray(previous?.directories) ? previous.directories.filter(belongsHere) : []);
  const originals = new Map(); // abs -> {content, mode} of files --force overwrote, restored on failure
  // Files that exist and were NOT rewritten this run. MANIFEST.json must record the hash of
  // what is on disk for them (the previous run's hash, or nothing when there was no manifest),
  // never the hash of content this run planned but did not write. Otherwise the next
  // --update-docs or upgrade sees every kept file as "edited".
  const keptKeys = new Set();
  const removedKeys = new Set();
  try {
    // project first so MANIFEST.json (last in the dir group) is the final write and can
    // describe every decision made above it
    for (const k of ['project', 'dir']) {
      if (!groups[k].length) continue;
      const { root } = realRoot(roots[k]);
      for (const f of groups[k]) {
        const abs = resolve(root, f.rel);
        const exists = existsSync(abs);
        // label is what reaches the terminal report (bin/cli.js's "runtime
        // upgraded:", "runtime CONFLICT, kept:", etc lines): posix-normalized
        // like key, below, so the report reads the same on every host. Before
        // this it carried f.rel verbatim, which is native-separated (join()),
        // so on win32 the report named "bin\cli-run.mjs" while everything
        // else in this tool (docs, other path prose) uses forward slashes.
        const label = (k === 'project' ? '[project] ' : '') + f.rel.split(sep).join('/');
        const key = label;
        const cls = k === 'dir' || RUNTIME.has(toPosixRel(f.rel)) ? fileClass(f.rel) : 'document';
        if (exists && f.applySnippet && Buffer.from(f.content).equals(readFileSync(abs))) {
          skipped.push(label);
          continue;
        }
        if (exists && !force && !f.applySnippet) {
          if (cls === 'document') {
            // Documents are the user's. Without --update-docs they are never touched.
            // With it, the same hash rule the runtime class uses applies: regenerate
            // only what a previous run wrote and nobody edited since.
            if (!updateDocs) {
              skipped.push(label);
              keptKeys.add(key);
              continue;
            }
            const onDisk = sha256(readFileSync(abs));
            if (onDisk === sha256(f.content)) {
              skipped.push(label); // already current
              continue;
            }
            const prev = prevHashes ? prevHashes[key] : undefined;
            if (!prev) {
              docsUnverifiable.push(label);
              keptKeys.add(key);
              continue;
            }
            if (onDisk !== prev) {
              docsConflict.push(label);
              keptKeys.add(key);
              continue;
            }
            docsUpdated.push(label);
          }
          if (cls === 'runtime') {
            const onDisk = sha256(readFileSync(abs));
            if (onDisk === sha256(f.content)) {
              skipped.push(label); // already current
              continue;
            }
            if (!upgradeRuntime) {
              const prev = prevHashes ? prevHashes[key] : undefined;
              if (!prev) {
                unverifiable.push(label);
                keptKeys.add(key);
                continue;
              }
              if (onDisk !== prev) {
                conflicts.push(label);
                keptKeys.add(key);
                continue;
              }
            }
            upgraded.push(label); // untouched generated file, or --upgrade-runtime said replace it: either way it is reported
          }
        }
        let content = f.content;
        if (k === 'dir' && key === 'bin/lanes.json' && keptKeys.has('bin/cli-run.mjs')) {
          // planFiles puts the runner first, so its keep decision is known here.
          let supported;
          try {
            const match = readFileSync(join(root, 'bin', 'cli-run.mjs'), 'utf8').match(/^\s*export const LANES = \[([\s\S]*?)\];/m);
            if (match && /^\s*(?:(?:'[^'\\]*'|"[^"\\]*")\s*(?:,\s*(?:'[^'\\]*'|"[^"\\]*")\s*)*,?\s*)?$/.test(match[1])) {
              supported = [...match[1].matchAll(/'([^'\\]*)'|"([^"\\]*)"/g)].map(m => m[1] ?? m[2]);
            }
          } catch { /* unknown runner contents are not evidence of unsupported lanes */ }
          if (supported) {
            const lanes = JSON.parse(content);
            lanesWithheld.push(...new Set([...lanes.enabled, ...Object.keys(lanes.defaults || {})].filter(lane => !supported.includes(lane))));
            lanes.enabled = lanes.enabled.filter(lane => supported.includes(lane));
            if (lanes.defaults) lanes.defaults = Object.fromEntries(Object.entries(lanes.defaults).filter(([lane]) => supported.includes(lane)));
            content = JSON.stringify(lanes, null, 2) + '\n';
            lanesHash = sha256(content);
          }
        }
        if (f.rel === 'MANIFEST.json') {
          if (hasLegacy) {
            const previousHash = prevHashes?.[LEGACY_BRIEF];
            const original = readLegacyBrief(legacyPath, dir);
            const unchanged = previousHash && sha256(original.content) === previousHash;
            if ((updateDocs || force) && unchanged) {
              // The replacement has already been written (or preserved) by this
              // point. Keep deletion in this transaction and restore on failure.
              const current = readLegacyBrief(legacyPath, dir);
              const last = lstatSync(legacyPath);
              if (!current.content.equals(original.content) || current.stat.ino !== original.stat.ino || current.stat.dev !== original.stat.dev
                  || last.ino !== current.stat.ino || last.dev !== current.stat.dev || !last.isFile()) {
                const e = new Error('legacy brief changed during upgrade; re-run the installer');
                e.code = 'PREFLIGHT';
                throw e;
              }
              if (!dry) {
                originals.set(legacyPath, { content: original.content, mode: original.stat.mode });
                unlinkSync(legacyPath);
              }
              removedKeys.add(LEGACY_BRIEF);
              docsRenamed.push(`${LEGACY_BRIEF} -> TASK_BRIEF.md`);
            } else if ((updateDocs || force) && !previousHash) {
              docsUnverifiable.push(LEGACY_BRIEF);
            } else if ((updateDocs || force) && !unchanged) {
              docsConflict.push(LEGACY_BRIEF);
            } else skipped.push(LEGACY_BRIEF);
          }
          const m = JSON.parse(content);
          // Preserve ownership of retained 0.1.x companion files and other
          // formerly selected files, so uninstall still checks their original
          // installed hashes. New defaults do not erase a previous selection.
          m.files = { ...prevHashes, ...m.files };
          if (lanesHash) m.files['bin/lanes.json'] = lanesHash;
          if (Object.keys(activation).length) m.activation = activation;
          for (const removed of removedKeys) delete m.files[removed];
          for (const kk of Object.keys(m.files || {})) {
            if (!keptKeys.has(kk)) continue;
            if (prevHashes && prevHashes[kk]) m.files[kk] = prevHashes[kk];
            else delete m.files[kk]; // never recorded: stays unverifiable, which is the truth
          }
          content = JSON.stringify(m, null, 2) + '\n';
        }
        if (exists && Buffer.from(content).equals(readFileSync(abs))) {
          skipped.push(label);
          continue;
        }
        if (exists && cls !== 'owned' && (opts.backupExisting || k === 'project')) {
          const backup = backupPath(dir, abs);
          if (!dry) {
            ensureBackupDirectory(dir);
            writeFileSync(backup, readFileSync(abs), { flag: 'wx', mode: statSync(abs).mode & 0o777 });
          }
          backups.push(backup);
          if (!dry) opts.onBackup?.(backup);
        }
        if (!dry) {
          if (exists) originals.set(abs, { content: readFileSync(abs), mode: statSync(abs).mode });
          const missingDirectories = [];
          let parent = dirname(abs);
          while (parent === root || parent.startsWith(root + sep)) {
            if (existsSync(parent)) break;
            // Keep the project container itself; only its generated child
            // directories belong to this package.
            if (k !== 'project' || parent !== root) missingDirectories.push(parent);
            const up = dirname(parent);
            if (up === parent) break;
            parent = up;
          }
          mkdirSync(dirname(abs), { recursive: true });
          for (const path of missingDirectories) createdDirectories.add((k === 'project' ? '[project] ' : '') + (toPosixRel(relative(root, path)) || '.'));
          if (f.rel === 'MANIFEST.json') {
            const m = JSON.parse(content);
            m.directories = [...createdDirectories].sort();
            content = JSON.stringify(m, null, 2) + '\n';
          }
          const mode = exists && f.applySnippet ? statSync(abs).mode & 0o777 : f.mode;
          atomicWriteFile(abs, content, mode, exists);
          if (!exists) created.push(abs);
          if (!exists || !f.applySnippet) chmodSync(abs, f.mode);
        }
        written.push(label);
      }
    }
  } catch (e) {
    for (const abs of created.reverse()) {
      try {
        unlinkSync(abs);
      } catch {
        /* best effort */
      }
    }
    for (const [abs, o] of originals) {
      try {
        atomicWriteFile(abs, o.content, o.mode, existsSync(abs));
      } catch {
        /* best effort */
      }
    }
    throw e;
  }
  return { written, skipped, upgraded, conflicts, unverifiable, lanesWithheld, docsUpdated, docsConflict, docsUnverifiable, docsRenamed, backups };
}
