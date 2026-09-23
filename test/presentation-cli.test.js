import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AIS, npmSpec } from '../src/catalog.js';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

test('dry plan counts subagents and hooks separately for each primary', () => {
  for (const primary of ['claude-code', 'agy', 'codex']) {
    const result = run(['--yes', '--level', '2', '--ais', primary, '--primary', primary, '--dry']);
    assert.equal(result.status, 0, result.stderr);
    const paths = [...result.stdout.matchAll(/^  - \[project\] (.+)$/gm)].map((match) => match[1].replaceAll('\\', '/'));
    const agents = paths.filter((path) => path.includes('/agents/')).length;
    const hooks = paths.filter((path) => path.includes('/hooks/')).length;
    const summary = [[agents, 'subagents'], [hooks, 'hooks']].filter(([count]) => count).map(([count, kind]) => `${count} ${kind}`).join(' + ');
    const projectLine = result.stdout.split('\n').find((line) => line.startsWith('  project  '));
    if (paths.length) {
      assert.ok(projectLine.endsWith(` (${summary} go here)`), `${primary}: ${projectLine}`);
      assert.ok(result.stdout.includes(`the ${summary} go to the current directory`), `${primary}: default project note should report the same kinds`);
    } else {
      assert.doesNotMatch(projectLine, /go here/);
    }
  }
});

test('--list prints each AI install instruction and sign-in note from the catalog', () => {
  const result = run(['--list']);
  assert.equal(result.status, 0, result.stderr);
  for (let i = 0; i < AIS.length; i++) {
    const ai = AIS[i];
    const start = result.stdout.indexOf(`${ai.id.padEnd(13)} ${ai.name}\n`);
    assert.ok(start >= 0, `${ai.id}: catalog entry is present`);
    const end = i + 1 < AIS.length ? result.stdout.indexOf(`${AIS[i + 1].id.padEnd(13)} `, start) : result.stdout.indexOf('\nmetered API providers', start);
    const block = result.stdout.slice(start, end);
    const install = ai.install.npm
      ? `npm install -g ${npmSpec(ai)}`
      : ai.install.script
        ? `curl -fsSL ${ai.install.script} -o /tmp/${ai.id}-install.sh && less /tmp/${ai.id}-install.sh && bash /tmp/${ai.id}-install.sh`
        : ai.install.url + (ai.install.brew ? ` (or: brew install ${ai.install.brew})` : '');
    assert.ok(block.includes(`install: ${install}`), `${ai.id}: missing install instruction`);
    assert.ok(block.includes(`sign in: ${ai.auth}`), `${ai.id}: missing sign-in note`);
  }
});
