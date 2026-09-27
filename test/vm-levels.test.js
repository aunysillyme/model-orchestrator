import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';
import { planFiles } from '../src/install.js';
import { byId } from '../src/catalog.js';

const selected = ['codex', 'ollama'].map(id => byId[id]);
const filesFor = (ids = selected) => planFiles({ level: 3, selected: ids, primary: byId.codex, dir: '/tmp/space in rules', project: '/tmp/space in project' });
const content = (files, rel) => files.find(f => f.rel.split('\\').join('/') === rel).content;

function runSetup(env = {}, ids = selected) {
  const root = mkdtempSync(join(tmpdir(), 'vm-levels-'));
  const vm = join(root, 'vm with spaces');
  const bin = join(root, 'bin');
  mkdirSync(vm); mkdirSync(bin);
  const script = join(vm, 'setup-vm.sh');
  const trace = join(root, 'trace');
  writeFileSync(trace, '');
  writeFileSync(script, content(filesFor(ids), 'vm/setup-vm.sh'));
  const stub = (name, source) => writeFileSync(join(bin, name), source, { mode: 0o755 });
  stub('sudo', '#!/usr/bin/env bash\nprintf "unexpected system install\\n" >> "$VM_TEST_TRACE"\nexit 90\n');
  stub('docker', `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$VM_TEST_TRACE"
case "$*" in
  'compose up -d') exit "\${VM_TEST_START_RC:-0}" ;;
  'compose exec -T ollama ollama list') exit 0 ;;
  'compose exec -T ollama ollama pull '*) exit "\${VM_TEST_PULL_RC:-0}" ;;
  *) exit 91 ;;
esac
`);
  stub('sleep', '#!/usr/bin/env bash\nexit 0\n');
  stub('curl', `#!/usr/bin/env bash
printf 'curl %s\\n' "$*" >> "$VM_TEST_TRACE"
IFS= read -r auth
[ "$auth" = "header = \\\"Authorization: Bearer $GATEWAY_MASTER_KEY\\\"" ] || exit 92
if [ "\${VM_TEST_EMPTY_REPLY:-0}" = 1 ]; then
  printf '%s\\n' '{"choices":[{"message":{"content":""}}]}'
else
  printf '%s\\n' '{"choices":[{"message":{"content":"ready"}}]}'
fi
`);
  stub('jq', `#!/usr/bin/env node
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', s => input += s);
process.stdin.on('end', () => {
  try { const value = JSON.parse(input).choices?.[0]?.message?.content; process.exit(typeof value === 'string' && value.length > 0 ? 0 : 1); }
  catch { process.exit(1); }
});
`);
  try {
    const key = randomBytes(16).toString('hex');
    const result = spawnSync('bash', [script, '--start-services'], {
      cwd: root, encoding: 'utf8', timeout: 10000,
      env: { ...process.env, PATH: bin + delimiter + process.env.PATH, GATEWAY_MASTER_KEY: key, VM_TEST_TRACE: trace, ...env }
    });
    const commands = readFileSync(trace, 'utf8');
    assert.ok(!commands.includes(key), 'gateway key must stay out of argv');
    assert.ok(!(result.stdout + result.stderr).includes(key), 'gateway key must stay out of output');
    return { ...result, commands };
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test('level 3 starts Compose, pulls its configured container model, and checks local-small inference', () => {
  const result = runSetup();
  assert.equal(result.status, 0, result.stderr);
  const commands = result.commands.split('\n');
  const started = commands.indexOf('compose up -d');
  const pull = commands.indexOf(`compose exec -T ollama ollama pull ${byId.ollama.gatewayModel.replace(/^ollama\//, '')}`);
  const inference = commands.findIndex(line => line.startsWith('curl ') && line.includes('/v1/chat/completions') && line.includes('local-small'));
  assert.ok(started >= 0 && pull > started && inference > pull, result.commands);
  assert.doesNotMatch(result.commands, /unexpected system install/);
});

test('level 3 refuses successful setup when local-small cannot answer', () => {
  const result = runSetup({ VM_TEST_EMPTY_REPLY: '1' });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /local-small.*inference/i);
});

test('level 3 stops on a failed container pull before querying inference', () => {
  const result = runSetup({ VM_TEST_PULL_RC: '7' });
  assert.equal(result.status, 7, result.stderr);
  assert.doesNotMatch(result.commands, /curl /);
});

test('level 3 validates the whole gateway key before starting services', () => {
  const result = runSetup({ GATEWAY_MASTER_KEY: 'invalid\nheader' });
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.commands, '');
});

test('level 3 without Ollama starts only the selected services', () => {
  const result = runSetup({}, [byId.codex]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.commands, 'compose up -d\n');
});

test('level 3 service configures a literal headless PATH and documents customization', () => {
  const files = filesFor();
  const service = content(files, 'vm/jobs/weekly-audit.service');
  assert.match(service, /^Environment="PATH=\/usr\/local\/sbin:\/usr\/local\/bin:\/usr\/sbin:\/usr\/bin:\/sbin:\/bin"$/m);
  const docs = content(files, 'vm/jobs/README.md');
  assert.match(docs, /command -v node/);
  assert.match(docs, /absolute.*director/);
  assert.match(docs, /does not expand.*\$PATH/);
});
