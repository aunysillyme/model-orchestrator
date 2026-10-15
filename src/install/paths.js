import { existsSync, statSync, lstatSync, realpathSync } from 'node:fs';
import { join, dirname, isAbsolute, relative, resolve, sep, parse as parsePath } from 'node:path';
import { homedir } from 'node:os';
import { AIS } from '../catalog.js';

// --dir is rendered into a bash script and a systemd unit. It is data there,
// never syntax: single-quoted for bash (the only character that needs care
// inside single quotes is the quote itself), and %-escaped for systemd, whose
// specifiers begin with %. Control characters and newlines are refused outright
// because no quoting convention survives them in both grammars.
export function shellQuote(v) {
  return "'" + String(v).replace(/'/g, "'\\''") + "'";
}
export function systemdEscape(v) {
  return String(v).replace(/%/g, '%%');
}
export function dirProblems(dir) {
  const abs = resolve(dir);
  const problems = [];
  if (/[\x00-\x1f\x7f]/.test(abs)) problems.push('the target path contains control characters or a newline');
  if (abs.includes('"')) problems.push('the target path contains a double quote; choose a folder without double quotes');
  if (abs === parsePath(abs).root) problems.push('the target is the filesystem root; pick a folder');
  return problems;
}

// Every write is checked before any write happens:
//   containment  the resolved target stays inside --dir (template names are ours,
//                but a check is cheaper than trusting that forever)
//   no symlinks  no existing path component under --dir may be a symlink, so a
//                target/bin -> /elsewhere link cannot redirect a write
//   parent type  an existing component that must be a directory is one
// Then files are written with an exclusive create unless --force, and any file
// this run created is removed again if a later write fails.
// Resolve the target root through whatever part of it already exists. A
// symlinked ancestor (macOS /tmp -> /private/tmp, a user's ~/projects link) is
// the user's own choice and is followed; the resolved real path is what every
// containment check compares against. A root that exists and is not a
// directory is refused.
export function realRoot(dir) {
  const abs = resolve(dir);
  const missing = [];
  let cur = abs;
  while (!existsSync(cur)) {
    missing.unshift(cur.slice(dirname(cur).length + (dirname(cur).endsWith(sep) ? 0 : 1)));
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  const real = realpathSync(cur);
  return { root: missing.length ? join(real, ...missing) : real, exists: missing.length === 0 };
}

// Project activation must never become a machine-wide agent configuration.
// Resolve the user's home as well as the requested root to cover system aliases.
export function globalConfigProblem(path) {
  const home = realRoot(homedir()).root;
  const globalFolders = new Set(['.claude', '.codex', '.grok', '.qwen', '.gemini', '.agents', '.antigravity', '.hermes']);
  for (const ai of AIS) {
    if (ai.facts?.agentDefinitions) globalFolders.add(ai.facts.agentDefinitions.split('/')[0]);
  }
  const rules = new Set(AIS.map((ai) => ai.rulesFile).filter(Boolean));
  rules.add('.mcp.json');
  const relativePath = relative(home, path);
  const globalFolder = [...globalFolders].some((folder) => {
    const target = realRoot(join(home, folder)).root;
    const rel = relative(target, path);
    return rel === '' || rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
  });
  if (rules.has(relativePath) || globalFolder) {
    return `${home}: global agent configuration is outside the installer scope; choose a project folder below your home directory`;
  }
  return null;
}

export function preflight(files, dir) {
  const problems = dirProblems(dir);
  if (problems.length) return problems;
  const { root, exists } = realRoot(dir);
  if (exists && !statSync(root).isDirectory()) return [`the target exists and is not a directory: ${resolve(dir)}`];
  for (const f of files) {
    const abs = resolve(root, f.rel);
    if (abs === root || !abs.startsWith(root + sep)) {
      problems.push(`${f.rel}: resolves outside the target directory`);
      continue;
    }
    const globalProblem = globalConfigProblem(abs);
    if (globalProblem) {
      if (!problems.includes(globalProblem)) problems.push(globalProblem);
      continue;
    }
    const parts = relative(root, abs).split(sep);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      cur = join(cur, parts[i]);
      let st;
      try {
        st = lstatSync(cur);
      } catch {
        break; // nothing below here exists yet
      }
      const last = i === parts.length - 1;
      if (st.isSymbolicLink()) {
        problems.push(`${f.rel}: ${relative(root, cur)} is a symlink`);
        break;
      }
      if (!last && !st.isDirectory()) {
        problems.push(`${f.rel}: ${relative(root, cur)} exists and is not a directory`);
        break;
      }
      if (last && !st.isFile()) {
        problems.push(`${f.rel}: exists and is not a regular file`);
        break;
      }
    }

  }
  return problems;
}

// Path-safety-only preflight: global agent config, path escape, a non-directory
// target. Read-only, no side effects, and independent of any previous
// manifest. writeFiles() below runs the same check again before it writes
// anything; bin/cli.js calls this copy earlier, so a doomed install (global
// config, path escape) never reaches a step that can run a real vendor status
// command as a side effect (Q1 safety: signInStatus can execute
// `claude auth status` etc. before writeFiles is ever called).
export function writePreflightProblems(files, { dir, project }) {
  const roots = { dir, project: project || dir };
  const groups = { dir: files.filter((f) => (f.root || 'dir') === 'dir'), project: files.filter((f) => f.root === 'project') };
  const problems = [];
  for (const k of ['dir', 'project']) {
    if (!groups[k].length) continue;
    problems.push(...preflight(groups[k], roots[k]).map((p) => (k === 'project' ? `[project] ${p}` : p)));
  }
  problems.push(...preflight([{ rel: '.backups/.gitignore' }], dir));
  return problems;
}
