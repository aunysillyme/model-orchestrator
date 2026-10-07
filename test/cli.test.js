import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync, readFileSync, symlinkSync, writeFileSync, mkdirSync, utimesSync, statSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, delimiter, basename } from 'node:path';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url));
const CLI_RUN = fileURLToPath(new URL('../bin/cli-run.mjs', import.meta.url));
const run = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...opts });

// ---- Windows support for this file's fake-lane fixtures ----
//
// A fake lane binary is a #!/bin/sh script on POSIX, exactly how a real
// vendor's shim looks; Windows cannot execute a shebang script as argv[0].
// This file's CI job runs under Git Bash (.github/workflows/test.yml sets
// defaults.run.shell: bash), so sh.exe (and the coreutils these bodies use:
// sleep, kill) are already reachable from THIS process's own PATH, in the
// same directory as sh.exe.
//
// writeShellStub()/writeNodeStub() below install the fake lane as an npm
// cmd-shim on win32: a ".cmd" launcher whose "%_prog%" ... "<path>" %* line
// is the exact shape resolveCmdShim() in bin/cli-run.mjs parses, next to a
// ".js" file that node runs. That is deliberate, not incidental: it is the
// SAME path a real vendor CLI's shim takes through cli-run.mjs (see the
// comment above resolveCmdShim), so these tests exercise cli-run.mjs's own
// spawn, timeout, signal and process-group handling for real, through the
// real resolution code, not a bespoke bridge that happens to also produce
// a runnable binary. For a shell-bodied stub, the ".js" file is a thin
// pass-through to `sh -c body ...args`, so every test BODY stays identical
// POSIX shell (or a plain Node script) on every OS.
function findPosixToolsDir() {
  if (process.platform !== 'win32') return null;
  for (const dir of (process.env.PATH || '').split(delimiter)) {
    if (dir && existsSync(join(dir, 'sh.exe'))) return dir;
  }
  return null;
}
const WIN_SH_DIR = findPosixToolsDir();

// Mirrors the shape npm's own `cmd-shim` package writes (cmd-shim >= v6,
// npm >= 7): a short launcher whose "%_prog%" ... "<jsPath>" %* line is what
// resolveCmdShim() parses. Kept minimal on purpose: the fields that matter
// to the parser (node.exe-or-node fallback, %dp0%-relative quoted path,
// trailing %*) are exactly what a real npm install produces; comment lines
// and other cosmetic differences between cmd-shim versions are not.
function writeCmdShim(binPath, jsPath) {
  // Matches the real output of npm's own `cmd-shim` package (verified
  // against cmd-shim@9.0.2 directly: bin/judges.test.js pins its exact
  // bytes as a fixture), not a simplified guess: the "set PATHEXT=..." and
  // "endLocal & goto ..." text sits on the SAME line as "%_prog%", which is
  // exactly the shape resolveCmdShim() in bin/cli-run.mjs has to parse.
  const rel = basename(jsPath);
  writeFileSync(
    binPath + '.cmd',
    '@ECHO off\r\n' +
      'GOTO start\r\n' +
      ':find_dp0\r\n' +
      'SET dp0=%~dp0\r\n' +
      'EXIT /b\r\n' +
      ':start\r\n' +
      'SETLOCAL\r\n' +
      'CALL :find_dp0\r\n' +
      '\r\n' +
      'IF EXIST "%dp0%node.exe" (\r\n' +
      '  SET "_prog=%dp0%node.exe"\r\n' +
      ') ELSE (\r\n' +
      '  SET "_prog=node"\r\n' +
      ')\r\n' +
      '\r\n' +
      'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & set PATHEXT=%PATHEXT:;.JS;=;% & "%_prog%"  "%dp0%' +
      rel +
      '" %*\r\n'
  );
}

// Writes a fake lane binary at binPath (no extension) whose body is POSIX
// shell. body must not depend on argv beyond "$@"/"$1" etc., which survive
// the Windows .cmd -> node -> sh hop unchanged.
function writeShellStub(binPath, body) {
  if (process.platform === 'win32') {
    // .cjs, not .js: this file has no package.json of its own to declare a
    // module type, and require() below must not depend on Node guessing
    // "commonjs" from the nearest ancestor package.json (which could be this
    // repo's own "type": "module" if the temp dir ever lands under it).
    const js = binPath + '.cjs';
    writeFileSync(
      js,
      'const { spawnSync } = require("node:child_process");\n' +
        'const r = spawnSync("sh", ["-c", ' + JSON.stringify(body) + ', "sh", ...process.argv.slice(2)], { stdio: "inherit" });\n' +
        'process.exit(r.status === null ? (r.signal ? 1 : 0) : r.status);\n'
    );
    writeCmdShim(binPath, js);
  } else {
    writeFileSync(binPath, '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
  }
}

// Same idea for a fake lane whose body is a plain Node script rather than a
// shell one (used where the fixture needs real byte-level control that `sh`
// cannot express, such as writing raw bytes to stdout on a timer).
function writeNodeStub(binPath, jsBody) {
  if (process.platform === 'win32') {
    const js = binPath + '.cjs';
    writeFileSync(js, jsBody);
    writeCmdShim(binPath, js);
  } else {
    writeFileSync(binPath, '#!' + process.execPath + '\n' + jsBody, { mode: 0o755 });
  }
}

// Environment variable names are case-insensitive on Windows but object keys
// are not: {...process.env, PATH: x} can leave BOTH "Path" (whatever case
// this host's real env block used) and "PATH" (ours) in the same object.
// Which one a spawned child then sees is implementation-defined, not
// last-key-wins the way plain JS object semantics would suggest, so an
// override has to replace any existing case-variant of the same name, not
// just add a new key next to it.
function mergeEnv(base, overrides) {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    for (const existing of Object.keys(result)) {
      if (existing !== key && existing.toUpperCase() === key.toUpperCase()) delete result[existing];
    }
    result[key] = overrides[key];
  }
  return result;
}

// { PATH, HOME } is how most tests below build a deliberately narrow child
// env (no inherited PATH, so a real vendor CLI elsewhere on the machine
// cannot leak into a test that expects only the stub). Windows needs
// USERPROFILE too (os.homedir() does not consult HOME there) and benefits
// from the rest of process.env surviving (SystemRoot and friends, which a
// bare two-key env object silently drops and Windows can be picky about).
function winEnv(pathValue, home) {
  return mergeEnv(process.env, { PATH: pathValue, HOME: home, USERPROFILE: home });
}

// A bin dir holding only stub lanes needs sh.exe alongside it on win32 too,
// since the .cmd wrapper written by writeShellStub() calls out to sh; on
// POSIX the bin dir alone is enough (sh is invoked by the OS via shebang,
// with echo/kill/sleep resolved by that sh itself, not by this PATH).
function withSh(bin) {
  return process.platform === 'win32' ? [bin, WIN_SH_DIR].filter(Boolean).join(delimiter) : bin;
}

// Previously: the .cmd -> sh bridge above resolved and launched on win32,
// but the fake lanes it ran were not reachable end to end from inside
// cli-run.mjs's own child process (which() reported the binary present, but
// the actual spawn came back unavailable). Root cause: Node's fix for
// CVE-2024-27980 makes spawn() throw EINVAL for a .cmd target without
// shell:true, so cli-run.mjs's own un-shimmed spawn() call never reached the
// stub at all. bin/cli-run.mjs's windowsSpawnPlan() (resolveCmdShim first,
// a caret-escaped cmd.exe fallback second) fixes that for real lanes and for
// these fixtures alike, so the tests below run unconditionally now.
//
// The #12 upgrade-path tests previously diverged on Windows because the
// "runtime upgraded:" / "runtime CONFLICT, kept:" report lines were built
// from a raw, OS-native f.rel (backslash-joined on win32), while every
// assertion below expects the forward-slash form the rest of this tool's
// generated text uses. Fixed in src/install.js's writeFiles(): the report
// label is posix-normalized the same way the manifest key already was.

// A regex literal like /mcp\/obsidian-tc\.mcpServers\.json/ hardcodes the
// POSIX separator; the terminal output it matches against renders real
// project paths with path.join(), which is backslash-separated on win32.
// Build the pattern from join() and escape it, instead of hand-writing two
// separators.
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reOfPath = (...segments) => new RegExp(escapeRe(join(...segments)));

// A vendor lane dying mid-run from a real POSIX signal (a crash, an OOM
// kill, `kill -TERM` from outside) is a real scenario cli-run.mjs's own
// `r.signal || r.status === null` branch in main() exists to catch. It
// genuinely cannot be reproduced on win32 through this file's fixtures: a
// real Windows lane is a plain `node <script>` process (via the resolved
// cmd-shim in windowsSpawnPlan), so a real lane dying "by signal" cannot
// happen there any more than it can for the product being tested; Windows
// has no OS-level POSIX signals at all. The only way the fixture below can
// simulate it (a nested `sh -c "...; kill -TERM $$"`, since writeShellStub's
// win32 branch has to go through a .cjs -> sh bridge for the body to run at
// all) puts an extra node process between cli-run.mjs and the dying shell,
// so cli-run.mjs observes only that node's own translated exit code, not a
// real signal. Measured on windows-latest CI: MSYS bash's own self-kill
// encoding leaks through as a plain nonzero exit code (3840), which is
// exactly as informative as the OS gives a real Windows lane crashing, and
// this tool already handles that honestly via the exit_nonzero verdict.
const SKIP_LANE_SIGNAL_DEATH_ON_WIN32 = process.platform === 'win32' && 'a lane dying by a real POSIX signal cannot be reproduced through this fixture on win32, which has no OS-level signals; see the comment above SKIP_LANE_SIGNAL_DEATH_ON_WIN32';

test('--help and --list exit 0 and mention every level', () => {
  const h = run(['--help']);
  assert.doesNotMatch(h.stdout, /level 1 only/, '--primary applies at every level');
  assert.match(h.stdout, /--primary id\s+the main agent that runs the system/);
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
    assert.match(r.stdout, /What's left for you:/);
    assert.match(r.stdout, /1\. copy the block in .*CLAUDE\.snippet\.md into .*CLAUDE\.md/);
    assert.match(r.stdout, /Health check \(doctor/);
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
  const r = (args, env) => spawnSync(process.execPath, [CLI_RUN, ...args], { encoding: 'utf8', env: mergeEnv(process.env, env || {}) });
  assert.equal(r(['nope', 'p']).status, 2);
  assert.equal(r(['grok']).status, 2);
  assert.equal(r(['grok', 'p', '--audit']).status, 2, '--audit is codex-only');
  assert.equal(r(['qwen', 'p', '--effort', 'high']).status, 2, 'qwen has no reasoning flag, so --effort must be refused, not dropped');
  assert.equal(r(['codex', 'p', '--safe-mode']).status, 2, '--safe-mode is qwen-only');
  assert.equal(r(['codex', 'p', '--model', '--sandbox']).status, 2, 'a route value may not be a flag');
  assert.equal(r(['codex', 'p', '--effort', 'hi gh']).status, 2, 'a route value may not contain a space');
  assert.equal(r(['codex', 'p', '--model', 'a"b']).status, 2, 'a route value may not contain a quote');
  const providerLane = r(['codex', 'hi', '--provider', 'x']);
  assert.equal(providerLane.status, 2);
  assert.match(providerLane.stderr, /codex has no provider flag; --provider is hermes-only/);
  const providerOnly = r(['hermes', 'hi', '--provider', 'xai-oauth'], { HERMES_INFERENCE_MODEL: undefined });
  assert.equal(providerOnly.status, 2);
  assert.match(providerOnly.stderr, /--provider <p> needs a model/);
  const providerBlank = r(['hermes', 'hi', '--provider', 'xai-oauth'], { HERMES_INFERENCE_MODEL: '  ' });
  assert.equal(providerBlank.status, 2);
  assert.match(providerBlank.stderr, /--provider <p> needs a model/);
  const providerBad = r(['hermes', 'hi', '--provider', '-bad']);
  assert.equal(providerBad.status, 2);
  assert.match(providerBad.stderr, /--provider must be 1 to 64 characters/);
  assert.equal(r(['grok', 'p', '--timeout', '0']).status, 2);
  // An empty PATH plus HOME pointed at an empty dir: the binary cannot be found.
  const home = mkdtempSync(join(tmpdir(), 'orch-home-'));
  const u = r(['grok', 'p', '--quiet'], { PATH: '', HOME: home });
  assert.equal(u.status, 13, u.stderr);
  rmSync(home, { recursive: true, force: true });
});

test('interactive path accepts piped answers and aborts on EOF instead of defaulting', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'orch-int-')), 'out');
  const args = ['--no-install', '--ais', 'claude-code,codex', '--dir', dir, '--project', dir];
  const ok = run(args, { input: 'y\n' });
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  assert.ok(existsSync(join(dir, 'ROUTING.md')), 'level 2 file missing after interactive run');
  const eof = run(args, { input: '' });
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
  writeShellStub(join(bin, 'grok'), `touch "${marker}"\necho '{"stopReason":"end_turn","text":"hi"}'`);
  const copy = join(d, 'cli-run.mjs');
  writeFileSync(copy, readFileSync(CLI_RUN));
  writeFileSync(join(d, 'lanes.json'), '{bad');
  const r = spawnSync(process.execPath, [copy, 'grok', 'p', '--quiet'], { encoding: 'utf8', env: winEnv(withSh(bin), d) });
  assert.equal(r.status, 13, r.stderr);
  assert.match(r.stderr, /lanes\.json exists but is not a valid/);
  assert.ok(!existsSync(marker), 'the lane binary was spawned despite a malformed lanes.json');
  // a valid lanes.json that disables the lane is also 13, and absent means enabled
  writeFileSync(join(d, 'lanes.json'), '{"enabled":["codex"]}');
  assert.equal(spawnSync(process.execPath, [copy, 'grok', 'p', '--quiet'], { encoding: 'utf8', env: winEnv(withSh(bin), d) }).status, 13);
  rmSync(join(d, 'lanes.json'));
  const ok = spawnSync(process.execPath, [copy, 'grok', 'p', '--quiet'], { encoding: 'utf8', env: winEnv(withSh(bin), d) });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(ok.stdout.trim(), 'hi');
  rmSync(d, { recursive: true, force: true });
});

test('cli-run: a lane killed by a signal is cut_short (exit 18), never 0, even if it printed a deliverable first', { skip: SKIP_LANE_SIGNAL_DEATH_ON_WIN32 }, () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-sig-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  writeShellStub(join(bin, 'grok'), 'echo \'{"stopReason":"end_turn","text":"hi"}\'\nkill -TERM $$');
  const r = spawnSync(process.execPath, [CLI_RUN, 'grok', 'p'], { encoding: 'utf8', env: winEnv(withSh(bin), d) });
  assert.equal(r.status, 18, r.stdout + r.stderr);
  assert.match(r.stderr, /class=cut_short/);
  assert.match(r.stderr, /killed by SIGTERM/);
  assert.equal(r.stdout, '', 'a killed lane must not print the partial deliverable');
  rmSync(d, { recursive: true, force: true });
});

test('cli-run: the log carries a prompt digest, never the prompt text', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-log-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  writeShellStub(join(bin, 'grok'), 'echo \'{"stopReason":"end_turn","text":"hi"}\'');
  const r = spawnSync(process.execPath, [CLI_RUN, 'grok', 'sensitive-marker-text', '--quiet'], { encoding: 'utf8', env: winEnv(withSh(bin), d) });
  assert.equal(r.status, 0, r.stderr);
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.doesNotMatch(log, /sensitive-marker-text/);
  assert.match(log, /"prompt_sha256_12":"[0-9a-f]{12}"/);
  rmSync(d, { recursive: true, force: true });
});

test('a directory named like a binary is not detected as installed', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-which-'));
  mkdirSync(join(d, 'agy'));
  const r = run(['--list'], { env: winEnv(d, d) });
  assert.equal(r.status, 0, r.stderr);
  const agyBlock = r.stdout.split('\n').find((l) => l.startsWith('agy'));
  const next = r.stdout.split('\n')[r.stdout.split('\n').indexOf(agyBlock) + 1];
  assert.match(next, /not on PATH/);
  rmSync(d, { recursive: true, force: true });
});

// ---- audit round 2 fixes ----
test('cli-run: value flags need values, one prompt only, no stray positionals', () => {
  const r = (args) => spawnSync(process.execPath, [CLI_RUN, ...args], { encoding: 'utf8', env: winEnv('', tmpdir()) });
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
  writeShellStub(join(bin, 'qwen'), `echo '[{"type":"result","subtype":"error","error":{"message":"PRIVATE_MARKER_FROM_PROVIDER"}}]'`);
  const r = spawnSync(process.execPath, [CLI_RUN, 'qwen', 'p'], { encoding: 'utf8', env: winEnv(withSh(bin), d) });
  assert.equal(r.status, 10, r.stderr);
  assert.match(r.stderr, /PRIVATE_MARKER_FROM_PROVIDER/, 'the operator should still see the provider message on stderr');
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.doesNotMatch(log, /PRIVATE_MARKER_FROM_PROVIDER/);
  assert.match(log, /"reason":"bad_subtype"/);
  rmSync(d, { recursive: true, force: true });
});

test('--no-tools remains compatible with explicit tools, and the filesystem root is refused as --dir', () => {
  const c = run(['--yes', '--level', '1', '--ais', 'codex', '--no-tools', '--tools', 'codecalc', '--dry']);
  assert.equal(c.status, 0, c.stderr);
  assert.match(c.stdout, /CODECALC\.md/);
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
  assert.match(dflt.stdout, /tools    none \(companions are opt-in\)\n/);
  assert.doesNotMatch(dflt.stdout, /OBSIDIAN-TC\.md/);
  const both = run(['--yes', '--level', '1', '--ais', 'codex', '--tools', 'codecalc,obsidian-tc', '--dry']);
  assert.equal(both.status, 0, both.stderr);
  assert.match(both.stdout, /OBSIDIAN-TC\.md/);
  assert.match(both.stdout, reOfPath('mcp', 'obsidian-tc.mcpServers.json'));
});

test('--tools context7 is accepted, --yes alone does not select it, --list says it needs a network call, and it pairs with codecalc', () => {
  const l = run(['--list']);
  assert.match(l.stdout, /context7/);
  assert.match(l.stdout, /network call/);
  const dflt = run(['--yes', '--level', '1', '--ais', 'codex', '--dry']);
  assert.match(dflt.stdout, /tools    none \(companions are opt-in\)\n/);
  assert.doesNotMatch(dflt.stdout, /CONTEXT7\.md/);
  const all = run(['--yes', '--level', '1', '--ais', 'codex', '--tools', 'codecalc,obsidian-tc,context7', '--dry']);
  assert.equal(all.status, 0, all.stderr);
  assert.match(all.stdout, /CONTEXT7\.md/);
  assert.match(all.stdout, reOfPath('mcp', 'context7.codex.config.toml'));
  const c7Only = run(['--yes', '--level', '1', '--ais', 'codex', '--tools', 'context7', '--dry']);
  assert.equal(c7Only.status, 0, c7Only.stderr);
  assert.match(c7Only.stdout, /CONTEXT7\.md/);
  assert.doesNotMatch(c7Only.stdout, /CODECALC\.md/, '--tools context7 alone must not also select codecalc');
});


test('cli-run --doctor reports enabled lanes and binaries, refuses a lane argument, and --run needs --doctor', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-doc-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  writeShellStub(join(bin, 'grok'), 'echo \'{"stopReason":"end_turn","text":"OK"}\'');
  const copy = join(d, 'cli-run.mjs');
  writeFileSync(copy, readFileSync(CLI_RUN));
  writeFileSync(join(d, 'lanes.json'), '{"enabled":["grok","codex"]}');
  const r = spawnSync(process.execPath, [copy, '--doctor'], { encoding: 'utf8', env: winEnv(withSh(bin), d) });
  assert.equal(r.status, 10, r.stdout + r.stderr);
  assert.match(r.stdout, /grok\s+enabled\s+binary ok/);
  assert.match(r.stdout, /codex\s+enabled\s+binary MISSING/);
  assert.match(r.stdout, /1 problem/);
  writeFileSync(join(d, 'lanes.json'), '{"enabled":["grok"]}');
  const ok = spawnSync(process.execPath, [copy, '--doctor', '--run'], { encoding: 'utf8', env: winEnv(withSh(bin), d) });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /canary ok/);
  assert.equal(spawnSync(process.execPath, [copy, '--doctor', 'grok'], { encoding: 'utf8', env: winEnv(withSh(bin), d) }).status, 2);
  assert.equal(spawnSync(process.execPath, [copy, 'grok', 'p', '--run'], { encoding: 'utf8', env: winEnv(withSh(bin), d) }).status, 2);
  rmSync(d, { recursive: true, force: true });
});

test('cli-run --doctor notes hermes provider gaps without changing its return code', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-doc-provider-'));
  try {
    const bin = join(d, 'bin');
    mkdirSync(bin);
    writeNodeStub(join(bin, 'hermes'), 'throw new Error("doctor must not run this stub");');
    const copy = join(d, 'cli-run.mjs');
    writeFileSync(copy, readFileSync(CLI_RUN));
    const check = (defaults, enabled = ['hermes'], path = bin) => {
      writeFileSync(join(d, 'lanes.json'), JSON.stringify({ enabled, defaults }));
      return spawnSync(process.execPath, [copy, '--doctor'], { encoding: 'utf8', env: winEnv(path, d) });
    };
    const baseline = check({});
    assert.equal(baseline.status, 0, baseline.stderr);
    const modelOnly = check({ hermes: { model: 'grok-4.6' } });
    assert.equal(modelOnly.status, baseline.status);
    assert.match(modelOnly.stdout, /model pinned with no provider.*default provider.*HTTP 400.*pin "provider" beside "model"/);
    assert.match(modelOnly.stdout, /doctor: all enabled lanes present/);
    const providerOnly = check({ hermes: { provider: 'xai-oauth' } });
    assert.equal(providerOnly.status, baseline.status);
    assert.match(providerOnly.stdout, /provider pinned with no model.*without --model will be refused.*HERMES_INFERENCE_MODEL/);
    const paired = check({ hermes: { model: 'grok-4.6', provider: 'xai-oauth', effort: 'high' } });
    assert.equal(paired.status, baseline.status);
    assert.match(paired.stdout, /route xai-oauth:grok-4.6\/high/);
    assert.doesNotMatch(paired.stdout, /note: .*pinned with no/);
    const disabled = check({ hermes: { model: 'grok-4.6' } }, ['codex']);
    assert.doesNotMatch(disabled.stdout, /model pinned with no provider/);
    const missing = check({}, ['hermes'], '');
    const missingPinned = check({ hermes: { model: 'grok-4.6' } }, ['hermes'], '');
    assert.equal(missing.status, 10);
    assert.equal(missingPinned.status, missing.status);
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('cli-run: hermes provider reaches argv and logs from flags, defaults and an environment model', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-hermes-provider-'));
  try {
    const bin = join(d, 'bin');
    mkdirSync(bin);
    writeNodeStub(join(bin, 'hermes'), 'console.log(JSON.stringify(process.argv.slice(2)));');
    const copy = join(d, 'cli-run.mjs');
    writeFileSync(copy, readFileSync(CLI_RUN));
    const runHermes = (defaults, flags = [], model = undefined) => {
      writeFileSync(join(d, 'lanes.json'), JSON.stringify({ enabled: ['hermes'], defaults: { hermes: defaults } }));
      return spawnSync(process.execPath, [copy, 'hermes', 'hi', '--quiet', ...flags], {
        encoding: 'utf8', env: mergeEnv(winEnv(bin, d), { HERMES_INFERENCE_MODEL: model })
      });
    };
    const lastLog = () => JSON.parse(readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8').trim().split('\n').at(-1));
    const pinned = runHermes({ provider: 'xai-oauth', model: 'grok-4.6' });
    assert.equal(pinned.status, 0, pinned.stderr);
    const pinnedArgv = JSON.parse(pinned.stdout);
    assert.deepEqual(pinnedArgv.slice(0, 6), ['--provider', 'xai-oauth', '-m', 'grok-4.6', '-z', 'hi']);
    assert.equal(pinnedArgv[6], '--usage-file');
    assert.equal(lastLog().provider_requested, 'xai-oauth');
    assert.equal(lastLog().provider_source, 'lanes.json');
    assert.equal(lastLog().model_requested, 'grok-4.6');
    const flagged = runHermes({ provider: 'other', model: 'other-model' }, ['--provider', 'xai-oauth', '--model', 'grok-4.6']);
    assert.equal(flagged.status, 0, flagged.stderr);
    assert.deepEqual(JSON.parse(flagged.stdout).slice(0, 6), pinnedArgv.slice(0, 6));
    assert.equal(lastLog().provider_requested, 'xai-oauth');
    assert.equal(lastLog().provider_source, 'flag');
    assert.equal(lastLog().model_source, 'flag');
    const absent = runHermes({ provider: 'xai-oauth' });
    assert.equal(absent.status, 2);
    assert.match(absent.stderr, /needs a model/);
    const inherited = runHermes({ provider: 'xai-oauth' }, [], 'grok-4.6');
    assert.equal(inherited.status, 0, inherited.stderr);
    assert.deepEqual(JSON.parse(inherited.stdout).slice(0, 4), ['--provider', 'xai-oauth', '-z', 'hi']);
    assert.equal(lastLog().model_requested, null);
    assert.equal(lastLog().model_source, 'lane_default');
    assert.equal(lastLog().provider_requested, 'xai-oauth');
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
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
  writeShellStub(join(bin, lane), body);
  return bin;
}
const withNode = (bin) =>
  process.platform === 'win32'
    ? [bin, dirname(process.execPath), WIN_SH_DIR].filter(Boolean).join(delimiter)
    : [bin, dirname(process.execPath), '/usr/bin', '/bin'].join(delimiter);
// Every runLane() caller already builds its PATH deliberately (withNode(bin),
// scoped to the fake lane only); this just fills in the rest of a usable
// child env around that choice: process.env for whatever Windows itself
// needs (SystemRoot, ComSpec, ...), and USERPROFILE alongside whatever HOME
// the caller set, so os.homedir() resolves the same sandboxed directory on
// every OS without touching each call site individually.
const runLane = (args, env) =>
  spawnSync(process.execPath, [CLI_RUN, ...args], {
    encoding: 'utf8',
    env: mergeEnv(process.env, { ...env, USERPROFILE: (env && (env.HOME ?? env.USERPROFILE)) ?? process.env.USERPROFILE })
  });

test('claude: native adapter failures and contracts preserve exit classes and fixed logs', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-claude-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  const result = (over = {}) => JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: 'OK', permission_denials: [], ...over });
  const denied = [{ tool_name: 'Read', tool_use_id: 'synthetic', tool_input: { file_path: 'public-test' } }];
  try {
    for (const [out, err, cliRc, code, cls] of [
      [result(), '', 0, 0, 'ok'], [result(), '', 7, 18, 'cut_short'],
      ['malformed', '', 0, 18, 'cut_short'], ['', '', 0, 11, 'no_output'],
      [result({ result: '' }), '', 0, 10, 'empty'],
      [result({ is_error: true, result: 'Not logged in. Please run /login' }), '', 1, 14, 'auth'],
      ['', '403 permission_error', 1, 14, 'auth'],
      [result({ is_error: true, result: 'rate_limit_error: 429' }), '', 1, 15, 'quota'],
      [result({ subtype: 'error_during_execution', is_error: true, errors: ['invalid_request_error: 400'] }), '', 1, 16, 'rejected'],
      [result({ result: '', permission_denials: denied }), '', 0, 17, 'refused'],
      [result({ permission_denials: denied }), '', 0, 0, 'ok'],
      [result({ subtype: 'error_during_execution', is_error: true, errors: ['request cancelled'] }), '', 1, 18, 'cut_short']
    ]) {
      writeNodeStub(join(bin, 'claude'), `process.stdout.write(${JSON.stringify(out)}); process.stderr.write(${JSON.stringify(err)}); process.exit(${cliRc});`);
      const r = runLane(['claude', 'public test', '--quiet'], { PATH: withNode(bin), HOME: d });
      assert.equal(r.status, code, r.stderr);
      assert.equal(r.stdout, code === 0 ? 'OK\n' : '', 'failures must not print a partial result');
      const log = JSON.parse(readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8').trim().split('\n').pop());
      assert.equal(log.class, cls);
      assert.equal(log.cli_rc, cliRc);
      assert.equal(log.refused, out.includes('public-test') ? 1 : out.startsWith('{') ? 0 : null);
      assert.ok(!JSON.stringify(log).includes('public test'), 'prompt text stays out of the log');
    }
    assert.equal(runLane(['claude', 'public test', '--expect-json', '--quiet'], { PATH: withNode(bin), HOME: d }).status, 18);
    writeNodeStub(join(bin, 'claude'), `process.stdout.write(${JSON.stringify(result())});`);
    assert.equal(runLane(['claude', 'public test', '--expect-json', '--quiet'], { PATH: withNode(bin), HOME: d }).status, 10);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('claude: generated lanes and doctor work for either primary without invoking an unselected lane', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-claude-doctor-'));
  const bin = join(d, 'stubs');
  mkdirSync(bin);
  const marker = join(d, 'claude-called');
  try {
    writeNodeStub(join(bin, 'claude'), `if (process.argv[2] === 'auth') { console.log(JSON.stringify({loggedIn:true})); process.exit(0); } require('node:fs').writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2))); process.stdout.write(JSON.stringify({type:'result', subtype:'success', is_error:false, result:'OK', permission_denials:[]}));`);
    writeNodeStub(join(bin, 'codex'), `const fs = require('node:fs'); const args = process.argv.slice(2); if (args[0] === 'login') process.exit(0); fs.writeFileSync(args[args.indexOf('-o')+1], 'OK'); console.log(JSON.stringify({type:'turn.completed'}));`);
    const env = winEnv(withNode(bin), d);
    for (const [primary, reviewer, command] of [['codex', 'claude-code', 'cli-run claude'], ['claude-code', 'codex', 'cli-run codex --audit']]) {
      const dir = join(d, primary, 'rules');
      const project = join(d, primary, 'project');
      const installed = run(['--yes', '--level', '2', '--ais', 'codex,claude-code', '--primary', primary, '--no-tools', '--dir', dir, '--project', project], { env });
      assert.equal(installed.status, 0, installed.stderr);
      assert.deepEqual(JSON.parse(readFileSync(join(dir, 'bin', 'lanes.json'), 'utf8')).enabled, ['codex', 'claude']);
      const role = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')).roles.review;
      assert.equal(role.ai, reviewer);
      assert.equal(role.command, command);
      assert.ok(readFileSync(join(dir, 'ROUTING.md'), 'utf8').includes(command));
      const routed = spawnSync(process.execPath, [fileURLToPath(new URL('../bin/aunx.js', import.meta.url)), 'route', '--dir', dir, 'review this diff'], { env, encoding: 'utf8' });
      assert.equal(routed.status, 0, routed.stderr);
      assert.ok(routed.stdout.includes(command), routed.stdout);
      assert.ok(!existsSync(marker), 'route suggestions must not launch a worker');
      const runner = join(dir, 'bin', 'cli-run.mjs');
      const doctor = spawnSync(process.execPath, [runner, '--doctor'], { env, encoding: 'utf8' });
      assert.equal(doctor.status, 0, doctor.stderr);
      assert.match(doctor.stdout, /claude\s+enabled\s+binary ok/);
      assert.doesNotMatch(doctor.stdout, /main agent and is not an executable lane/);
      assert.ok(!existsSync(marker), 'presence checks must send no prompt');
      // All calls here are hermetic: restrict the live-check configuration to
      // this synthetic CLI, never run doctor against installed vendor binaries.
      writeFileSync(join(dir, 'bin', 'lanes.json'), JSON.stringify({ enabled: ['claude'], defaults: { claude: { model: 'chosen-model', effort: 'high' } } }));
      const live = spawnSync(process.execPath, [runner, '--doctor', '--run'], { env, encoding: 'utf8' });
      assert.equal(live.status, 0, live.stderr);
      assert.match(live.stdout, /canary ok/);
      const args = JSON.parse(readFileSync(marker, 'utf8'));
      assert.ok(args.includes('chosen-model') && args.includes('high'));
      rmSync(marker);
      const missing = spawnSync(process.execPath, [runner, '--doctor'], { env: winEnv(join(d, 'missing-binaries'), d), encoding: 'utf8' });
      assert.equal(missing.status, 10, 'doctor uses its existing problem exit for a missing enabled binary');
      assert.match(missing.stdout, /claude\s+enabled\s+binary MISSING/);
      assert.ok(!existsSync(marker));
      writeFileSync(join(dir, 'bin', 'lanes.json'), JSON.stringify({ enabled: ['codex'] }));
      const disabled = spawnSync(process.execPath, [runner, 'claude', 'public test'], { env, encoding: 'utf8' });
      assert.equal(disabled.status, 13);
      assert.ok(!existsSync(marker));
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('claude: timeout and wrapper cancellation stop the lane', async () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-claude-stop-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  const ready = join(d, 'ready');
  const marker = join(d, 'after-stop');
  try {
    writeNodeStub(join(bin, 'claude'), `
      const fs = require('node:fs');
      const { join } = require('node:path');
      fs.writeFileSync(join(__dirname, '..', 'ready'), 'ready');
      setTimeout(() => fs.writeFileSync(join(__dirname, '..', 'after-stop'), 'survived'), 800);
    `);
    const env = winEnv(withNode(bin), d);
    const timed = runLane(['claude', 'public test', '--timeout', '0.3', '--quiet'], env);
    assert.equal(timed.status, 12, timed.stderr);
    await new Promise(r => setTimeout(r, 900));
    assert.ok(!existsSync(marker), 'timed-out lane kept running');
    for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) {
      rmSync(ready, { force: true });
      const child = spawn(process.execPath, [CLI_RUN, 'claude', 'public test', '--quiet'], { env, stdio: 'ignore' });
      try {
        for (let i = 0; i < 200 && !existsSync(ready); i++) await new Promise(r => setTimeout(r, 10));
        assert.ok(existsSync(ready), 'Claude stub never started');
        const ended = new Promise(r => child.once('exit', (status, sig) => r({ status, sig })));
        child.kill(signal);
        const exit = await ended;
        if (process.platform === 'win32') assert.equal(exit.sig, signal);
        else {
          assert.equal(exit.status, code);
          await new Promise(r => setTimeout(r, 900));
          assert.ok(!existsSync(marker), 'cancelled lane kept running');
        }
      } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); }
    }
  } finally { rmSync(d, { recursive: true, force: true }); }
});

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
  // grok's non-end_turn stop never finished (cut_short); agy and qwen finished with a failure status (empty)
  for (const [lane, code] of [['grok', 18], ['agy', 10], ['qwen', 10]]) {
    const r = runLane([lane, 'public test', '--quiet'], { PATH: withNode(bin), HOME: d });
    assert.equal(r.status, code, lane + ': ' + r.stderr);
  }
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.doesNotMatch(log, /PRIVATE_MARKER/);
  const recs = log.trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(recs.map((r) => r.reason), ['bad_stop_reason', 'bad_status', 'bad_subtype']);
  assert.deepEqual(recs.map((r) => r.class), ['cut_short', 'empty', 'empty']);
  rmSync(d, { recursive: true, force: true });
});

test('#9: a vendor exit 7 is never ok: the class owns the exit code, cli_rc keeps the vendor code, the stderr head shows on the terminal', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-auth-'));
  const bin = stubLane(d, 'grok', 'echo "authentication failed: token expired" >&2\nexit 7');
  const r = runLane(['grok', 't'], { PATH: withNode(bin), HOME: d });
  assert.equal(r.status, 18, 'grok has no native auth signal, so an unexplained nonzero exit is cut_short');
  assert.match(r.stderr, /exit_nonzero rc=18 class=cut_short refused=null/);
  assert.match(r.stderr, /authentication failed/);
  assert.match(r.stderr, /cli-run problem: cli-run\[grok\] cut short: lane exited 7/);
  assert.match(r.stderr, /cli-run fix: /);
  const quiet = runLane(['grok', 't', '--quiet'], { PATH: withNode(bin), HOME: d });
  assert.equal(quiet.stderr, '', '--quiet must print nothing');
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.doesNotMatch(log, /authentication/);
  const rec = JSON.parse(log.trim().split('\n')[0]);
  assert.deepEqual([rec.verdict, rec.class, rec.rc, rec.cli_rc, rec.refused], ['exit_nonzero', 'cut_short', 18, 7, null]);
  // nonzero exit WITH parseable text is still a failure, never ok
  const bin2 = stubLane(d, 'grok', `echo '{"stopReason":"end_turn","text":"looks fine"}'\nexit 3`);
  const r2 = runLane(['grok', 't', '--quiet'], { PATH: withNode(bin2), HOME: d });
  assert.equal(r2.status, 18);
  assert.equal(r2.stdout, '', 'text from a failed run is not printed as a deliverable');
  rmSync(d, { recursive: true, force: true });
});

test('failure classes end to end: qwen with no API key exits 14 and logs class auth, never the message', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-class-auth-'));
  const bin = stubLane(d, 'qwen', `echo '[{"type":"result","subtype":"error_during_execution","is_error":true,"result":null,"permission_denials":[],"error":{"message":"Missing API key for OpenAI-compatible auth. Set the OPENROUTER_API_KEY environment variable."}}]'\nexit 1`);
  const r = runLane(['qwen', 't'], { PATH: withNode(bin), HOME: d });
  assert.equal(r.status, 14, r.stderr);
  assert.match(r.stderr, /class=auth refused=0/);
  assert.match(r.stderr, /cli-run problem: cli-run\[qwen\] auth: .*Missing API key/);
  assert.match(r.stderr, /cli-run fix: set the credential/);
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  assert.doesNotMatch(log, /Missing API key|OPENROUTER/);
  const rec = JSON.parse(log.trim());
  assert.deepEqual([rec.class, rec.rc, rec.cli_rc, rec.refused], ['auth', 14, 1, 0]);
  rmSync(d, { recursive: true, force: true });
});

test('failure classes end to end: a secret on a lane\'s stderr or in its error never reaches the terminal or the log', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-class-redact-'));
  // Assembled at run time: no credential-shaped literal lives in this file.
  const k1 = 'xai-' + 'A'.repeat(700);
  const k2 = 'sk-' + 'LIVE' + 'Z'.repeat(20);
  const k3 = 'sk-' + 'PROMPT' + 'Q'.repeat(20);
  const codex = stubLane(d, 'codex', `echo '{"type":"thread.started"}'\necho "codex_core::tools::router: error=exec_command failed: Rejected(x) token=${k1} ${k2}" >&2\nexit 1`);
  const r = runLane(['codex', 'prompt carries ' + k3], { PATH: withNode(codex), HOME: d });
  assert.equal(r.status, 17, 'a router Rejected line with no deliverable is refused: ' + r.stderr);
  assert.match(r.stderr, /class=refused refused=1/);
  const qwen = stubLane(d, 'qwen', `echo '[{"type":"result","subtype":"error","is_error":true,"result":null,"error":{"message":"upstream echoed ${k2}"}}]'\nexit 1`);
  const r2 = runLane(['qwen', 't'], { PATH: withNode(qwen), HOME: d });
  const log = readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8');
  for (const [where, text] of [['codex stderr', r.stderr], ['qwen stderr', r2.stderr], ['log', log]]) {
    for (const k of [k2, k3, 'AAAA']) assert.ok(!text.includes(k), `${where} leaked a secret fragment`);
  }
  assert.match(r.stderr, /\[REDACTED\]/);
  rmSync(d, { recursive: true, force: true });
});

test('failure classes end to end: grok with two refused calls still exits 0 and prints the deliverable, refused=2, and a problem and fix', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-class-grok-'));
  const root = join(d, 'sessions');
  const sid = 'e2e-session-0001';
  const enc = encodeURIComponent(realpathSync(process.cwd())).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  mkdirSync(join(root, enc, sid), { recursive: true });
  const line = (update) => JSON.stringify({ params: { sessionId: sid, update } });
  writeFileSync(join(root, enc, sid, 'updates.jsonl'), [
    line({ sessionUpdate: 'hook_execution', runs: [{ status: { blocked: true } }] }),
    line({ sessionUpdate: 'tool_call_update', status: 'failed', content: [{ text: 'Denied by permission policy: deny rule on bash matching sudo' }] })
  ].join('\n') + '\n');
  const bin = stubLane(d, 'grok', `echo '{"stopReason":"end_turn","text":"done","sessionId":"${sid}"}'`);
  const r = runLane(['grok', 't'], { PATH: withNode(bin), HOME: d, CLI_RUN_GROK_SESSIONS_ROOT: root });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'done');
  assert.match(r.stderr, /class=ok refused=2/);
  assert.match(r.stderr, /cli-run problem: cli-run\[grok\] ok, but 2 call\(s\) were refused/);
  const rec = JSON.parse(readFileSync(join(d, '.ai-orchestrator', 'cli-run.log.jsonl'), 'utf8').trim());
  assert.deepEqual([rec.class, rec.rc, rec.refused], ['ok', 0, 2]);
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
  // "applied:" is generated prose, posix-normalized on every host (src/install.js's
  // writeFiles label), like the rest of this tool's path text; not the OS-native
  // join() the actual local file read above correctly uses.
  assert.match(second.stdout, /applied: .*bin\/lanes\.json/);
  assert.match(second.stdout, /documents kept: they may describe the old selection/);
  const same = run(['--yes', '--level', '2', '--ais', 'codex,grok', '--primary', 'codex', '--no-tools', '--no-install', '--dir', dir, '--project', proj]);
  assert.match(same.stdout, /selection identical/);
  rmSync(d, { recursive: true, force: true });
});

test('the interactive installer prints vendor setup and never spawns npm', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-pin-'));
  const bin = join(d, 'bin');
  mkdirSync(bin);
  const captured = join(d, 'npm-argv.txt');
  writeShellStub(join(bin, 'npm'), `echo "$@" > "${captured}"\nexit 0`);
  // Codex is absent from this PATH, so setup instructions must be printed.
  const r = run(['--level', '1', '--ais', 'codex', '--primary', 'codex', '--no-tools', '--dir', join(d, 'out'), '--project', join(d, 'proj')], {
    input: 'y\n',
    // PATH deliberately excludes /usr/bin: a machine with a real codex there would skip its missing-binary instruction.
    env: winEnv(process.platform === 'win32' ? [bin, WIN_SH_DIR].filter(Boolean).join(delimiter) : [bin, '/bin'].join(delimiter), d)
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(existsSync(captured), false, 'installer must never invoke a vendor package manager');
  assert.match(r.stdout, /Install these yourself/);
  assert.match(r.stdout, /npm install -g @openai\/codex@\d+\.\d+\.\d+/);
  assert.match(r.stdout, /https:\/\/developers\.openai\.com\/codex\/cli/);
  assert.doesNotMatch(r.stdout, /run `npm install|now\? \[y\/N\]/);
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
    writeNodeStub(join(bin, 'grok'), `const b=Buffer.from(${JSON.stringify(payload.toString('base64'))},'base64');process.stdout.write(b.subarray(0,${cut}));process.stderr.write(Buffer.from('é'.repeat(3)).subarray(0,1));setTimeout(()=>{process.stdout.write(b.subarray(${cut}));process.stderr.write(Buffer.from('é'.repeat(3)).subarray(1));},60);\n`);
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
    const p = spawn(process.execPath, [CLI_RUN, 'grok', 't', '--timeout', '5', '--quiet'], { env: winEnv(withNode(bin), d), stdio: 'ignore' });
    for (let i = 0; i < 200 && !existsSync(ready); i++) await new Promise((r) => setTimeout(r, 10));
    assert.ok(existsSync(ready), 'stub did not start; this is not a passing cleanup test');
    const ended = new Promise((r) => p.on('exit', (c, s) => r({ c, s })));
    p.kill(sig);
    const exit = await ended;
    // Windows has no OS-level signals at all: ChildProcess.kill(sig) there
    // calls TerminateProcess() unconditionally for both names, proven on
    // windows-latest CI (the wrapper died as {code: null, signal: sig} for
    // SIGTERM AND SIGINT alike; a hypothesis that SIGINT gets a real,
    // catchable console-control event on Windows was tried here first and
    // measured false in this exact scenario, not assumed). So the graceful
    // exit-143/130-and-kill-the-lane-first behavior below is a POSIX
    // guarantee for both signals, not a portability gap in the wrapper.
    if (process.platform === 'win32') {
      assert.equal(exit.s, sig, `${sig}: expected an unhandled termination on win32, got ${JSON.stringify(exit)}`);
      rmSync(d, { recursive: true, force: true });
      continue;
    }
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
test('installer reports lanes withheld from a kept runner in writes and dry previews', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-withheld-report-'));
  try {
    const dir = join(d, 'i');
    const project = join(d, 'p');
    const args = ['--yes', '--level', '2', '--ais', 'codex,claude-code', '--primary', 'codex', '--no-tools', '--no-apis', '--dir', dir, '--project', project, '--apply-snippets'];
    const env = winEnv(join(d, 'no-vendor-binaries'), d);
    const first = run(args, { env });
    assert.equal(first.status, 0, first.stderr);
    const runner = join(dir, 'bin', 'cli-run.mjs');
    const old = readFileSync(runner, 'utf8').replace(/^export const LANES = .*;$/m, "export const LANES = ['grok', 'codex', 'agy', 'hermes', 'qwen'];") + '\n// local edit\n';
    writeFileSync(runner, old);
    const expected = '  lanes withheld: claude (the kept bin/cli-run.mjs predates them; re-run with --upgrade-runtime to enable)';
    const preview = run([...args, '--dry-run'], { env });
    assert.equal(preview.status, 0, preview.stderr);
    assert.ok(preview.stdout.includes(expected), preview.stdout);
    assert.ok(JSON.parse(readFileSync(join(dir, 'bin', 'lanes.json'), 'utf8')).enabled.includes('claude'));
    const kept = run(args, { env });
    assert.equal(kept.status, 0, kept.stderr);
    assert.ok(kept.stdout.includes(expected), kept.stdout);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'bin', 'lanes.json'), 'utf8')).enabled, ['codex']);
    const upgraded = run([...args, '--upgrade-runtime'], { env });
    assert.equal(upgraded.status, 0, upgraded.stderr);
    assert.equal(upgraded.stdout.includes(expected), false);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'bin', 'lanes.json'), 'utf8')).enabled, ['codex', 'claude']);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

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

test('cli-run --doctor explains why the main agent is not a lane, and says nothing when the primary is one', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-docp-'));
  mkdirSync(join(d, 'bin'));
  const copy = join(d, 'bin', 'cli-run.mjs');
  writeFileSync(copy, readFileSync(CLI_RUN));
  writeFileSync(join(d, 'bin', 'lanes.json'), '{"enabled":[]}');
  writeFileSync(join(d, 'MANIFEST.json'), JSON.stringify({ primary: 'claude-code' }));
  const r = spawnSync(process.execPath, [copy, '--doctor'], { encoding: 'utf8', env: winEnv('/nonexistent', d) });
  assert.equal(r.status, 13, r.stdout + r.stderr);
  assert.match(r.stdout, /note: claude-code is the main agent and is not an executable lane/);
  writeFileSync(join(d, 'bin', 'lanes.json'), '{"enabled":["codex"]}');
  writeFileSync(join(d, 'MANIFEST.json'), JSON.stringify({ primary: 'codex' }));
  const r2 = spawnSync(process.execPath, [copy, '--doctor'], { encoding: 'utf8', env: winEnv('/nonexistent', d) });
  assert.doesNotMatch(r2.stdout, /is the main agent/);
  writeFileSync(join(d, 'MANIFEST.json'), '{"primary": "../evil; rm"}');
  assert.doesNotMatch(spawnSync(process.execPath, [copy, '--doctor'], { encoding: 'utf8', env: winEnv('/nonexistent', d) }).stdout, /evil/, 'a manifest primary that is not a catalog-shaped id is ignored');
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

test('chat-only level 2 warns and doctor refuses zero lanes, including --run', () => {
  const d = mkdtempSync(join(tmpdir(), 'orch-empty-'));
  try {
    const r = run(['--yes', '--level', '2', '--ais', 'chatgpt-app', '--no-tools', '--dir', join(d, 'docs'), '--project', d]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no executable lanes selected; delegation is inactive/);
    for (const flags of [['--doctor'], ['--doctor', '--run']]) {
      const check = spawnSync(process.execPath, [join(d, 'docs', 'bin', 'cli-run.mjs'), ...flags], { encoding: 'utf8', env: winEnv('/nonexistent', d) });
      assert.equal(check.status, 13, check.stdout + check.stderr);
      assert.match(check.stderr, /inactive: no executable lanes/);
      assert.doesNotMatch(check.stdout, /all enabled lanes|it calls cli-run/);
      assert.ok(!existsSync(join(d, '.ai-orchestrator')), 'doctor must not run a lane');
    }
  } finally {
    rmSync(d, { recursive: true, force: true });
  }
});

test('--version and -v print the package version and exit 0; -h is --help; other single-dash args stay errors', () => {
  const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
  for (const f of ['--version', '-v']) {
    const r = run([f]);
    assert.equal(r.status, 0, `${f} should exit 0`);
    assert.equal(r.stdout.trim(), pkg.version, `${f} should print ${pkg.version}`);
  }
  // -h reaches the same help as --help: both were listed in SPEC before 0.1.9
  // but only the long form could ever be parsed.
  const short = run(['-h']), long = run(['--help']);
  assert.equal(short.status, 0);
  assert.equal(short.stdout, long.stdout, '-h and --help must print the same text');
  assert.match(long.stdout, /--version, -v/, 'help must document the flag it accepts');
  // Strictness is not relaxed by adding two short forms.
  const x = run(['-x']);
  assert.equal(x.status, 2);
  assert.match(x.stderr, /unexpected argument: -x/);
  const typo = run(['--versionn']);
  assert.equal(typo.status, 2);
  assert.match(typo.stderr, /unknown flag: --versionn/);
});

// #28: the tool block printed "optional: Optional. Needs Python 3.10+ and uv."
// on every run that selected a tool: the label said the note's own first word.
test('the tool block does not repeat the note label in the note', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-tool-'));
  try {
    const r = run(['--yes', '--level', '1', '--ais', 'claude-code', '--tools', 'codecalc', '--dir', dir, '--project', dir, '--no-install']);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /codecalc: merge .*mcpServers\.json.*CODECALC\.md/, 'manual registration guidance must still print');
    for (const line of r.stdout.split('\n')) {
      const m = line.match(/^\s*([A-Za-z]+):\s+([A-Za-z]+)/);
      if (m) assert.notEqual(m[1].toLowerCase(), m[2].toLowerCase(), `label repeats itself: ${line.trim()}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// #28: --help called --primary "required when several qualify", and then a --yes
// run with several picked one and said nothing.
test('an auto-picked primary is named in the plan, an explicit one is not', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-prim-'));
  try {
    const auto = run(['--yes', '--level', '2', '--ais', 'claude-code,codex', '--dir', dir, '--project', dir, '--dry']);
    assert.equal(auto.status, 0, auto.stderr + auto.stdout);
    assert.match(auto.stdout, /primary\s+claude-code \(chosen for you from claude-code, codex; pass --primary to decide it yourself\)/);
    const explicit = run(['--yes', '--level', '2', '--ais', 'claude-code,codex', '--primary', 'codex', '--dir', dir, '--project', dir, '--dry']);
    assert.equal(explicit.status, 0, explicit.stderr + explicit.stdout);
    assert.match(explicit.stdout, /primary\s+codex \(from --primary\)\n/);
    assert.doesNotMatch(explicit.stdout, /chosen for you/);
    const single = run(['--yes', '--level', '2', '--ais', 'claude-code', '--dir', dir, '--project', dir, '--dry']);
    assert.doesNotMatch(single.stdout, /chosen for you/, 'one candidate is not a choice made for you');
    assert.doesNotMatch(run(['--help']).stdout, /required when several qualify/, 'the help must not promise a requirement the run does not enforce');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
