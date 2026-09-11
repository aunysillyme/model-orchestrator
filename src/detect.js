import { accessSync, statSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';

// On win32, a PATH entry never holds a bare "grok": npm and vendor installers
// drop "grok.cmd" (or .exe/.bat/.ps1), the same way any Windows shell resolves
// a bare command through %PATHEXT%. Trying the bare name first keeps this a
// no-op on POSIX and matches an already-extensioned name (a .exe someone put
// on PATH directly) on Windows too.
// platform is a parameter (default process.platform), not a hardcoded read,
// so the win32 branch has a test on every OS this suite runs on: the same
// pattern bin/cli-run.mjs's killTree(pid, platform, deps) already uses.
export function candidateExtensions(platform = process.platform, pathext = process.env.PATHEXT) {
  if (platform !== 'win32') return [''];
  return ['', ...(pathext || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)];
}

// PATH lookup plus the handful of places vendor installers drop binaries
// without touching PATH. Never a shell function, never a shell out.
// A directory with the binary's name is not a binary (X_OK passes on
// searchable directories), so the candidate must be a regular file.
// home is a parameter too (default homedir()), for the same reason platform
// is: a dev machine with a real ~/.local/bin/grok on it made the win32 tests
// here false-negative until this was injectable, since PATH alone was never
// the whole search.
export function which(bin, platform = process.platform, home = homedir()) {
  if (!bin) return null;
  const searchPath = process.env['PATH'] || '';
  const dirs = searchPath.split(delimiter).filter(Boolean);
  dirs.push(join(home, '.local', 'bin'), join(home, '.grok', 'bin'), join(home, '.npm-global', 'bin'));
  const exts = candidateExtensions(platform);
  for (const d of dirs) {
    for (const ext of exts) {
      const p = join(d, bin + ext);
      try {
        if (!statSync(p).isFile()) continue;
        accessSync(p, constants.X_OK);
        return p;
      } catch {
        /* keep looking */
      }
    }
  }
  return null;
}
