import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const installSpawn = /['"]install['"]\s*,\s*['"]-g['"]|spawnSync\([^)]*install/;
const installOffer = /npm install -g \$\{/;
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]);
}
for (const [label, pattern] of [['spawn', installSpawn], ['offer', installOffer]]) {
  test(`installer has no third-party install ${label}`, () => {
    const hits = [...files('bin'), ...files('src')].filter(p => pattern.test(readFileSync(p, 'utf8')));
    assert.deepEqual(hits, []);
  });
}
test('third-party install guards reject both historical paths', () => {
  assert.ok(installSpawn.test("const plan = windowsSpawnPlan([which('npm') || 'npm', 'install', '-g', spec], process.platform, { allowCmdFallback: true });"));
  assert.ok(installOffer.test('const run = flag(\'no-install\') || yes ? \'n\' : await ask(`  ${a.name}: run \\`npm install -g ${spec}\\` now? [y/N]: `, \'n\');'));
});
