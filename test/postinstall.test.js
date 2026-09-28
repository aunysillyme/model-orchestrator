import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { signInStatus } from '../src/postinstall.js';
import { byId } from '../src/catalog.js';
import { activationSteps } from '../src/install.js';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'mo-postinstall-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const dir = join(root, 'ai');
  const bin = join(root, 'stubs');
  mkdirSync(bin);
  // Keep the fixture's unknown Claude sign-in state independent of the host account.
  if (process.platform === 'win32') writeFileSync(join(bin, 'claude.cmd'), '@ECHO off\r\nexit /b 99\r\n');
  else writeFileSync(join(bin, 'claude'), '#!' + process.execPath + '\nprocess.exit(99);\n', { mode: 0o755 });
  const calls = join(root, 'calls.jsonl');
  const script = `import { appendFileSync } from 'node:fs';\nappendFileSync(${JSON.stringify(calls)}, JSON.stringify(process.argv.slice(2))+'\\n');\nif (process.argv.slice(2).join(' ') === 'login status') { console.log('Logged in using ChatGPT'); process.exit(0); }\nprocess.exit(99);\n`;
  writeFileSync(join(bin, 'codex.mjs'), script);
  if (process.platform === 'win32') writeFileSync(join(bin, 'codex.cmd'), '@ECHO off\r\n"%_prog%" "%dp0%\\codex.mjs" %*\r\n');
  else writeFileSync(join(bin, 'codex'), '#!' + process.execPath + '\n// CommonJS on purpose: Node 18 runs an extensionless file as CommonJS.\nimport(require(\'node:url\').pathToFileURL(require(\'node:path\').join(__dirname, \'codex.mjs\')).href);\n', { mode: 0o755 });
  const run = (args = [], input = 'y\n') => spawnSync(process.execPath, ['bin/cli.js', '--ais', 'claude-code,codex', '--primary', 'claude-code', '--dir', dir, '--project', root, ...args], {
    encoding: 'utf8', input, timeout: 15000, env: { ...process.env, PATH: bin + delimiter + process.env.PATH }
  });
  return { root, dir, calls, run };
}

test('postinstall P1: one scripted confirmation applies rules and hooks and previews both targets', (t) => {
  const f = fixture(t);
  const r = f.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(readFileSync(join(f.root, 'CLAUDE.md'), 'utf8'), /<!-- model-orchestrator:start -->/);
  assert.match(readFileSync(join(f.root, '.claude/settings.json'), 'utf8'), /route-gate/);
  const preview = r.stdout.split('[Y/n/e]')[0];
  // Q8: a fresh CLAUDE.md (this fixture's project has none yet) is created,
  // not updated, and there is nothing to back up.
  assert.match(preview, /create .*CLAUDE\.md.*new file, marked block/);
  assert.match(preview, /merge hooks into .*settings\.json.*backup/);
  assert.equal(r.stdout.split('[Y/n/e]').length - 1, 1);
});

test('postinstall P2: --yes keeps rules and settings untouched without --apply-snippets', (t) => {
  const f = fixture(t);
  writeFileSync(join(f.root, 'CLAUDE.md'), 'keep rules\n');
  mkdirSync(join(f.root, '.claude'));
  writeFileSync(join(f.root, '.claude/settings.json'), '{"keep":true}\n');
  const r = f.run(['--yes', '--level', '2'], '');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(readFileSync(join(f.root, 'CLAUDE.md'), 'utf8'), 'keep rules\n');
  assert.equal(readFileSync(join(f.root, '.claude/settings.json'), 'utf8'), '{"keep":true}\n');
  assert.doesNotMatch(r.stdout, /\[Y\/n\/e\]/);
});

test('postinstall P3: health check runs automatically and never sends a canary', (t) => {
  const f = fixture(t);
  const r = f.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Health check.*doctor/i);
  assert.doesNotMatch(r.stdout, /smoke test: node/);
  assert.deepEqual(readFileSync(f.calls, 'utf8').trim().split('\n').map(JSON.parse), [['login', 'status']]);
});

test('postinstall P4: remaining steps omit information, applied work and confirmed sign-ins', (t) => {
  const f = fixture(t);
  const r = f.run();
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /What's left for you/);
  const steps = r.stdout.split("What's left for you")[1];
  assert.doesNotMatch(steps, /copy the block|merge the hooks|subagents are in|smoke test|sign in to Codex|codex login/);
  assert.match(steps, /if you have not signed in yet:.*claude/);
});

test('postinstall: --no-apply preserves CLAUDE.md and the edit screen can turn activation off', (t) => {
  for (const mode of ['flag', 'edit']) {
    const f = fixture(t);
    writeFileSync(join(f.root, 'CLAUDE.md'), 'keep\n');
    const r = f.run(mode === 'flag' ? ['--no-apply'] : [], mode === 'edit' ? 'e\n8\ny\n' : 'y\n');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(readFileSync(join(f.root, 'CLAUDE.md'), 'utf8'), 'keep\n');
    assert.equal(existsSync(join(f.root, '.claude/settings.json')), false);
  }
});

test('postinstall: dry-run and EOF write nothing and do not run status commands', (t) => {
  for (const args of [[], ['--dry'], ['--dry-run']]) {
    const f = fixture(t);
    const r = f.run(args, '');
    assert.equal(r.status, args.length ? 0 : 2, r.stdout + r.stderr);
    assert.equal(existsSync(f.dir), false);
    assert.equal(existsSync(join(f.root, 'CLAUDE.md')), false);
    assert.equal(existsSync(f.calls), false);
  }
});

test('postinstall: chat main keeps exactly one paste step and level 1 gets a health result', (t) => {
  const f = fixture(t);
  const r = spawnSync(process.execPath, ['bin/cli.js', '--ais', 'chatgpt-app', '--dir', f.dir, '--project', f.root], { encoding: 'utf8', input: 'y\n', timeout: 15000 });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Health check/i);
  assert.equal((r.stdout.match(/paste the block/g) || []).length, 1);
  assert.match(r.stdout, /What's left for you/);
});

test('postinstall: only reliable status commands run and their account output stays private', () => {
  const calls = [];
  const selected = ['claude-code', 'codex', 'grok', 'agy', 'qwen'].map(id => byId[id]);
  const statuses = signInStatus(selected, {
    detect: bin => '/fake/' + bin,
    spawn: (command, args, options) => {
      calls.push({ command, args, options });
      // Q1: claude-code is now also reliable, but positive-only, so its stub
      // reply is JSON with the sign-in field, same as the real CLI's shape.
      if (args[0] === 'auth') return { status: 0, stdout: JSON.stringify({ loggedIn: true, account: 'secret@example.com' }), stderr: '' };
      return { status: 0, stdout: 'Logged in using ChatGPT: account details', stderr: '' };
    }
  });
  assert.deepEqual(statuses, { 'claude-code': true, codex: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.args), [['auth', 'status'], ['login', 'status']]);
  for (const call of calls) {
    assert.equal(call.options.shell, false);
    assert.equal(call.options.timeout, 2000);
  }
  assert.ok(!JSON.stringify(statuses).includes('account') && !JSON.stringify(statuses).includes('secret'));
});

test('postinstall: missing or signed-out Codex gets login, failed status remains conditional', () => {
  for (const [result, expected] of [[{ status: 1 }, false], [{ status: 2 }, null], [{ status: null, error: new Error('timeout') }, null]]) {
    const authStatuses = signInStatus([byId.codex], { detect: () => '/fake/codex', spawn: () => result });
    assert.equal(authStatuses.codex, expected);
    const steps = activationSteps({ selected: [byId.codex], primary: byId.codex, applySnippets: true, authStatuses });
    assert.equal(steps.length, 1);
    assert.match(steps[0], expected === false ? /^sign in to/ : /if you have not signed in yet/);
  }
  assert.deepEqual(signInStatus([byId.codex], { detect: () => null, spawn: () => assert.fail('missing CLI must not run') }), { codex: false });
  assert.deepEqual(activationSteps({ selected: [byId.codex], primary: byId.codex, applySnippets: true, authStatuses: { codex: true } }), []);
});

test('postinstall: conflicting activation flags refuse without writing', (t) => {
  const f = fixture(t);
  const r = f.run(['--no-apply', '--apply-snippets']);
  assert.equal(r.status, 2);
  assert.equal(existsSync(f.dir), false);
  assert.equal(existsSync(f.calls), false);
});

test('postinstall: conditional sign-ins name an actionable command for every unprobed CLI', () => {
  for (const id of ['claude-code', 'agy', 'grok', 'hermes', 'qwen']) {
    const ai = byId[id];
    const steps = activationSteps({ selected: [ai], primary: ai, applySnippets: true });
    const step = steps.find(line => line.includes('if you have not signed in yet:'));
    assert.ok(step.includes('`' + ai.bin), id + ': conditional sign-in must name the executable');
    if (id === 'qwen') assert.match(step, /`\/auth`/);
  }
});
