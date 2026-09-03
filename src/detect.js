import { accessSync, statSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { homedir } from 'node:os';

// PATH lookup plus the handful of places vendor installers drop binaries
// without touching PATH. Never a shell function, never a shell out.
// A directory with the binary's name is not a binary (X_OK passes on
// searchable directories), so the candidate must be a regular file.
export function which(bin) {
  if (!bin) return null;
  const home = homedir();
  const searchPath = process.env['PATH'] || '';
  const dirs = searchPath.split(delimiter).filter(Boolean);
  dirs.push(join(home, '.local', 'bin'), join(home, '.grok', 'bin'), join(home, '.npm-global', 'bin'));
  for (const d of dirs) {
    const p = join(d, bin);
    try {
      if (!statSync(p).isFile()) continue;
      accessSync(p, constants.X_OK);
      return p;
    } catch {
      /* keep looking */
    }
  }
  return null;
}
