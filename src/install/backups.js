import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync, statSync, unlinkSync, openSync, closeSync, renameSync, linkSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { realRoot, preflight } from './paths.js';

// Replace a file without writing through any existing hard link. New targets
// publish exclusively so a file created during installation is not overwritten.
export function atomicWriteFile(path, content, mode, exists = existsSync(path)) {
  const temporary = join(dirname(path), '.' + randomUUID() + '.tmp');
  let fd;
  let created = false;
  try {
    fd = openSync(temporary, 'wx', mode);
    created = true;
    writeFileSync(fd, content);
    closeSync(fd);
    fd = undefined;
    chmodSync(temporary, mode);
    if (exists) renameSync(temporary, path);
    else linkSync(temporary, path);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (created) {
      try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
}

export const backupStamp = (stamp) => new Date(stamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

export function backupPath(dir, path) {
  let stamp = Date.now();
  let backup;
  do {
    backup = join(realRoot(dir).root, '.backups', basename(path) + '.bak-' + backupStamp(stamp));
    stamp += 1000;
  } while (existsSync(backup));
  return backup;
}

export function ensureBackupDirectory(dir) {
  const problems = preflight([{ rel: '.backups/.gitignore' }], dir);
  if (problems.length) throw Object.assign(new Error(problems.join('; ')), { code: 'PREFLIGHT' });
  const folder = join(realRoot(dir).root, '.backups');
  mkdirSync(folder, { recursive: true });
  const ignore = join(folder, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n', { flag: 'wx', mode: 0o644 });
  else {
    const current = readFileSync(ignore, 'utf8');
    if (!current.split(/\r?\n/).includes('*')) atomicWriteFile(ignore, current + (current.endsWith('\n') ? '' : '\n') + '*\n', statSync(ignore).mode & 0o777);
  }
}
