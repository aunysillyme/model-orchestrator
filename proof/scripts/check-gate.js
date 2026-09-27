import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clean, entry, isMain, ROOT, run, scratch } from './lib.js';

export function measureGate() {
  const dir = scratch();
  try {
    const file = join(dir, 'checks.json');
    const fixtures = [
      { id: 'nonzero', command: ['node', '-e', 'process.exit(7)'] },
      { id: 'manual', manual: true },
      { id: 'missing', command: ['model-orchestrator-missing-fixture-program'] },
      { id: 'timeout', timeoutMs: 50, command: ['node', '-e', 'setInterval(() => {}, 1000)'] }
    ];
    const outcomes = fixtures.map(check => {
      writeFileSync(file, JSON.stringify({ version: 1, checks: [check] }));
      return { fixture: check.id, exitCode: run([join(ROOT, 'bin', 'aunx.js'), 'checks', 'run', file]).status };
    });
    writeFileSync(file, JSON.stringify({ version: 1, checks: [{ id: 'positive', command: ['node', '-e', 'process.exit(0)'] }] }));
    if (run([join(ROOT, 'bin', 'aunx.js'), 'checks', 'run', file]).status !== 0) throw new Error('Positive acceptance check control failed');
    const caught = outcomes.filter(o => o.exitCode === 1).length;
    if (caught !== outcomes.length) throw new Error('A failing acceptance fixture escaped the gate');
    return entry('acceptance-failures-blocked', 'Acceptance failures blocked', caught, 'fixtures rejected', outcomes.length, 'Run aunx checks run against nonzero, manual, missing-program and timeout fixtures. Each must exit 1; a passing command must exit 0. This is a local command gate, activated by the user in their release sequence.', 'check-gate.js', { outcomes });
  } finally { clean(dir); }
}
if (isMain(import.meta.url)) console.log(JSON.stringify(measureGate(), null, 2));
