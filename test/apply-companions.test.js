import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { byId, toolById } from '../src/catalog.js';
import { planFiles, writeFiles } from '../src/install.js';

async function setup(t, ids = ['context7'], primary = byId['claude-code']) {
  const api = await import('../src/apply-companions.js');
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'orch-companions-')));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const tools = ids.map((id) => toolById[id]);
  const opts = { level: 2, selected: [primary], primary, tools, project, dir: join(project, 'ai') };
  const files = planFiles(opts);
  return { ...api, ...opts, files, target: join(project, '.mcp.json'), plan(extra = {}) { return api.planCompanionApplication({ ...opts, files, ...extra }); } };
}
const parsed = (entry) => JSON.parse(entry.content.toString());
const cli = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

function cliFixture(t, tools = 'context7') {
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'orch-companion-cli-')));
  t.after(() => rmSync(project, { recursive: true, force: true }));
  const dir = join(project, 'ai');
  const target = join(project, '.mcp.json');
  const invoke = (args, input) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', input, timeout: 15000 });
  return {
    project, dir, target,
    run: (args = [], input = 'y\n') => invoke(['--ais', 'claude-code', '--primary', 'claude-code', '--level', '2', '--tools', tools, '--project', project, '--dir', dir, ...args], input),
    uninstall: () => invoke(['--uninstall', '--yes', '--project', project, '--dir', dir], '')
  };
}

test('companions: selected Claude project MCP is planned without running or installing a tool', async (t) => {
  const s = await setup(t, ['codecalc', 'context7']);
  const entries = s.plan();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].rel, '.mcp.json');
  assert.equal(entries[0].root, 'project');
  assert.equal(entries[0].applySnippet, true);
  assert.equal(entries[0].original, null);
  assert.deepEqual(Object.keys(parsed(entries[0]).mcpServers), ['codecalc', 'context7']);
  assert.equal(parsed(entries[0]).mcpServers.context7.type, 'http');
  assert.equal(existsSync(s.target), false, 'planning only reads the project');
  assert.deepEqual(entries[0].activation, { kind: 'mcp', key: 'mcpServers', hadKey: false, servers: parsed(entries[0]).mcpServers });
});

test('companions: no selection and hosts without verified project config leave user config untouched', async (t) => {
  const empty = await setup(t, []);
  assert.deepEqual(empty.plan(), []);
  const codex = await setup(t, ['context7'], byId.codex);
  assert.deepEqual(codex.plan(), []);
  const steps = codex.companionRegistrationSteps({ ...codex, applySnippets: true });
  assert.equal(steps.length, 1);
  assert.match(steps[0], /merge.*context7\.codex\.config\.toml.*your.*MCP config/);
});

test('companions: JSON merge preserves other servers and settings with a backup', async (t) => {
  const s = await setup(t);
  const original = '{"custom":true,"mcpServers":{"other":{"command":"local-tool"}}}';
  writeFileSync(s.target, original);
  const entries = s.plan();
  assert.deepEqual(entries[0].original, Buffer.from(original));
  const merged = parsed(entries[0]);
  assert.equal(merged.custom, true);
  assert.deepEqual(merged.mcpServers.other, { command: 'local-tool' });
  writeFiles(entries, { dir: s.dir, project: s.project, backupExisting: true });
  assert.equal(JSON.parse(readFileSync(s.target)).mcpServers.context7.type, 'http');
  const backups = readdirSync(s.project).filter((name) => name.startsWith('.mcp.json.bak-'));
  assert.equal(backups.length, 1);
  assert.equal(readFileSync(join(s.project, backups[0]), 'utf8'), original);
});

test('companions: duplicate entries keep original bytes and establish no new ownership', async (t) => {
  const s = await setup(t);
  const server = { url: 'https://mcp.context7.com/mcp', type: 'http' };
  const original = JSON.stringify({ mcpServers: { context7: server } });
  writeFileSync(s.target, original);
  const entry = s.plan()[0];
  assert.deepEqual(Buffer.from(entry.content), Buffer.from(original));
  assert.deepEqual(entry.activation.servers, {});
  assert.equal(entry.companionRegistrations[0].status, 'present');
  assert.deepEqual(s.companionRegistrationSteps({ ...s, applySnippets: true, registrations: [entry] }), []);
});

test('companions: existing name conflict is preserved and remains a real hand step', async (t) => {
  const s = await setup(t);
  const original = JSON.stringify({ mcpServers: { context7: { command: 'my-context-server' } } });
  writeFileSync(s.target, original);
  const entries = s.plan();
  assert.equal(Buffer.from(entries[0].content).toString(), original);
  assert.deepEqual(entries[0].activation.servers, {});
  assert.equal(entries[0].companionRegistrations[0].status, 'conflict');
  const steps = s.companionRegistrationSteps({ ...s, applySnippets: true, registrations: entries });
  assert.equal(steps.length, 1);
  assert.match(steps[0], /review.*context7.*existing entry kept/);
});

test('companions: invalid JSON and a malformed server map refuse before writing', async (t) => {
  const s = await setup(t);
  for (const content of ['invalid', '[]', '{"mcpServers":[]}', '{"mcpServers":null}']) {
    writeFileSync(s.target, content);
    assert.throws(() => s.plan(), /invalid JSON|JSON object|mcpServers/);
    assert.equal(readFileSync(s.target, 'utf8'), content);
    assert.equal(existsSync(s.dir), false);
  }
});

test('companions: dry run writes nothing and a changed project file refuses', async (t) => {
  const s = await setup(t);
  const entries = s.plan();
  writeFiles(entries, { dir: s.dir, project: s.project, dry: true, backupExisting: true });
  assert.equal(existsSync(s.target), false);
  writeFileSync(s.target, '{}');
  assert.throws(() => writeFiles(entries, { dir: s.dir, project: s.project, backupExisting: true }), /changed since snippet planning/);
  assert.equal(readFileSync(s.target, 'utf8'), '{}');
});

test('companions: project config symlinks refuse', async (t) => {
  const s = await setup(t);
  const actual = join(s.project, 'actual');
  mkdirSync(actual);
  writeFileSync(join(actual, '.mcp.json'), '{}');
  symlinkSync(actual, join(s.project, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const primary = { ...s.primary, projectMcp: { ...s.primary.projectMcp, file: 'linked/.mcp.json' } };
  assert.throws(() => s.plan({ primary }), /symlink/i);
});

test('companions: Windows stdio npx registration uses the documented command wrapper', async (t) => {
  const s = await setup(t, ['obsidian-tc']);
  const entries = s.plan({ platform: 'win32' });
  const config = parsed(entries[0]).mcpServers['obsidian-tc'];
  assert.equal(config.command, 'cmd');
  assert.deepEqual(config.args.slice(0, 3), ['/d', '/c', 'npx']);
  assert.equal(entries[0].companionRegistrations[0].needsConfiguration, true);
  const steps = s.companionRegistrationSteps({ ...s, applySnippets: true, registrations: entries });
  assert.equal(steps.length, 1);
  assert.match(steps[0], /OBSIDIAN_TC_CONFIG/);
});

test('companions: explicit no-apply retains registration as a hand step', async (t) => {
  const s = await setup(t);
  const steps = s.companionRegistrationSteps({ ...s, applySnippets: false });
  assert.equal(steps.length, 1);
  assert.match(steps[0], /merge.*context7\.claude-code\.mcp\.json.*\.mcp\.json/);
});

test('companions: uninstall removes only registered MCP entries and keeps foreign settings', async (t) => {
  const s = await setup(t);
  const { uninstallFiles } = await import('../src/uninstall.js');
  const foreign = { theme: 'custom', mcpServers: { other: { command: 'mine' } } };
  writeFileSync(s.target, JSON.stringify(foreign));
  const entries = s.plan();
  writeFiles([...s.files, ...entries], { dir: s.dir, project: s.project, backupExisting: true });
  const manifest = JSON.parse(readFileSync(join(s.dir, 'MANIFEST.json')));
  assert.deepEqual(Object.keys(manifest.activation['[project] .mcp.json'].servers), ['context7']);
  uninstallFiles({ dir: s.dir, project: s.project });
  assert.deepEqual(JSON.parse(readFileSync(s.target)), foreign);
  assert.ok(readdirSync(s.project).some((name) => name.startsWith('.mcp.json.bak-')));
});

test('companions: upgrade retains ownership and uninstall preserves an edited server', async (t) => {
  const s = await setup(t);
  const { uninstallFiles } = await import('../src/uninstall.js');
  writeFiles([...s.files, ...s.plan()], { dir: s.dir, project: s.project, backupExisting: true });
  const previous = JSON.parse(readFileSync(join(s.dir, 'MANIFEST.json')));
  writeFiles([...s.files, ...s.plan()], { dir: s.dir, project: s.project, prevManifest: previous, backupExisting: true });
  const modified = JSON.parse(readFileSync(s.target));
  modified.mcpServers.context7.url = 'https://example.invalid/my-context7';
  writeFileSync(s.target, JSON.stringify(modified));
  const result = uninstallFiles({ dir: s.dir, project: s.project });
  assert.deepEqual(JSON.parse(readFileSync(s.target)), modified);
  assert.match(JSON.stringify(result), /keep edited activation/);
  assert.ok(existsSync(join(s.dir, 'MANIFEST.json')));
});

test('companions: uninstall preserves a preexisting empty server map', async (t) => {
  const s = await setup(t);
  const { uninstallFiles } = await import('../src/uninstall.js');
  writeFileSync(s.target, '{"mcpServers":{}}');
  writeFiles([...s.files, ...s.plan()], { dir: s.dir, project: s.project, backupExisting: true });
  uninstallFiles({ dir: s.dir, project: s.project });
  assert.deepEqual(JSON.parse(readFileSync(s.target)), { mcpServers: {} });
});

test('companions CLI: interactive Context7 is previewed before one confirmation and needs no setup step', (t) => {
  const s = cliFixture(t);
  const result = s.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.stdout.split('[Y/n/e]').length - 1, 1);
  const preview = result.stdout.split('[Y/n/e]')[0];
  assert.match(preview, /merge config into .*\.mcp\.json.*backup/);
  assert.equal(JSON.parse(readFileSync(s.target)).mcpServers.context7.type, 'http');
  const remaining = result.stdout.split("What's left for you:")[1];
  assert.ok(remaining);
  assert.doesNotMatch(remaining, /context7|merge.*mcp/i);
  assert.doesNotMatch(result.stdout, /Context7.*npx ctx7 setup/);
});

test('companions CLI: --yes leaves existing project MCP bytes untouched without apply', (t) => {
  const s = cliFixture(t);
  const original = '{ "mcpServers": {"mine": {"command":"local-server"}}, "other": true }\n';
  writeFileSync(s.target, original);
  const result = s.run(['--yes'], '');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(s.target, 'utf8'), original);
  assert.doesNotMatch(result.stdout, /\[Y\/n\/e\]/);
  assert.match(result.stdout.split("What's left for you:")[1], /context7: merge/);
});

test('companions CLI: --yes --apply-snippets merges selected MCP entries with a backup', (t) => {
  const s = cliFixture(t);
  writeFileSync(s.target, '{"custom":true}\n');
  const result = s.run(['--yes', '--apply-snippets'], '');
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const config = JSON.parse(readFileSync(s.target));
  assert.equal(config.custom, true);
  assert.equal(config.mcpServers.context7.type, 'http');
  assert.ok(readdirSync(s.project).some((name) => name.startsWith('.mcp.json.bak-')));
  assert.doesNotMatch(result.stdout, /\[Y\/n\/e\]/);
});

test('companions CLI: --no-apply leaves the project MCP file byte-identical', (t) => {
  const s = cliFixture(t);
  const original = '{"custom":"keep"}\n';
  writeFileSync(s.target, original);
  const result = s.run(['--no-apply']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(readFileSync(s.target, 'utf8'), original);
  assert.equal(existsSync(join(s.project, 'CLAUDE.md')), false);
  assert.match(result.stdout.split("What's left for you:")[1], /context7: merge/);
});

test('companions CLI: invalid MCP JSON refuses before any install writes', (t) => {
  const s = cliFixture(t);
  writeFileSync(s.target, '{invalid');
  const result = s.run();
  assert.equal(result.status, 2, result.stdout + result.stderr);
  assert.match(result.stderr, /\.mcp\.json: invalid JSON/);
  assert.deepEqual(readdirSync(s.project), ['.mcp.json']);
  assert.equal(readFileSync(s.target, 'utf8'), '{invalid');
});

test('companions CLI: uninstall removes auto-registered entries and preserves foreign config', (t) => {
  const s = cliFixture(t);
  const foreign = { custom: true, mcpServers: { mine: { command: 'local-server' } } };
  writeFileSync(s.target, JSON.stringify(foreign));
  const installed = s.run();
  assert.equal(installed.status, 0, installed.stdout + installed.stderr);
  assert.match(readFileSync(join(s.project, 'CLAUDE.md'), 'utf8'), /<!-- model-orchestrator:start -->/);
  assert.match(readFileSync(join(s.project, '.claude', 'settings.json'), 'utf8'), /route-gate/);
  const result = s.uninstall();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(s.target)), foreign);
  assert.match(result.stdout, /remove activation .*\.mcp\.json/);
  assert.equal(existsSync(join(s.project, 'CLAUDE.md')), false);
  assert.equal(existsSync(join(s.project, '.claude', 'settings.json')), false);
});

test('companions CLI: selected local companions list only remaining prerequisites and vault configuration', (t) => {
  const s = cliFixture(t, 'codecalc,obsidian-tc');
  const result = s.run();
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const config = JSON.parse(readFileSync(s.target));
  assert.deepEqual(Object.keys(config.mcpServers), ['codecalc', 'obsidian-tc']);
  const remaining = result.stdout.split("What's left for you:")[1];
  assert.match(remaining, /codecalc: if uv or Python 3\.10\+ is missing/);
  assert.match(remaining, /obsidian-tc: set OBSIDIAN_TC_CONFIG.*vault setup/);
  assert.doesNotMatch(remaining, /merge|setup --write|npm install -g/);
});
