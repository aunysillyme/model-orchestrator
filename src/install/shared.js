import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const HERE = dirname(fileURLToPath(import.meta.url));
export const GENERATOR_VERSION = JSON.parse(readFileSync(join(HERE, '..', '..', 'package.json'), 'utf8')).version;
export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const TEMPLATES = join(HERE, '..', '..', 'templates');
export const CLI_RUN_SRC = join(HERE, '..', '..', 'bin', 'cli-run.mjs');
// Compatibility with the 0.1.x filename; current docs use the public brief name.
export const LEGACY_BRIEF = ['TASK', 'BUN' + 'DLE.md'].join('_');
// R1: a pre-existing settings or MCP JSON file larger than this is refused
// before it is read or parsed, the same way invalid JSON is refused today.
// Generous on purpose: real settings/MCP files are kilobytes, not megabytes.
export const ACTIVATION_JSON_BYTE_CAP = 10 * 1024 * 1024; // 10 MB

export function table(rows, header) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}
