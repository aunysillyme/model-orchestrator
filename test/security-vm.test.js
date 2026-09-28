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
const SKIP_VM_RUNTIME_ON_WINDOWS = process.platform === 'win32' && 'Ubuntu job watchdog requires POSIX process-tree semantics';

// Stub every vendor command and the worker. Only generated synthetic credentials
// are used, and the trace records booleans and names, never secret values.
function runAudit({ keySuffix = '', workerRc = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'audit-security-'));
  const bin = join(root, 'stubs');
  const temp = join(root, 'temp');
  for (const name of [bin, temp, join(root, 'reports'), join(root, 'protocols')]) mkdirSync(name);
  const token = randomBytes(24).toString('hex');
  const session = randomBytes(24).toString('hex');
  const trace = join(root, 'trace.jsonl');
  writeFileSync(trace, '');
  writeFileSync(join(root, 'protocols/gap-analysis.md'), '# Test protocol\n');
  writeFileSync(join(root, 'ORCHESTRATOR.md'), '# Test configuration\n');
  const report = join(root, 'reports', `audit-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(report, 'previous good report\n');
  const files = planFiles({ level: 3, selected: [byId.codex], primary: byId.codex, dir: root, project: root });
  const script = join(root, 'weekly-audit.sh');
  writeFileSync(script, files.find(f => f.rel.split('\\').join('/') === 'vm/jobs/weekly-audit.sh').content);
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
  sessionPreserved: hash(process.env.CLAUDE_CODE_OAUTH_TOKEN || '') === process.env.VM_TEST_SESSION_HASH,
  homePreserved: process.env.HOME === process.env.VM_TEST_HOME,
  pathPreserved: process.env.PATH.includes(process.env.VM_TEST_BIN)
};
if (command === 'curl') {
  const config = args[args.indexOf('--config') + 1];
  const input = fs.readFileSync(config === '-' ? 0 : config, 'utf8');
  const match = /^header = "Authorization: Bearer ([A-Za-z0-9._-]+)"\\n$/.exec(input);
  event.stdinConfig = config === '-';
  event.authorized = Boolean(match && hash(match[1]) === process.env.VM_TEST_KEY_HASH);
  event.secretTempFiles = fs.readdirSync(process.env.TMPDIR).filter(name => name.startsWith('audit-curl-'));
  event.keyInArgv = args.some(arg => hash(arg) === process.env.VM_TEST_KEY_HASH || (match && arg.includes(match[1])));
}
fs.appendFileSync(process.env.VM_TEST_TRACE, JSON.stringify(event) + '\\n');
if (command === 'curl') {
  if (!event.authorized) process.exit(9);
  process.stdout.write('{"data":[{"id":"test-lane"}]}\\n');
} else if (command === 'jq') {
  const input = fs.readFileSync(0, 'utf8');
  try { process.stdout.write(JSON.parse(input).data.map(row => row.id).join('\\n') + '\\n'); }
  catch { process.exit(1); }
} else if (command === 'node') {
  process.stdout.write(Number(process.env.VM_TEST_WORKER_RC) ? 'partial failed report\\n' : 'fresh successful report\\n');
  process.exit(Number(process.env.VM_TEST_WORKER_RC));
} else process.stdout.write(command + ' fixture\\n');
`);
  for (const name of ['curl', 'jq', 'systemctl', 'node', 'claude', 'codex', 'agy', 'grok', 'hermes', 'qwen']) {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\nexec "$VM_TEST_NODE" "$VM_TEST_STUB" '${name}' "$@"\n`, { mode: 0o755 });
  }
  try {
    const env = {
      ...process.env, PATH: bin + delimiter + process.env.PATH,
      HOME: root, USERPROFILE: root, TMPDIR: temp,
      VM_TEST_NODE: process.execPath.replaceAll('\\', '/'), VM_TEST_STUB: stub.replaceAll('\\', '/'),
      VM_TEST_TRACE: trace, VM_TEST_KEY_HASH: digest(token), VM_TEST_SESSION_HASH: digest(session),
      VM_TEST_HOME: root, VM_TEST_BIN: bin, VM_TEST_WORKER_RC: String(workerRc),
      CLAUDE_CODE_OAUTH_TOKEN: session, PROBE_SECS: '5'
    };
    for (const name of isolatedNames) env[name] = token;
    env.GATEWAY_MASTER_KEY = token + keySuffix;
    const result = spawnSync('bash', [script], { encoding: 'utf8', timeout: 20000, env });
    const events = readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
    const outputs = readdirSync(join(root, 'reports')).filter(name => name.endsWith('.md')).map(name => readFileSync(join(root, 'reports', name), 'utf8'));
    assert.ok(![result.stdout, result.stderr, ...outputs, readFileSync(trace, 'utf8')].some(value => value?.includes(token)), 'synthetic credential reached output');
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

test('weekly audit isolates gateway/provider variables while preserving vendor sign-ins', { skip: SKIP_VM_RUNTIME_ON_WINDOWS }, () => {
  const result = runAudit();
  assert.equal(result.status, 0, result.stderr);
  for (const command of ['curl', 'jq', 'systemctl', 'claude', 'codex', 'agy', 'grok', 'hermes', 'qwen', 'node']) {
    const event = result.events.find(row => row.command === command);
    assert.ok(event, `${command} was not exercised`);
    assert.deepEqual(event.inherited, [], `${command} inherited a gateway credential`);
    assert.equal(event.sessionPreserved, true, `${command} lost the vendor session`);
    assert.equal(event.homePreserved, true, `${command} lost HOME`);
    assert.equal(event.pathPreserved, true, `${command} lost PATH`);
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
