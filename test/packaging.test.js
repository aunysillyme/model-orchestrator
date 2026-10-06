import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('npm excludes the source-only skill pack generator', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(pkg.files.includes('!src/agensi.js'));
});

test('skill pack packaging checks zip before generating and gives an install hint', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/pack-agensi.js', import.meta.url))], {
    env: {...process.env, PATH: '', Path: ''}, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /zip is required.*install/i);
  assert.doesNotMatch(result.stderr, /ENOENT/);
  assert.doesNotMatch(result.stdout, /regenerated/);
});
