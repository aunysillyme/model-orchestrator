import { join } from 'node:path';
import { clean, entry, fixtureEnv, isMain, median, ROOT, run, scratch, timed } from './lib.js';

export function measureInstall() {
  const dir = scratch();
  try {
    const samples = [];
    for (let i = 0; i < 7; i++) {
      const { result, ms } = timed(() => run([join(ROOT, 'bin', 'cli.js'), '--yes', '--level', '2', '--ais', 'claude-code,codex', '--primary', 'claude-code', '--dir', join(dir, 'rules'), '--project', dir, '--dry'], { env: fixtureEnv(dir) }));
      if (result.status !== 0) throw new Error(`Dry install failed: ${result.stderr}`);
      samples.push(ms);
    }
    return entry('install-dry-ms', 'Dry install wall time', median(samples), 'ms median', samples.length, 'Spawn a fresh Node installer process per sample; level 2, Claude Code + Codex, no companions, --dry. Includes Node startup and planning; writes no install files. Isolated home and PATH, no real vendors.', 'install-time.js', { samples });
  } finally { clean(dir); }
}
if (isMain(import.meta.url)) console.log(JSON.stringify(measureInstall(), null, 2));
