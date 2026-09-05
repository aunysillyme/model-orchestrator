import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, readFileSync, symlinkSync, writeFileSync, mkdirSync, utimesSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const CLI_RUN = fileURLToPath(new URL('../bin/cli-run.mjs', import.meta.url));
const run = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });

test('--help and --list exit 0 and mention every level', () => {
  const h = run(['--help']);
  assert.doesNotMatch(h.stdout, /level 1 only/, '--primary applies at every level');
  assert.match(h.stdout, /--primary id\s+the agent that runs the system/);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /--level 1\|2\|3/);
  const l = run(['--list']);
  assert.equal(l.status, 0);
  for (const id of ['claude-code', 'codex', 'agy', 'grok', 'hermes', 'qwen', 'ollama']) assert.ok(l.stdout.includes(id), 'list missing ' + id);
});

test('non-interactive install writes a level 3 tree into a temp dir and refuses to overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-cli-'));
  try {
    const project = mkdtempSync(join(tmpdir(), 'orch-cli-proj-'));
    const r = run(['--yes', '--level', '3', '--ais', 'claude-code,codex,agy,grok,hermes,qwen,ollama', '--primary', 'claude-code', '--apis', 'anthropic,openrouter', '--dir', dir, '--project', project, '--no-install']);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    for (const f of ['README.md', 'ORCHESTRATOR.md', 'ROUTING.md', 'DELEGATION_MATRIX.md', 'bin/cli-run.mjs', 'bin/lanes.json', 'vm/gateway.config.yaml', 'vm/jobs/weekly-audit.timer', 'CLAUDE.snippet.md']) {
      assert.ok(existsSync(join(dir, f)), 'missing ' + f);
    }
    assert.ok(existsSync(join(project, '.claude', 'agents', 'bulk-worker.md')), 'subagents must land in --project');
    assert.match(r.stdout, /To activate, in order:/);
    assert.match(r.stdout, /1\. copy the block in .*CLAUDE\.snippet\.md into .*CLAUDE\.md/);
    assert.match(r.stdout, /cli-run\.mjs --doctor/);
    assert.match(r.stdout, /api keys anthropic, openrouter/);
    rmSync(project, { recursive: true, force: true });
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    assert.match(readme, /level 3/);
    assert.match(readme, /Claude Code/);
    const again = run(['--yes', '--level', '3', '--ais', 'claude-code', '--no-apis', '--dir', dir, '--project', dir, '--no-install']);
    assert.equal(again.status, 0);
    assert.match(again.stdout, /kept \d+ existing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--dry prints the plan and writes nothing', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'orch-dry-')), 'out');
  const r = run(['--yes', '--level', '1', '--ais', 'chatgpt-app', '--dir', dir, '--dry']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /PASTE-INTO-YOUR-AGENT\.md/);
  assert.ok(!existsSync(dir));
});

test('bad input exits 2 with a reason', () => {
  assert.equal(run(['--yes', '--level', '9', '--ais', 'codex']).status, 2);
  assert.equal(run(['--yes', '--level', '1', '--ais', 'nope']).status, 2);
  assert.equal(run(['--yes', '--level', '1', '--ais', 'hermes']).status, 2, 'hermes needs level 2');
  assert.equal(run(['--yes', '--level', '1', '--ais', 'ollama']).status, 2, 'ollama needs level 2');
  const noPrimary = run(['--yes', '--level', '2', '--ais', 'ollama', '--no-tools', '--dry']);
  assert.equal(noPrimary.status, 2, 'an Ollama-only selection has no orchestrator');
  assert.match(noPrimary.stderr, /pick at least one agent/);
  assert.equal(run(['--yes', '--level', '2', '--ais', 'codex', '--apis', 'openai', '--dry']).status, 2, '--apis is level 3 only');
  assert.equal(run(['--yes', '--level', '3', '--ais', 'codex', '--apis', 'nope', '--dry']).status, 2);
  assert.equal(run(['--yes', '--level', '3', '--ais', 'codex', '--apis', 'openai', '--no-apis', '--dry']).status, 2);
});

test('cli-run: usage errors and unavailable lanes exit with their documented codes', () => {
  const r = (args, env) => spawnSync(process.execPath, [CLI_RUN, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(r(['nope', 'p']).status, 2);
  assert.equal(r(['grok']).status, 2);
  assert.equal(r(['grok', 'p', '--audit']).status, 2, '--audit is codex-only');
  assert.equal(r(['codex', 'p', '--model', 'x']).status, 2, '--model is qwen-only');
  assert.equal(r(['grok', 'p', '--timeout', '0']).status, 2);
  // An empty PATH plus HOME pointed at an empty dir: the binary cannot be found.
  const home = mkdtempSync(join(tmpdir(), 'orch-home-'));
  const u = r(['grok', 'p', '--quiet'], { PATH: '', HOME: home });
  assert.equal(u.status, 13, u.stderr);
  rmSync(home, { recursive: true, force: true });
});

test('interactive path accepts piped answers and aborts on EOF instead of defaulting', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'orch-int-')), 'out');
  const ok = run(["--no-install"], { input: `2\n1,2\n1\ny\nn\n${dir}\n${dir}\ny\n` }); // level, AIs, primary, codecalc?, obsidian-tc?, dir, project, confirm
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  assert.ok(existsSync(join(dir, 'ROUTING.md')), 'level 2 file missing after interactive run');
  const eof = run(['--no-install'], { input: '2\n' });
  assert.equal(eof.status, 2, 'EOF mid-prompt must abort, not confirm a write');
  assert.match(eof.stderr, /input ended/);
  rmSync(dir, { recursive: true, force: true });
});

test('cli-run: runs when invoked through a symlink, and --brief must be a file', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-link-'));
  const link = join(d, 'cli-run');
  symlinkSync(CLI_RUN, link);
  const viaLink = spawnSync(process.execPath, [link], { encoding: 'utf8' });
  assert.equal(viaLink.status, 2, 'main() did not run through the symlink: ' + viaLink.stdout + viaLink.stderr);
  assert.match(viaLink.stderr, /usage:/);
  const dirBrief = spawnSync(process.execPath, [CLI_RUN, 'grok', '--brief', d], { encoding: 'utf8' });
  assert.equal(dirBrief.status, 2);
  assert.match(dirBrief.stderr, /--brief must be a file/);
  rmSync(d, { recursive: true, force: true });
});

// ---- audit round 1 fixes ----
test('unknown flags, missing values and duplicates are usage errors before anything is written', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'orch-flag-')), 'out');
  const typo = run(['--yes', '--level', '1', '--ais', 'codex', '--dir', dir, '--dryy', '--no-install']);
  assert.equal(typo.status, 2, typo.stdout);
  assert.match(typo.stderr, /unknown flag: --dryy/);
  assert.ok(!existsSync(dir), 'a typo of --dry wrote files');
  const missing = run(['--yes', '--level', '1', '--ais', 'codex', '--dir', '--force', '--dry']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /--dir requires a value/);
  const dup = run(['--yes', '--level', '1', '--level', '2', '--ais', 'codex', '--dry']);
  assert.equal(dup.status, 2);
  assert.match(dup.stderr, /more than once/);
  const positional = run(['install', '--yes']);
  assert.equal(positional.status, 2);
});

test('--list names the companion tool and its repo; --no-tools omits it; --tools selects it', () => {
  const l = run(['--list']);
  assert.match(l.stdout, /codecalc/);
  assert.match(l.stdout, /github\.com\/The-40-Thieves\/codecalc/);
  const none = run(['--yes', '--level', '1', '--ais', 'codex', '--no-tools', '--dry']);
  assert.equal(none.status, 0, none.stderr);
  assert.doesNotMatch(none.stdout, /CODECALC\.md/);
  assert.match(none.stdout, /numbers-and-logic\.md/);
  const withTool = run(['--yes', '--level', '1', '--ais', 'codex', '--tools', 'codecalc', '--dry']);
  assert.match(withTool.stdout, /CODECALC\.md/);
  const bad = run(['--yes', '--level', '1', '--ais', 'codex', '--tools', 'nope', '--dry']);
  assert.equal(bad.status, 2);
});

test('cli-run: a malformed lanes.json refuses every lane without spawning anything', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-lanes-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  const marker = join(d, 'spawned');
  writeFileSync(join(bin, 'grok'), `#!/bin/sh\ntouch "${marker}"\necho '{"stopReason":"end_turn","text":"hi"}'\n`, { mode: 0o755 });
  const copy = join(d, 'cli-run.mjs');
  writeFileSync(copy, readFileSync(CLI_RUN));
  writeFileSync(join(d, 'lanes.json'), '{bad');
  const r = spawnSync(process.execPath, [copy, 'grok', 'p', '--quiet'], { encoding: 'utf8', env: { PATH: bin, HOME: d } });
  assert.equal(r.status, 13, r.stderr);
  assert.match(r.stderr, /lanes\.json exists but is not a valid/);
  assert.ok(!existsSync(marker), 'the lane binary was spawned despite a malformed lanes.json');
  // a valid lanes.json that disables the lane is also 13, and absent means enabled
  writeFileSync(join(d, 'lanes.json'), '{"enabled":["codex"]}');
  assert.equal(spawnSync(process.execPath, [copy, 'grok', 'p', '--quiet'], { encoding: 'utf8', env: { PATH: bin, HOME: d } }).status, 13);
  rmSync(join(d, 'lanes.json'));
  const ok = spawnSync(process.execPath, [copy, 'grok', 'p', '--quiet'], { encoding: 'utf8', env: { PATH: bin, HOME: d } });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), 'hi');
  rmSync(d, { recursive: true, force: true });
});

test('cli-run: a lane killed by a signal is exit 10, never 0, even if it printed a deliverable first', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-sig-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'grok'), '#!/bin/sh\necho \'{"stopReason":"end_turn","text":"hi"}\'\nkill -TERM $$\n', { mode: 0o755 });
  const r = spawnSync(process.execPath, [CLI_RUN, 'grok', 'p'], { encoding: 'utf8', env: { PATH: bin, HOME: d } });
  assert.equal(r.status, 10, r.stdout + r.stderr);
  assert.match(r.stderr, /killed by SIGTERM/);
  assert.equal(r.stdout, '', 'a killed lane must not print the partial deliverable');
  rmSync(d, { recursive: true, force: true });
});

test('cli-run: the log carries a prompt digest, never the prompt text', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-log-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'grok'), '#!/bin/sh\necho \'{"stopReason":"end_turn","text":"hi"}\'\n', { mode: 0o755 });
  const r = spawnSync(process.execPath, [CLI_RUN, 'grok', 'sensitive-marker-text', '--quiet'], { encoding: 'utf8', env: { PATH: bin, HOME: d } });
  assert.equal(r.status, 0, r.stderr);
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.doesNotMatch(log, /sensitive-marker-text/);
  assert.match(log, /"prompt_sha256_12":"[0-9a-f]{12}"/);
  rmSync(d, { recursive: true, force: true });
});

test('a directory named like a binary is not detected as installed', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-which-'));
  mkdirSync(join(d, 'agy'));
  const r = run(['--list'], { env: { PATH: d, HOME: d } });
  assert.equal(r.status, 0, r.stderr);
  const agyBlock = r.stdout.split('\n').find((l) => l.startsWith('agy'));
  const next = r.stdout.split('\n')[r.stdout.split('\n').indexOf(agyBlock) + 1];
  assert.match(next, /not on PATH/);
  rmSync(d, { recursive: true, force: true });
});

// ---- audit round 2 fixes ----
test('cli-run: value flags need values, one prompt only, no stray positionals', () => {
  const r = (args) => spawnSync(process.execPath, [CLI_RUN, ...args], { encoding: 'utf8', env: { PATH: '', HOME: tmpdir() } });
  assert.equal(r(['qwen', 'p', '--model']).status, 2);
  const eaten = r(['qwen', 'p', '--model', '--safe-mode']);
  assert.equal(eaten.status, 2, 'a flag was consumed as the model id');
  assert.match(eaten.stderr, /--model requires a value/);
  assert.equal(r(['grok', 'p', 'ignored']).status, 2);
  const d = mkdtempSync(join(tmpdir(), 'orch-brief-'));
  writeFileSync(join(d, 'b.md'), 'brief');
  assert.equal(r(['grok', 'p', '--brief', join(d, 'b.md')]).status, 2, 'prompt and --brief together must be refused');
  rmSync(d, { recursive: true, force: true });
});

test('cli-run: provider message text reaches stderr but never the durable log', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-plog-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'qwen'), `#!/bin/sh\necho '[{"type":"result","subtype":"error","error":{"message":"PRIVATE_MARKER_FROM_PROVIDER"}}]'\n`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [CLI_RUN, 'qwen', 'p'], { encoding: 'utf8', env: { PATH: bin, HOME: d } });
  assert.equal(r.status, 10, r.stderr);
  assert.match(r.stderr, /PRIVATE_MARKER_FROM_PROVIDER/, 'the operator should still see the provider message on stderr');
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.doesNotMatch(log, /PRIVATE_MARKER_FROM_PROVIDER/);
  assert.match(log, /"reason":"bad_subtype"/);
  rmSync(d, { recursive: true, force: true });
});

test('--no-tools with --tools is a usage error, and the filesystem root is refused as --dir', () => {
  const c = run(['--yes', '--level', '1', '--ais', 'codex', '--no-tools', '--tools', 'nope', '--dry']);
  assert.equal(c.status, 2);
  assert.match(c.stderr, /contradict/);
  const root = run(['--yes', '--level', '1', '--ais', 'codex', '--no-tools', '--dir', '/', '--force', '--dry']);
  assert.equal(root.status, 2);
  assert.match(root.stderr, /filesystem root/);
});

test('--tools obsidian-tc is accepted, --yes alone does not select it, --list says it is optional and what it needs', () => {
  const l = run(['--list']);
  assert.match(l.stdout, /obsidian-tc/);
  assert.match(l.stdout, /Optional and heavier/);
  assert.match(l.stdout, /Obsidian vault/);
  const dflt = run(['--yes', '--level', '1', '--ais', 'codex', '--dry']);
  assert.match(dflt.stdout, /tools    codecalc\n/);
  assert.doesNotMatch(dflt.stdout, /OBSIDIAN-TC\.md/);
  const both = run(['--yes', '--level', '1', '--ais', 'codex', '--tools', 'codecalc,obsidian-tc', '--dry']);
  assert.equal(both.status, 0, both.stderr);
  assert.match(both.stdout, /OBSIDIAN-TC\.md/);
  assert.match(both.stdout, /mcp\/obsidian-tc\.mcpServers\.json/);
});


test('cli-run --doctor reports enabled lanes and binaries, refuses a lane argument, and --run needs --doctor', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-doc-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'grok'), '#!/bin/sh\necho \'{"stopReason":"end_turn","text":"OK"}\'\n', { mode: 0o755 });
  const copy = join(d, 'cli-run.mjs');
  writeFileSync(copy, readFileSync(CLI_RUN));
  writeFileSync(join(d, 'lanes.json'), '{"enabled":["grok","codex"]}');
  const r = spawnSync(process.execPath, [copy, '--doctor'], { encoding: 'utf8', env: { PATH: bin, HOME: d } });
  assert.equal(r.status, 10, r.stdout + r.stderr);
  assert.match(r.stdout, /grok\s+enabled\s+binary ok/);
  assert.match(r.stdout, /codex\s+enabled\s+binary MISSING/);
  assert.match(r.stdout, /1 problem/);
  writeFileSync(join(d, 'lanes.json'), '{"enabled":["grok"]}');
  const ok = spawnSync(process.execPath, [copy, '--doctor', '--run'], { encoding: 'utf8', env: { PATH: bin, HOME: d } });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /canary ok/);
  assert.equal(spawnSync(process.execPath, [copy, '--doctor', 'grok'], { encoding: 'utf8', env: { PATH: bin, HOME: d } }).status, 2);
  assert.equal(spawnSync(process.execPath, [copy, 'grok', 'p', '--run'], { encoding: 'utf8', env: { PATH: bin, HOME: d } }).status, 2);
  rmSync(d, { recursive: true, force: true });
});

test('--list names the metered providers separately from the AIs', () => {
  const l = run(['--list']);
  assert.match(l.stdout, /metered API providers/);
  assert.match(l.stdout, /anthropic\s+Anthropic API/);
});


// ---- audit issues #1, #4, #5, #9 on the real binary with stub lanes ----
function stubLane(d, lane, body) {
  const bin = join(d, 'bin');
  if (!existsSync(bin)) mkdirSync(bin);
  writeFileSync(join(bin, lane), '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
  return bin;
}
const withNode = (bin) => `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`;
const runLane = (args, env) => spawnSync(process.execPath, [CLI_RUN, ...args], { encoding: 'utf8', env });

test('#1: a background child of the lane does not survive the timeout', async () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-pg-'));
  const marker = join(d, 'child-survived');
  const bin = stubLane(d, 'grok', `(/bin/sleep 0.8; echo survived > "${marker}") >/dev/null 2>&1 &\n/bin/sleep 5`);
  const r = runLane(['grok', 't', '--timeout', '0.2', '--quiet'], { PATH: withNode(bin), HOME: d });
  assert.equal(r.status, 12, r.stderr);
  await new Promise((res) => setTimeout(res, 1200));
  assert.ok(!existsSync(marker), 'the detached grandchild kept working after the wrapper reported 12');
  rmSync(d, { recursive: true, force: true });
});

test('#1: a grandchild holding the stdout pipe cannot keep the wrapper from returning 12 promptly', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-pipe-'));
  const bin = stubLane(d, 'grok', '/bin/sleep 5 &\n/bin/sleep 5'); // the backgrounded sleep inherits stdout
  const t0 = Date.now();
  const r = runLane(['grok', 't', '--timeout', '0.3', '--quiet'], { PATH: withNode(bin), HOME: d });
  assert.equal(r.status, 12, r.stderr);
  assert.ok(Date.now() - t0 < 3000, 'wrapper waited on an inherited pipe');
  rmSync(d, { recursive: true, force: true });
});

test('#4: a marker in stopReason, status, subtype or event type never reaches the durable log', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-leak-'));
  const bin = stubLane(d, 'grok', `echo '{"stopReason":"PRIVATE_MARKER_123","text":""}'`);
  stubLane(d, 'agy', `echo '{"event":"result","result":{"status":"PRIVATE_MARKER_456","response":"x"}}'`);
  stubLane(d, 'qwen', `echo '[{"type":"result","subtype":"PRIVATE_MARKER_789","error":{"message":"PRIVATE_MARKER_000"}}]'`);
  for (const lane of ['grok', 'agy', 'qwen']) {
    const r = runLane([lane, 'public test', '--quiet'], { PATH: withNode(bin), HOME: d });
    assert.equal(r.status, 10, lane + ': ' + r.stderr);
  }
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.doesNotMatch(log, /PRIVATE_MARKER/);
  const reasons = log.trim().split('\n').map((l) => JSON.parse(l).reason);
  assert.deepEqual(reasons, ['bad_stop_reason', 'bad_status', 'bad_subtype']);
  rmSync(d, { recursive: true, force: true });
});

test('#9: a vendor exit 7 with an auth error keeps its code, shows the stderr head on the terminal, and is not logged ok', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-auth-'));
  const bin = stubLane(d, 'grok', 'echo "authentication failed: token expired" >&2\nexit 7');
  const r = runLane(['grok', 't'], { PATH: withNode(bin), HOME: d });
  assert.equal(r.status, 7, 'vendor code must pass through');
  assert.match(r.stderr, /exit_nonzero rc=7/);
  assert.match(r.stderr, /authentication failed/);
  const quiet = runLane(['grok', 't', '--quiet'], { PATH: withNode(bin), HOME: d });
  assert.equal(quiet.stderr, '', '--quiet must print nothing');
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.doesNotMatch(log, /authentication/);
  assert.match(log, /"verdict":"exit_nonzero"/);
  // nonzero exit WITH parseable text is still exit_nonzero, never ok
  const bin2 = stubLane(d, 'grok', `echo '{"stopReason":"end_turn","text":"looks fine"}'\nexit 3`);
  const r2 = runLane(['grok', 't', '--quiet'], { PATH: withNode(bin2), HOME: d });
  assert.equal(r2.status, 3);
  assert.equal(r2.stdout, '', 'text from a failed run is not printed as a deliverable');
  rmSync(d, { recursive: true, force: true });
});

test('#5: a refusal is exit 0 by default, exit 10 under --expect-file, and a fresh file satisfies it', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-expect-'));
  const bin = stubLane(d, 'grok', `echo '{"stopReason":"end_turn","text":"I cannot create that file."}'`);
  const target = join(d, 'required-output.txt');
  assert.equal(runLane(['grok', 'Create the file', '--quiet'], { PATH: withNode(bin), HOME: d }).status, 0, 'structural acceptance is the default');
  const unmet = runLane(['grok', 'Create the file', '--expect-file', target], { PATH: withNode(bin), HOME: d });
  assert.equal(unmet.status, 10);
  assert.match(unmet.stderr, /does not exist after the run/);
  const writer = stubLane(d, 'grok', `echo done > "${target}"\necho '{"stopReason":"end_turn","text":"wrote it"}'`);
  assert.equal(runLane(['grok', 'Create the file', '--expect-file', target, '--quiet'], { PATH: withNode(writer), HOME: d }).status, 0);
  // the same file from an EARLIER run is stale: put the refusal stub back (it does not touch the file)
  stubLane(d, 'grok', `echo '{"stopReason":"end_turn","text":"I cannot create that file."}'`);
  const utimes = new Date(Date.now() - 120_000);
  utimesSync(target, utimes, utimes);
  const stale = runLane(['grok', 'Create the file', '--expect-file', target], { PATH: withNode(bin), HOME: d });
  assert.equal(stale.status, 10);
  assert.match(stale.stderr, /existed before the run and was not changed/);
  assert.equal(runLane(['grok', 't', '--expect-json'], { PATH: withNode(bin), HOME: d }).status, 10);
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.match(log, /"reason":"contract_unmet"/);
  rmSync(d, { recursive: true, force: true });
});


test('#6: rerunning with an added lane applies it to lanes.json and MANIFEST.json, keeps edited docs, and reports requested vs applied', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-reconf-'));
  const dir = join(d, 'install');
  const proj = join(d, 'proj');
  const first = run(['--yes', '--level', '2', '--ais', 'codex', '--primary', 'codex', '--no-tools', '--no-install', '--dir', dir, '--project', proj]);
  assert.equal(first.status, 0, first.stderr);
  writeFileSync(join(dir, 'ROUTING.md'), 'my edited routing');
  const second = run(['--yes', '--level', '2', '--ais', 'codex,grok', '--primary', 'codex', '--no-tools', '--no-install', '--dir', dir, '--project', proj]);
  assert.equal(second.status, 0, second.stderr);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'bin', 'lanes.json'), 'utf8')).enabled, ['codex', 'grok']);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')).ais, ['codex', 'grok']);
  assert.equal(readFileSync(join(dir, 'ROUTING.md'), 'utf8'), 'my edited routing', 'an edited doc must survive a reconfiguration');
  assert.match(second.stdout, /Existing installation found \(MANIFEST\.json from generator/);
  assert.match(second.stdout, /selection changed: ais/);
  assert.match(second.stdout, /applied: .*bin\/lanes\.json/);
  assert.match(second.stdout, /documents kept: they may describe the old selection/);
  const same = run(['--yes', '--level', '2', '--ais', 'codex,grok', '--primary', 'codex', '--no-tools', '--no-install', '--dir', dir, '--project', proj]);
  assert.match(same.stdout, /selection identical/);
  rmSync(d, { recursive: true, force: true });
});

test('#8: the interactive install spawns npm with the same pinned spec the table prints', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-pin-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  const captured = join(d, 'npm-argv.txt');
  writeFileSync(join(bin, 'npm'), `#!/bin/sh\necho "$@" > "${captured}"\nexit 0`, { mode: 0o755 });
  // codex is NOT on this PATH, so the installer offers to install it; answer y.
  const r = run(['--level', '1', '--ais', 'codex', '--primary', 'codex', '--no-tools', '--dir', join(d, 'out'), '--project', join(d, 'proj')], {
    input: 'y\ny\n',
    // PATH deliberately excludes /usr/bin: a machine with a real codex there would skip the install prompt.
    env: { PATH: `${bin}:${dirname(process.execPath)}:/bin`, HOME: d }
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(existsSync(captured), 'the installer never offered to install codex (is a real codex on this PATH?):\n' + r.stdout);
  const argv = readFileSync(captured, 'utf8').trim();
  assert.match(argv, /^install -g @openai\/codex@\d+\.\d+\.\d+$/, 'npm was spawned without the catalog pin: ' + argv);
  assert.match(r.stdout, /run `npm install -g @openai\/codex@\d+\.\d+\.\d+` now/);
  rmSync(d, { recursive: true, force: true });
});


// ---- follow-up audit #13, #14, #15 ----
test('#15: an untouched artifact created immediately before the run fails --expect-file; a rewrite with new content passes', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-fresh-'));
  const target = join(d, 'artifact.txt');
  const bin = stubLane(d, 'grok', `echo '{"stopReason":"end_turn","text":"I did not write the artifact"}'`);
  writeFileSync(target, 'PREVIOUS RUN'); // created right before the call, inside any timestamp window
  const r = runLane(['grok', 't', '--expect-file', target], { PATH: withNode(bin), HOME: d });
  assert.equal(r.status, 10, 'a pre-existing untouched artifact must not satisfy the contract: ' + r.stderr);
  assert.match(r.stderr, /existed before the run and was not changed/);
  assert.equal(readFileSync(target, 'utf8'), 'PREVIOUS RUN');
  // the lane rewrites it with different content: passes even within the same second
  const writer = stubLane(d, 'grok', `echo "NEW $(date +%s%N)" > "${target}"\necho '{"stopReason":"end_turn","text":"rewrote it"}'`);
  assert.equal(runLane(['grok', 't', '--expect-file', target, '--quiet'], { PATH: withNode(writer), HOME: d }).status, 0);
  // a rewrite with IDENTICAL bytes and an unchanged mtime is indistinguishable from no write
  const same = readFileSync(target);
  const st = statSync(target);
  const identical = stubLane(d, 'grok', `echo '{"stopReason":"end_turn","text":"done"}'`);
  writeFileSync(target, same);
  utimesSync(target, st.atime, st.mtime);
  assert.equal(runLane(['grok', 't', '--expect-file', target, '--quiet'], { PATH: withNode(identical), HOME: d }).status, 10);
  rmSync(d, { recursive: true, force: true });
});

test('#14: multibyte UTF-8 split across chunks survives on stdout and stderr, and limits count bytes', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-utf8-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  const text = 'café 🙂 漢字 ñ';
  // split the payload at every byte boundary that falls inside a multibyte char
  const payload = Buffer.from(JSON.stringify({ stopReason: 'end_turn', text }));
  const cuts = [];
  for (let i = 1; i < payload.length; i++) if ((payload[i] & 0xc0) === 0x80) cuts.push(i); // continuation bytes
  assert.ok(cuts.length >= 6, 'test payload must contain multibyte characters');
  for (const cut of cuts.slice(0, 6)) {
    writeFileSync(join(bin, 'grok'), `#!${process.execPath}\nconst b=Buffer.from(${JSON.stringify(payload.toString('base64'))},'base64');process.stdout.write(b.subarray(0,${cut}));process.stderr.write(Buffer.from('é'.repeat(3)).subarray(0,1));setTimeout(()=>{process.stdout.write(b.subarray(${cut}));process.stderr.write(Buffer.from('é'.repeat(3)).subarray(1));},60);\n`, { mode: 0o755 });
    const r = runLane(['grok', 't', '--quiet'], { PATH: withNode(bin), HOME: d });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), text, `split at byte ${cut} corrupted the text: ${r.stdout}`);
  }
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8').trim().split('\n').pop();
  assert.equal(JSON.parse(log).raw_bytes, payload.length, 'raw_bytes must count bytes, not characters');
  assert.equal(JSON.parse(log).deliverable_bytes, Buffer.byteLength(text));
  rmSync(d, { recursive: true, force: true });
});

test('#13: SIGTERM and SIGINT to the wrapper kill the lane before it can write, and exit 143 / 130', async () => {
  for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130]]) {
    const d = mkdtempSync(join(tmpdir(), 'orch-sig-'));
    const marker = join(d, 'after-interruption');
    const ready = join(d, 'ready');
    const bin = stubLane(d, 'grok', `echo ready > "${ready}"\n/bin/sleep 0.7\necho survived > "${marker}"`);
    const p = spawn(process.execPath, [CLI_RUN, 'grok', 't', '--timeout', '5', '--quiet'], { env: { PATH: withNode(bin), HOME: d }, stdio: 'ignore' });
    for (let i = 0; i < 200 && !existsSync(ready); i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(existsSync(ready), 'stub did not start; this is not a passing cleanup test');
    const ended = new Promise((r) => p.on('exit', (c, s) => r({ c, s })));
    p.kill(sig);
    const exit = await ended;
    assert.equal(exit.c, code, `${sig}: expected exit ${code}, got ${JSON.stringify(exit)}`);
    await new Promise((r) => setTimeout(r, 1000));
    assert.ok(!existsSync(marker), `${sig}: the lane kept working after the wrapper was interrupted`);
    rmSync(d, { recursive: true, force: true });
  }
});

test('#13: repeated runs do not accumulate signal listeners', async () => {
  const m = await import('../bin/cli-run.mjs');
  const before = process.listenerCount('SIGTERM');
  const d = mkdtempSync(join(tmpdir(), 'orch-listen-'));
  const bin = stubLane(d, 'grok', `echo '{"stopReason":"end_turn","text":"ok"}'`);
  for (let i = 0; i < 3; i++) await m.runBounded([join(bin, 'grok')], 5);
  assert.equal(process.listenerCount('SIGTERM'), before);
  assert.equal(process.listenerCount('SIGINT'), process.listenerCount('SIGINT'));
  rmSync(d, { recursive: true, force: true });
});

// ---- #12: upgrade path ----
test('#12: an install without a manifest keeps runtime files and says executable fixes were not applied; --upgrade-runtime replaces runtime only', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-legacy-'));
  const dir = join(d, 'i');
  const proj = join(d, 'p');
  assert.equal(run(['--yes', '--level', '3', '--ais', 'codex', '--primary', 'codex', '--no-tools', '--no-apis', '--no-install', '--dir', dir, '--project', proj]).status, 0);
  // simulate a 0.1.0 install: no manifest, an old runner, an edited doc
  rmSync(join(dir, 'MANIFEST.json'));
  writeFileSync(join(dir, 'bin', 'cli-run.mjs'), '// OLD RUNNER with spawnSync\n');
  writeFileSync(join(dir, 'vm', 'jobs', 'weekly-audit.service'), '[Service]\nExecStart=/old\n');
  writeFileSync(join(dir, 'ROUTING.md'), 'my routing');
  const r = run(['--yes', '--level', '3', '--ais', 'codex', '--primary', 'codex', '--no-tools', '--no-apis', '--no-install', '--dir', dir, '--project', proj]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /no MANIFEST\.json: it predates 0\.1\.1/);
  assert.match(r.stdout, /runtime kept, UNVERIFIABLE: .*bin\/cli-run\.mjs/);
  assert.match(r.stdout, /Executable fixes were NOT applied/);
  assert.equal(readFileSync(join(dir, 'bin', 'cli-run.mjs'), 'utf8'), '// OLD RUNNER with spawnSync\n', 'must not silently replace an unverifiable runtime file');
  const up = run(['--yes', '--level', '3', '--ais', 'codex', '--primary', 'codex', '--no-tools', '--no-apis', '--no-install', '--upgrade-runtime', '--dir', dir, '--project', proj]);
  assert.equal(up.status, 0, up.stderr);
  assert.match(up.stdout, /runtime upgraded: .*bin\/cli-run\.mjs.*--upgrade-runtime/, 'the report must name the runtime files --upgrade-runtime replaced');
  assert.doesNotMatch(readFileSync(join(dir, 'bin', 'cli-run.mjs'), 'utf8'), /OLD RUNNER/);
  assert.match(readFileSync(join(dir, 'vm', 'jobs', 'weekly-audit.service'), 'utf8'), /TimeoutStartSec=900/);
  assert.equal(readFileSync(join(dir, 'ROUTING.md'), 'utf8'), 'my routing', '--upgrade-runtime must not touch documents');
  rmSync(d, { recursive: true, force: true });
});

test('#12: with a manifest, an untouched runtime file is upgraded, an edited one is kept and reported as a conflict, and the manifest records the generator version', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-upg-'));
  const dir = join(d, 'i');
  const proj = join(d, 'p');
  assert.equal(run(['--yes', '--level', '3', '--ais', 'codex', '--primary', 'codex', '--no-tools', '--no-apis', '--no-install', '--dir', dir, '--project', proj]).status, 0);
  const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8'));
  assert.match(manifest.generatorVersion, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.files['bin/cli-run.mjs'], /^[0-9a-f]{64}$/);
  // pretend the previous generator produced a different (older) runner and audit script, recorded honestly in the manifest
  const oldRunner = '// runner from an older release\n';
  writeFileSync(join(dir, 'bin', 'cli-run.mjs'), oldRunner);
  manifest.files['bin/cli-run.mjs'] = createHash('sha256').update(oldRunner).digest('hex');
  manifest.generatorVersion = '0.1.1';
  // and the user edited the audit script
  writeFileSync(join(dir, 'vm', 'jobs', 'weekly-audit.sh'), '#!/bin/bash\necho my custom audit\n');
  writeFileSync(join(dir, 'MANIFEST.json'), JSON.stringify(manifest));
  const r = run(['--yes', '--level', '3', '--ais', 'codex', '--primary', 'codex', '--no-tools', '--no-apis', '--no-install', '--dir', dir, '--project', proj]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /generator 0\.1\.1/);
  assert.match(r.stdout, /runtime upgraded: .*bin\/cli-run\.mjs/);
  assert.match(r.stdout, /runtime CONFLICT, kept: .*vm\/jobs\/weekly-audit\.sh/);
  assert.doesNotMatch(readFileSync(join(dir, 'bin', 'cli-run.mjs'), 'utf8'), /older release/);
  assert.equal(readFileSync(join(dir, 'vm', 'jobs', 'weekly-audit.sh'), 'utf8'), '#!/bin/bash\necho my custom audit\n');
  // identical rerun: nothing upgraded, nothing in conflict
  const again = run(['--yes', '--level', '3', '--ais', 'codex', '--primary', 'codex', '--no-tools', '--no-apis', '--no-install', '--dir', dir, '--project', proj]);
  assert.doesNotMatch(again.stdout, /runtime upgraded/);
  assert.match(again.stdout, /runtime CONFLICT, kept: .*weekly-audit\.sh/, 'the edited file stays a reported conflict until the user resolves it');
  rmSync(d, { recursive: true, force: true });
});

test('cli-run --doctor explains why the primary agent is not a lane, and says nothing when the primary is one', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-docp-'));
  mkdirSync(join(d, 'bin'));
  const copy = join(d, 'bin', 'cli-run.mjs');
  writeFileSync(copy, readFileSync(CLI_RUN));
  writeFileSync(join(d, 'bin', 'lanes.json'), '{"enabled":[]}');
  writeFileSync(join(d, 'MANIFEST.json'), JSON.stringify({ primary: 'claude-code' }));
  const r = spawnSync(process.execPath, [copy, '--doctor'], { encoding: 'utf8', env: { PATH: '/nonexistent', HOME: d } });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /note: claude-code is the primary agent; it calls cli-run and is not a lane/);
  writeFileSync(join(d, 'bin', 'lanes.json'), '{"enabled":["codex"]}');
  writeFileSync(join(d, 'MANIFEST.json'), JSON.stringify({ primary: 'codex' }));
  const r2 = spawnSync(process.execPath, [copy, '--doctor'], { encoding: 'utf8', env: { PATH: '/nonexistent', HOME: d } });
  assert.doesNotMatch(r2.stdout, /is the primary agent/);
  writeFileSync(join(d, 'MANIFEST.json'), '{"primary": "../evil; rm"}');
  assert.doesNotMatch(spawnSync(process.execPath, [copy, '--doctor'], { encoding: 'utf8', env: { PATH: '/nonexistent', HOME: d } }).stdout, /evil/, 'a manifest primary that is not a catalog-shaped id is ignored');
  rmSync(d, { recursive: true, force: true });
});

test('--update-docs regenerates only documents a previous run wrote and nobody edited; edited ones are kept and named; nothing without a manifest; --dry writes nothing', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-upd-'));
  const dir = join(d, 'i');
  const proj = join(d, 'p');
  const base = ['--yes', '--level', '2', '--primary', 'claude-code', '--no-tools', '--no-install', '--dir', dir, '--project', proj];
  assert.equal(run(['--ais', 'claude-code,codex', ...base]).status, 0);
  assert.doesNotMatch(readFileSync(join(dir, 'ROUTING.md'), 'utf8'), /grok/i, 'precondition: the two-lane routing doc names no grok lane');
  writeFileSync(join(dir, 'TIERS.md'), 'my tiers, hand edited\n');
  const agent = readFileSync(join(proj, '.claude', 'agents', 'live-researcher.md'), 'utf8');
  // adding a lane WITHOUT the flag: documents stay, the hint names the flag
  const plain = run(['--ais', 'claude-code,codex,grok', ...base]);
  assert.equal(plain.status, 0, plain.stderr);
  assert.doesNotMatch(readFileSync(join(dir, 'ROUTING.md'), 'utf8'), /grok/i, 'without --update-docs a document is never touched');
  assert.match(plain.stdout, /documents kept: .*--update-docs regenerates the ones you have not edited/);
  // --dry with the flag: reports, writes nothing
  const dry = run(['--ais', 'claude-code,codex,grok', '--update-docs', '--dry', ...base]);
  assert.equal(dry.status, 0, dry.stderr);
  assert.doesNotMatch(readFileSync(join(dir, 'ROUTING.md'), 'utf8'), /grok/i, '--dry must not write');
  // the real thing
  const r = run(['--ais', 'claude-code,codex,grok', '--update-docs', ...base]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /documents updated: .*ROUTING\.md/);
  assert.match(r.stdout, /document CONFLICT, kept: .*TIERS\.md/);
  assert.doesNotMatch(r.stdout, /documents kept: they may describe the old selection/);
  assert.match(readFileSync(join(dir, 'ROUTING.md'), 'utf8'), /grok/i, 'the untouched routing doc now names the new lane');
  assert.equal(readFileSync(join(dir, 'TIERS.md'), 'utf8'), 'my tiers, hand edited\n', 'an edited document is never regenerated by --update-docs');
  assert.equal(readFileSync(join(proj, '.claude', 'agents', 'live-researcher.md'), 'utf8').length > 0, true);
  // a second pass with nothing to do reports nothing updated and no conflict noise
  const again = run(['--ais', 'claude-code,codex,grok', '--update-docs', ...base]);
  assert.doesNotMatch(again.stdout, /documents updated:/);
  assert.match(again.stdout, /document CONFLICT, kept: .*TIERS\.md/, 'the edited file is still reported so the user knows it is stale');
  // no manifest: unverifiable, nothing touched
  rmSync(join(dir, 'MANIFEST.json'));
  writeFileSync(join(dir, 'ROUTING.md'), 'stale routing\n');
  const nm = run(['--ais', 'claude-code,codex,grok', '--update-docs', ...base]);
  assert.equal(nm.status, 0, nm.stderr);
  assert.match(nm.stdout, /documents kept, UNVERIFIABLE: .*ROUTING\.md/);
  assert.equal(readFileSync(join(dir, 'ROUTING.md'), 'utf8'), 'stale routing\n');
  assert.equal(agent, agent);
  rmSync(d, { recursive: true, force: true });
});

test('--update-docs is a known flag in --help and an unknown flag still exits 2', () => {
  assert.match(run(['--help']).stdout, /--update-docs\s+regenerate the documents a previous run wrote/);
  assert.equal(run(['--update-doc']).status, 2);
});

test('MANIFEST.json records the hash of what is on disk for kept files, not the hash of content the run planned but did not write', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-mani-'));
  const dir = join(d, 'i');
  const proj = join(d, 'p');
  const base = ['--yes', '--level', '2', '--primary', 'claude-code', '--no-tools', '--no-install', '--dir', dir, '--project', proj];
  assert.equal(run(['--ais', 'claude-code,codex', ...base]).status, 0);
  const before = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')).files;
  const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
  assert.equal(before['ROUTING.md'], sha(join(dir, 'ROUTING.md')));
  // add a lane without --update-docs: ROUTING.md is kept, so its manifest hash must still be the on-disk one
  assert.equal(run(['--ais', 'claude-code,codex,grok', ...base]).status, 0);
  const after = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')).files;
  assert.equal(after['ROUTING.md'], sha(join(dir, 'ROUTING.md')), 'a kept document keeps its on-disk hash in the manifest');
  assert.equal(after['bin/lanes.json'], sha(join(dir, 'bin', 'lanes.json')), 'a rewritten machine-owned file carries its new hash');
  // no manifest at all: a kept document gets no entry rather than a hash of text that never landed
  rmSync(join(dir, 'MANIFEST.json'));
  assert.equal(run(['--ais', 'claude-code,codex,grok,agy', ...base]).status, 0);
  const rebuilt = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')).files;
  assert.equal(rebuilt['ROUTING.md'], undefined, 'no manifest before means no claim about the kept document now');
  assert.ok(rebuilt['bin/lanes.json'], 'written files are still recorded');
  rmSync(d, { recursive: true, force: true });
});

test('#16: --dry-run is an alias for --dry and writes nothing', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-dryrun-'));
  const r = run(['--yes', '--level', '2', '--ais', 'claude-code,codex', '--primary', 'claude-code', '--no-tools', '--no-install', '--dry-run', '--dir', join(d, 'o'), '--project', join(d, 'p')]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /nothing written/);
  assert.equal(existsSync(join(d, 'o')), false);
  assert.match(run(['--help']).stdout, /--dry, --dry-run/);
  rmSync(d, { recursive: true, force: true });
});

test('#19: --yes without --primary prefers an agent that can load subagents over an earlier-listed one that cannot', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-prim-'));
  const r = run(['--yes', '--level', '2', '--ais', 'codex,agy', '--no-tools', '--no-install', '--dir', join(d, 'o'), '--project', join(d, 'p')]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /primary\s+agy/);
  assert.ok(existsSync(join(d, 'p', '.agents', 'agents', 'deep-planner.md')), 'agy subagents must be written');
  const cc = run(['--yes', '--level', '2', '--ais', 'codex,agy,claude-code', '--no-tools', '--no-install', '--dry', '--dir', join(d, 'o2'), '--project', join(d, 'p2')]);
  assert.match(cc.stdout, /primary\s+claude-code/, 'claude-code still wins when present');
  const none = run(['--yes', '--level', '2', '--ais', 'codex,grok', '--no-tools', '--no-install', '--dry', '--dir', join(d, 'o3'), '--project', join(d, 'p3')]);
  assert.match(none.stdout, /primary\s+codex/, 'with no subagent-capable candidate the first listed still wins');
  rmSync(d, { recursive: true, force: true });
});
