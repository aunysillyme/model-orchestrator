import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, readFileSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const CLI_RUN = fileURLToPath(new URL('../bin/cli-run.mjs', import.meta.url));
const run = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });

test('--help and --list exit 0 and mention every level', () => {
  const h = run(['--help']);
  assert.equal(h.status, 0);
  assert.match(h.stdout, /--level 1\|2\|3/);
  const l = run(['--list']);
  assert.equal(l.status, 0);
  for (const id of ['claude-code', 'codex', 'agy', 'grok', 'hermes', 'qwen', 'ollama']) assert.ok(l.stdout.includes(id), 'list missing ' + id);
});

test('non-interactive install writes a level 3 tree into a temp dir and refuses to overwrite', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-cli-'));
  try {
    const r = run(['--yes', '--level', '3', '--ais', 'claude-code,codex,agy,grok,hermes,qwen,ollama', '--primary', 'claude-code', '--dir', dir, '--no-install']);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    for (const f of ['README.md', 'ORCHESTRATOR.md', 'ROUTING.md', 'DELEGATION_MATRIX.md', 'bin/cli-run.mjs', 'bin/lanes.json', 'vm/gateway.config.yaml', 'vm/jobs/weekly-audit.timer', '.claude/agents/bulk-worker.md', 'CLAUDE.snippet.md']) {
      assert.ok(existsSync(join(dir, f)), 'missing ' + f);
    }
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    assert.match(readme, /level 3/);
    assert.match(readme, /Claude Code/);
    const again = run(['--yes', '--level', '3', '--ais', 'claude-code', '--dir', dir, '--no-install']);
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
  const ok = run(['--no-install'], { input: `2\n1,2\n1\ny\nn\n${dir}\ny\n` }); // level, AIs, primary, codecalc?, obsidian-tc?, dir, confirm
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
  assert.match(log, /"reason":"subtype=\\"error\\""/);
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
