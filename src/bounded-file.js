import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from 'node:fs';

export const MANIFEST_BYTE_CAP = 1024 * 1024;
const refused = message => Object.assign(new Error(message), { code: 'UNSAFE_FILE' });
// A path is printed to a terminal; control characters (escape sequences) are shown escaped.
const shown = path => String(path).replace(/[\u0000-\u001f\u007f-\u009f]/g, c => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);

// A fixed buffer also bounds files that grow after the initial size check.
export function readBounded(fd, maxBytes) {
  const stat = fstatSync(fd);
  if (!stat.isFile()) throw refused('expected a regular file');
  if (stat.size > maxBytes) throw refused(`file exceeds byte limit ${maxBytes}`);
  const buffer = Buffer.alloc(maxBytes + 1);
  let length = 0;
  while (length < buffer.length) {
    const count = readSync(fd, buffer, length, buffer.length - length, null);
    if (!count) break;
    length += count;
  }
  if (length > maxBytes) throw refused(`file exceeds byte limit ${maxBytes}`);
  return buffer.subarray(0, length);
}

export function readRegularFile(path, maxBytes) {
  const before = lstatSync(path);
  if (before.isSymbolicLink()) throw refused(`${shown(path)}: expected a regular file, not a symlink; replace the link with the file it points to, then run the command again`);
  if (!before.isFile()) throw refused(`${shown(path)}: expected a regular file; point the command at a file`);
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const after = fstatSync(fd);
    if (!after.isFile() || after.dev !== before.dev || after.ino !== before.ino) throw refused(`${shown(path)}: file changed during inspection; run the command again`);
    return readBounded(fd, maxBytes);
  } finally { closeSync(fd); }
}
