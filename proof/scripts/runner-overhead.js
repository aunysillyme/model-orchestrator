import { join } from 'node:path';
import { clean, entry, fixtureEnv, isMain, median, ROOT, run, scratch, stubLane, timed } from './lib.js';

export function measureRunner() {
  const dir = scratch();
  try {
    const stub = stubLane(dir, 'hermes', 'console.log("fixture result");');
    const env = fixtureEnv(dir);
    const pairs = [];
    for (let i = 0; i < 7; i++) {
      const direct = () => timed(() => run([stub], { env }));
      const wrapped = () => timed(() => run([join(ROOT, 'bin', 'cli-run.mjs'), 'hermes', 'fixture', '--quiet'], { env }));
      let before, after;
      if (i % 2) { after = wrapped(); before = direct(); } else { before = direct(); after = wrapped(); }
      if (before.result.status !== 0 || after.result.status !== 0) throw new Error('Stub runner measurement failed');
      pairs.push({ directMs: before.ms, wrappedMs: after.ms, overheadMs: after.ms - before.ms });
    }
    return entry('runner-overhead-ms', 'Lane runner overhead', median(pairs.map(p => p.overheadMs)), 'ms median difference', pairs.length, 'Paired fresh processes: direct Node stub versus cli-run hermes with the same stub. Alternates pair order. Includes wrapper startup, validation and local log writes; excludes vendor/network/model time.', 'runner-overhead.js', { pairs });
  } finally { clean(dir); }
}
if (isMain(import.meta.url)) console.log(JSON.stringify(measureRunner(), null, 2));
