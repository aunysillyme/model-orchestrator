import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { planFiles } from '../src/install.js';
import { byId } from '../src/catalog.js';

const isolatedNames = ['GATEWAY_MASTER_KEY', 'LITELLM_MASTER_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'XAI_API_KEY', 'OPENROUTER_API_KEY', 'KEY'];
const digest = value => createHash('sha256').update(value).digest('hex');
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const SKIP_VM_RUNTIME_ON_WINDOWS = process.platform === 'win32' && 'Ubuntu job watchdog requires POSIX process-tree semantics';

// Stub every vendor command and the worker. Only generated synthetic credentials
// are used, and the trace records booleans and names, never secret values.
function runAudit({ keySuffix = '', workerRc = 0, lane = 'codex' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'audit-security-'));
  const bin = join(root, 'stubs');
  const temp = join(root, 'temp');
  for (const name of [bin, temp, join(root, 'reports'), join(root, 'protocols'), join(root, 'codex'), join(root, 'hermes')]) mkdirSync(name);
  const token = randomBytes(24).toString('hex');
  const session = randomBytes(24).toString('hex');
  const trace = join(root, 'trace.jsonl');
  writeFileSync(trace, '');
  writeFileSync(join(root, 'protocols/gap-analysis.md'), '# Test protocol\n');
  writeFileSync(join(root, 'ORCHESTRATOR.md'), '# Test configuration\n');
  const report = join(root, 'reports', `audit-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(report, 'previous good report\n');
  // A different primary makes every supported worker eligible for review/bulk.
  const primary = byId[['codex', 'qwen'].includes(lane) ? 'claude-code' : 'codex'];
  const files = planFiles({ level: 3, selected: [primary, byId[lane]], primary, dir: root, project: root });
  const script = join(root, 'weekly-audit.sh');
  const generated = files.find(f => f.rel.split('\\').join('/') === 'vm/jobs/weekly-audit.sh').content;
  assert.ok(generated.includes(`AUDIT_LANE="${lane}"`), `generated job must select ${lane}`);
  writeFileSync(script, generated);
  const stub = join(root, 'stub.cjs');
  writeFileSync(stub, `
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const command = process.argv[2];
const args = process.argv.slice(3);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const event = {
  command,
  inherited: ${JSON.stringify(isolatedNames)}.filter(name => Object.hasOwn(process.env, name)),
  unrelatedInherited: Object.hasOwn(process.env, 'UNRELATED_SYNTHETIC_TOKEN'),
  sessionInherited: Object.hasOwn(process.env, 'CLAUDE_CODE_OAUTH_TOKEN'),
  workerHomes: ['CODEX_HOME', 'HERMES_HOME'].filter(name => Object.hasOwn(process.env, name)),
  workerHomePreserved: ['CODEX_HOME', 'HERMES_HOME'].every(name => !Object.hasOwn(process.env, name) ||
    (process.env[name] === path.join(${JSON.stringify(root)}, name.split('_')[0].toLowerCase()) &&
      fs.existsSync(path.join(process.env[name], 'stored-sign-in-fixture')))),
  homePreserved: process.env.HOME === ${JSON.stringify(root)},
  pathPreserved: process.env.PATH.includes(${JSON.stringify(bin)}),
  runtimePreserved: process.env.XDG_RUNTIME_DIR === ${JSON.stringify(join(root, 'runtime'))},
  busPreserved: process.env.DBUS_SESSION_BUS_ADDRESS === ${JSON.stringify('unix:path=' + join(root, 'runtime/bus'))},
  localePreserved: process.env.LANG === 'C' && process.env.LC_ALL === 'C',
  tempPreserved: process.env.TMPDIR === ${JSON.stringify(temp)},
  storedSignIn: fs.existsSync(path.join(process.env.HOME, 'stored-sign-in-fixture')),
  unexpectedArgv: args.some(arg => [${JSON.stringify(digest(token))}, ${JSON.stringify(digest(session))}].includes(hash(arg)))
};
if (command === 'curl') {
  const config = args[args.indexOf('--config') + 1];
  const input = fs.readFileSync(config === '-' ? 0 : config, 'utf8');
  const match = /^header = "Authorization: Bearer ([A-Za-z0-9._-]+)"\\n$/.exec(input);
  event.stdinConfig = config === '-';
  event.authorized = Boolean(match && hash(match[1]) === ${JSON.stringify(digest(token))});
  event.secretTempFiles = fs.readdirSync(process.env.TMPDIR).filter(name => name.startsWith('audit-curl-'));
  event.keyInArgv = args.some(arg => hash(arg) === ${JSON.stringify(digest(token))} || (match && arg.includes(match[1])));
}
fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify(event) + '\\n');
if (command === 'curl') {
  if (!event.authorized) process.exit(9);
  process.stdout.write('{"data":[{"id":"test-lane"}]}\\n');
} else if (command === 'jq') {
  const input = fs.readFileSync(0, 'utf8');
  try { process.stdout.write(JSON.parse(input).data.map(row => row.id).join('\\n') + '\\n'); }
  catch { process.exit(1); }
} else if (command === 'node') {
  process.stdout.write(${workerRc} ? 'partial failed report\\n' : 'fresh successful report\\n');
  process.exit(${workerRc});
} else process.stdout.write(command + ' fixture\\n');
`);
  for (const name of ['curl', 'jq', 'systemctl', 'node', 'claude', 'codex', 'agy', 'grok', 'hermes', 'qwen']) {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\nexec ${shellQuote(process.execPath.replaceAll('\\', '/'))} ${shellQuote(stub.replaceAll('\\', '/'))} '${name}' "$@"\n`, { mode: 0o755 });
  }
  writeFileSync(join(root, 'stored-sign-in-fixture'), 'sign-in state remains reachable through HOME\n');
  for (const name of ['codex', 'hermes']) writeFileSync(join(root, name, 'stored-sign-in-fixture'), 'sign-in state remains reachable through the selected override\n');
  try {
    const env = {
      PATH: bin + delimiter + process.env.PATH,
      HOME: root, USERPROFILE: root, TMPDIR: temp,
      XDG_RUNTIME_DIR: join(root, 'runtime'), DBUS_SESSION_BUS_ADDRESS: 'unix:path=' + join(root, 'runtime/bus'),
      LANG: 'C', LC_ALL: 'C', CODEX_HOME: join(root, 'codex'), HERMES_HOME: join(root, 'hermes'),
      CLAUDE_CODE_OAUTH_TOKEN: session, UNRELATED_SYNTHETIC_TOKEN: token, PROBE_SECS: '5'
    };
    for (const name of isolatedNames) env[name] = token;
    env.GATEWAY_MASTER_KEY = token + keySuffix;
    const result = spawnSync('bash', [script], { encoding: 'utf8', timeout: 20000, env });
    const events = readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const outputs = readdirSync(join(root, 'reports')).filter(name => name.endsWith('.md')).map(name => readFileSync(join(root, 'reports', name), 'utf8'));
    assert.ok(![result.stdout, result.stderr, ...outputs, readFileSync(trace, 'utf8'), ...readdirSync(temp).map(name => readFileSync(join(temp, name), 'utf8'))].some(value => [token, session].some(secret => value?.includes(secret))), 'synthetic credential reached output or a temporary file');
    return {
      ...result, events,
      report: readFileSync(report, 'utf8'),
      live: existsSync(join(root, 'reports/live-state.md')) ? readFileSync(join(root, 'reports/live-state.md'), 'utf8') : '',
      failed: readdirSync(join(root, 'reports')).filter(name => name.startsWith('failed-audit-'))
    };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('weekly audit delivers gateway auth on stdin without a credential temp file', { skip: SKIP_VM_RUNTIME_ON_WINDOWS }, () => {
  const result = runAudit();
  assert.equal(result.status, 0, result.stderr);
  const probe = result.events.find(event => event.command === 'curl');
  assert.ok(probe, 'gateway probe did not run');
  assert.deepEqual(probe.secretTempFiles, []);
  assert.equal(probe.stdinConfig, true);
  assert.equal(probe.authorized, true, 'background watchdog lost the config pipe');
  assert.equal(probe.keyInArgv, false);
  assert.match(result.live, /test-lane/);
  assert.doesNotMatch(result.live, /gateway unreachable/);
  assert.equal(result.report, 'fresh successful report\n');
});

test('weekly audit isolates unrelated exports in collection and worker while preserving selected sign-in paths', { skip: SKIP_VM_RUNTIME_ON_WINDOWS }, () => {
  for (const lane of ['codex', 'agy', 'grok', 'hermes', 'qwen']) {
    const result = runAudit({ lane });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.events.filter(event => event.unrelatedInherited).map(event => event.command).sort(), [], 'unrelatedInherited: true in collection/worker');
    for (const command of ['curl', 'jq', 'systemctl', 'claude', 'codex', 'agy', 'grok', 'hermes', 'qwen', 'node']) {
      const event = result.events.find(row => row.command === command);
      assert.ok(event, `${lane}: ${command} was not exercised`);
      assert.deepEqual(event.inherited, [], `${command} inherited a gateway credential`);
      assert.equal(event.unrelatedInherited, false, `${command}: unrelatedInherited: true`);
      assert.equal(event.sessionInherited, false, `${command} inherited another vendor's session`);
      assert.deepEqual(event.workerHomes, command === 'node' && ['codex', 'hermes'].includes(lane) ? [lane.toUpperCase() + '_HOME'] : [], `${lane}: ${command} inherited a different worker's override`);
      for (const property of ['homePreserved', 'pathPreserved', 'runtimePreserved', 'busPreserved', 'localePreserved', 'tempPreserved', 'storedSignIn', 'workerHomePreserved']) {
        assert.equal(event[property], true, `${lane}: ${command} lost ${property}`);
      }
      assert.equal(event.unexpectedArgv, false, `${command} received a credential argument`);
    }
  }
});

test('weekly audit rejects embedded and trailing newlines before any child runs', { skip: SKIP_VM_RUNTIME_ON_WINDOWS }, () => {
  for (const keySuffix of ['\n', '\n' + randomBytes(8).toString('hex'), '\r\n']) {
    const result = runAudit({ keySuffix });
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /must match/);
    assert.deepEqual(result.events, []);
    assert.equal(result.report, 'previous good report\n');
  }
});

test('weekly audit preserves the previous report and worker exit code on failure', { skip: SKIP_VM_RUNTIME_ON_WINDOWS }, () => {
  const result = runAudit({ workerRc: 13 });
  assert.equal(result.status, 13, result.stderr);
  assert.equal(result.report, 'previous good report\n');
  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0], /-rc13\.md$/);
});

test('weekly audit service uses its own credential file separate from gateway providers', () => {
  const files = planFiles({ level: 3, selected: [byId.codex], primary: byId.codex, dir: '/tmp/test-audit', project: '/tmp/test-audit' });
  const service = files.find(f => f.rel.split('\\').join('/') === 'vm/jobs/weekly-audit.service').content;
  assert.match(service, /^EnvironmentFile=%h\/\.config\/ai-orchestrator\/weekly-audit\.env$/m);
  assert.doesNotMatch(service, /^EnvironmentFile=.*\/gateway\.env$/m);
});
