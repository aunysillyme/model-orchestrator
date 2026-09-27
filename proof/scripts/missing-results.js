import { join } from 'node:path';
import { clean, entry, fixtureEnv, isMain, ROOT, run, scratch, stubLane } from './lib.js';

export function measureMissingResults() {
  const dir = scratch();
  try {
    const shapes = {
      grok: JSON.stringify({ stopReason: 'end_turn', text: '' }),
      codex: JSON.stringify({ type: 'turn.completed' }),
      agy: JSON.stringify({ event: 'result', result: { status: 'SUCCESS', response: '' } }),
      hermes: '   ',
      qwen: JSON.stringify([{ type: 'result', subtype: 'success', result: '' }])
    };
    const outcomes = [];
    for (const [lane, shape] of Object.entries(shapes)) {
      for (const [fixture, text] of [['empty-stdout', ''], ['empty-final-result', shape]]) {
        stubLane(dir, lane, `process.stdout.write(${JSON.stringify(text)});`);
        const result = run([join(ROOT, 'bin', 'cli-run.mjs'), lane, 'fixture', '--quiet'], { env: fixtureEnv(dir) });
        outcomes.push({ lane, fixture, exitCode: result.status });
      }
    }
    // A success control makes a wrapper that rejects everything fail this measurement.
    stubLane(dir, 'hermes', 'console.log("fixture result");');
    if (run([join(ROOT, 'bin', 'cli-run.mjs'), 'hermes', 'control', '--quiet'], { env: fixtureEnv(dir) }).status !== 0) throw new Error('Positive runner control failed');
    const caught = outcomes.filter(o => o.exitCode === 10 || o.exitCode === 11).length;
    if (caught !== outcomes.length) throw new Error('An empty-result fixture escaped the expected failure class');
    return entry('missing-results-caught', 'Empty results flagged', caught, 'fixtures rejected', outcomes.length, 'Run cli-run against an exit-0 stub for every supported lane, once with empty stdout and once with an empty native final result. Count exit 10/11 only. A successful Hermes response is the positive control. Synthetic fixtures measure these shapes only.', 'missing-results.js', { outcomes });
  } finally { clean(dir); }
}
if (isMain(import.meta.url)) console.log(JSON.stringify(measureMissingResults(), null, 2));
