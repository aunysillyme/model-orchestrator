import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { which } from './detect.js';
import { doctor, windowsSpawnPlan } from '../bin/cli-run.mjs';

// Only catalogued, reliable read-only status commands may run. Vendor output
// can contain account details, so return a verdict without printing it.
export function signInStatus(selected, { detect = which, spawn = spawnSync, platform = process.platform } = {}) {
  const statuses = {};
  for (const ai of selected) {
    const status = ai.authStatus;
    if (!ai.bin || !status?.reliable) continue;
    const bin = detect(ai.bin);
    if (!bin) { statuses[ai.id] = false; continue; }
    try {
      const plan = windowsSpawnPlan([bin, ...status.args], platform);
      if (plan.refuse) { statuses[ai.id] = null; continue; }
      const result = spawn(plan.command, plan.args, {
        ...plan.options, shell: false, encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'], timeout: 2000, maxBuffer: 8192, windowsHide: true
      });
      statuses[ai.id] = result.error || result.signal || result.status === null ? null
        : result.status === 0 ? true : result.status === 1 ? false : null;
    } catch { statuses[ai.id] = null; }
  }
  return statuses;
}

export async function installHealthCheck({ level, selected, primary, dir }) {
  console.log('\nHealth check (doctor, binary presence only):');
  // Use this package's implementation, never execute a retained or user-edited
  // runner in the target directory. Only its data configuration is read.
  const rc = await doctor(false, {
    here: join(dir, 'bin'), primary: primary?.id, compact: true,
    ...(level < 2 ? { config: { enabled: selected.filter(ai => ai.facts.cliRun).map(ai => ai.id), defaults: {} } } : {})
  });
  if (rc && rc !== 10 && rc !== 13) console.log(`  doctor could not read the installed lane configuration (exit ${rc}).`);
  return rc;
}
