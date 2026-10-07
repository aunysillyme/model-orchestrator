import { spawn } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { killTree, main as runnerMain, windowsSpawnPlan } from '../bin/cli-run.mjs';
import { MANIFEST_BYTE_CAP, readRegularFile } from './bounded-file.js';
import { byId } from './catalog.js';
import { ROLE_SPECS } from './roles.js';
import { modelsMain } from './models.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COMMON = join(ROOT, 'templates', 'common');
const HELP = `aunx: model router tools for AI coding agents

  aunx [installer flags]              Run the model-orchestrator installer
  aunx cli-run [--dir PATH] <args>     Run a lane; --dir names a project's own runner
  aunx route-metrics [--summary]      Read the local routing summary
  aunx models --help                 Resolve current Claude models or check installed agent pins
  aunx brief [PATH]                   Print the task brief template, or scaffold it at PATH
  aunx brief new [PATH]               Create TASK_BRIEF.md
  aunx context [new] [PATH]           Create CONTEXT.md
  aunx checks [new] [PATH]            Create ACCEPTANCE_CHECKS.json
  aunx checks run [PATH]              Run local checks; exit 1 on any FAIL. checks run executes
                                       the commands in your checks file, so run it only on files you trust.
  aunx route [--dir PATH] "<task>"    Suggest a stack role, tier and effort

Route reads MANIFEST.json from --dir, then ./ai-orchestrator, then the current
directory. It reads regular JSON files of at most 1 MiB and executes no project code.
cli-run --doctor reads ./ai-orchestrator/bin/lanes.json when present, or --dir
for a custom rules folder. The health check executes the packaged runner.

Scaffolds preserve existing files. Check commands run only with checks run.
Use aunx install --help for the installer flags (or model-orchestrator --help).
Use aunx cli-run --help for the lane runner flags.
`;

function regular(path) {
  try { return lstatSync(path).isFile(); } catch { return false; }
}

// Run Node entry points directly, including on Windows. No command shell parses lane prompts.
export function runNode(path, args) {
  return new Promise(resolveExit => {
    const child = spawn(process.execPath, [path, ...args], { stdio: 'inherit' });
    const handlers = new Map();
    for (const signal of ['SIGINT', 'SIGTERM']) {
      const handler = () => { try { child.kill(signal); } catch {} };
      handlers.set(signal, handler);
      process.on(signal, handler);
    }
    const cleanup = () => { for (const [signal, handler] of handlers) process.removeListener(signal, handler); };
    child.once('error', error => { cleanup(); console.error(`aunx: ${error.message}`); resolveExit(2); });
    child.once('close', (code, signal) => { cleanup(); resolveExit(code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1)); });
  });
}

// dir stays undefined unless --dir is given explicitly: the project runner is
// opt-in, never a default guessed from the current directory (R1).
function runnerArgs(args) {
  const rest = [];
  let dir;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--') { rest.push(...args.slice(i)); break; }
    if (args[i] === '--dir' || args[i].startsWith('--dir=')) {
      if (dir !== undefined) throw new Error('duplicate --dir');
      dir = args[i] === '--dir' ? args[++i] : args[i].slice(6);
      if (!dir || dir.startsWith('--')) throw new Error('--dir needs a path');
    } else rest.push(args[i]);
  }
  return { dir: dir === undefined ? undefined : resolve(dir), rest };
}

export function scaffold(template, target) {
  const path = resolve(target);
  const parts = dirname(path).slice(parse(path).root.length).split(sep).filter(Boolean);
  let parent = parse(path).root;
  for (const part of parts) {
    parent = join(parent, part);
    try {
      const stat = lstatSync(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`scaffold parent must be a real directory: ${parent}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      mkdirSync(parent);
    }
  }
  try {
    writeFileSync(path, readFileSync(join(COMMON, template)), { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    console.log(`${basename(path)} already exists; kept it`);
    return 0;
  }
  console.log(`Created ${path}`);
  return 0;
}

function readChecks(path) {
  const config = JSON.parse(readRegularFile(path, MANIFEST_BYTE_CAP).toString('utf8'));
  if (!config || config.version !== 1 || !Array.isArray(config.checks) || !config.checks.length) throw new Error('expected version: 1 and a non-empty checks array');
  const ids = new Set();
  for (const check of config.checks) {
    if (!check || typeof check.id !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(check.id) || ids.has(check.id)) throw new Error('each check needs a unique id (letters, digits, _, . or -)');
    ids.add(check.id);
    if (check.manual !== true && !(typeof check.command === 'string' && check.command.trim()) && !(Array.isArray(check.command) && check.command.length && check.command.every(s => typeof s === 'string' && s.length > 0 && !s.includes('\0')))) throw new Error(`${check.id}: command must be a string or a non-empty argv array`);
    if (typeof check.command === 'string' && check.command.includes('\0')) throw new Error(`${check.id}: command contains a null byte`);
    if (check.cwd !== undefined && (typeof check.cwd !== 'string' || !check.cwd)) throw new Error(`${check.id}: cwd must be a path`);
    if (check.timeoutMs !== undefined && (!Number.isInteger(check.timeoutMs) || check.timeoutMs < 1 || check.timeoutMs > 3600000)) throw new Error(`${check.id}: timeoutMs must be between 1 and 3600000`);
  }
  return config.checks;
}

function runCheck(command, args, options, cwd, timeoutMs) {
  return new Promise(resolveCheck => {
    let child, timer, settled = false, timedOut = false, interrupted;
    const stop = () => {
      if (!child?.pid) return;
      try { killTree(child.pid); }
      catch { try { child.kill('SIGKILL'); } catch { /* already exited */ } }
    };
    const finish = (status, signal, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.off('SIGINT', onInterrupt);
      process.off('SIGTERM', onTerminate);
      stop();
      resolveCheck({ status, signal, error: timedOut ? { code: 'ETIMEDOUT' } : error, interrupted });
    };
    const onSignal = signal => { interrupted ||= signal; stop(); };
    const onInterrupt = () => onSignal('SIGINT');
    const onTerminate = () => onSignal('SIGTERM');
    process.on('SIGINT', onInterrupt);
    process.on('SIGTERM', onTerminate);
    try {
      child = spawn(command, args, { ...options, cwd, stdio: 'inherit', detached: process.platform !== 'win32' });
      child.once('error', error => finish(null, null, error));
      child.once('exit', (status, signal) => finish(status, signal));
      timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
      if (interrupted) stop();
    } catch (error) { finish(null, null, error); }
  });
}

export async function runChecks(file) {
  const path = resolve(file);
  // Validate the whole file before the first command can mutate anything.
  const checks = readChecks(path);
  let failed = false;
  for (const check of checks) {
    if (check.manual === true) {
      console.log(`FAIL ${check.id}: manual check is UNVERIFIED`);
      failed = true;
      continue;
    }
    const cwd = resolve(dirname(path), check.cwd || '.');
    let command, args, options = {};
    if (typeof check.command === 'string') {
      command = check.command;
      args = [];
      options.shell = true; // Explicit local shell program supplied by the checks file's author.
    } else {
      const argv = [...check.command];
      if (argv[0] === 'node') argv[0] = process.execPath;
      const plan = windowsSpawnPlan(argv);
      if (plan.refuse) {
        console.log(`FAIL ${check.id}: ${plan.refuse}`);
        failed = true;
        continue;
      }
      ({ command, args, options = {} } = plan);
    }
    const result = await runCheck(command, args, options, cwd, check.timeoutMs || 30000);
    const pass = !result.error && result.status === 0;
    failed ||= !pass;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${check.id}: ${result.error ? result.error.code : result.signal ? `signal ${result.signal}` : `exit ${result.status}`}`);
    if (result.interrupted) return result.interrupted === 'SIGINT' ? 130 : 143;
  }
  return failed ? 1 : 0;
}

// Unlike a runner lookup, this discovers data only. lstat plus O_NOFOLLOW
// refuses symlinks; an identity check and bounded read cover replacement/growth.
export function readManifestRoles({ dir, cwd = process.cwd() } = {}) {
  const candidates = [
    ...(dir === undefined ? [] : [join(resolve(cwd, dir), 'MANIFEST.json')]),
    join(cwd, 'ai-orchestrator', 'MANIFEST.json'),
    join(cwd, 'MANIFEST.json')
  ];
  const roleIds = new Set(ROLE_SPECS.map(spec => spec.id));
  for (const path of new Set(candidates)) {
    try {
      const manifest = JSON.parse(readRegularFile(path, MANIFEST_BYTE_CAP).toString('utf8'));
      const roles = manifest?.roles;
      if (!roles || typeof roles !== 'object' || Array.isArray(roles) || !Object.keys(roles).length) continue;
      if (Object.entries(roles).some(([id, role]) => !roleIds.has(id) || !role || typeof role !== 'object' || Array.isArray(role)
          || (role.ai !== null && (typeof role.ai !== 'string' || !role.ai))
          || !['main-agent', 'cli-run', 'subagent', 'manual', 'local', 'none'].includes(role.via)
          || ['agent', 'tier', 'command', 'why', 'reason'].some(key => role[key] !== undefined && typeof role[key] !== 'string'))) continue;
      return roles;
    } catch {
      // Missing, invalid, non-regular or unreadable JSON is an absent manifest.
    }
  }
  return null;
}

function stackSuggestion(assignment) {
  if (!assignment) return 'Your stack: none selected. Re-run the installer to assign this role.';
  const clean = value => String(value).replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  const reason = assignment.why || assignment.reason;
  if (!assignment.ai) return `Your stack: none selected${reason ? `. ${clean(reason)}` : '.'}`;
  const name = clean(byId[assignment.ai]?.name || assignment.ai);
  let via;
  if (assignment.command) via = '`' + clean(assignment.command.startsWith('cli-run ') ? `aunx ${assignment.command}` : assignment.command) + '`';
  else if (assignment.agent) via = '`' + clean(assignment.agent) + '` on your main agent';
  else via = { 'main-agent': 'your main agent', local: 'your local runtime', manual: 'manual handoff', subagent: 'a subagent', 'cli-run': 'cli-run' }[assignment.via];
  if (assignment.ai === 'claude-code' && assignment.via === 'cli-run' && assignment.command === 'cli-run claude' && assignment.preferredTransport === 'mcp') {
    via = `connected Claude worker MCP when available; fallback ${via}`;
  }
  return `Your stack: ${name}, via ${via || 'your selected tool'}${reason ? ` (${clean(reason)})` : ''}.`;
}

// Ordered by the action requested. These are suggestions, so the project rules remain authoritative.
export function suggestRoute(task) {
  const text = task.toLowerCase();
  const routes = [
    [/\b(verify|reproduce|validate|confirm|check)\b.*\b(findings?|reports?|bugs?)\b/, 'finding-verifier', 'working model', 'high', 'Reproduce each claim against the named evidence.', 'verify'],
    [/\b(definition[- ]of[- ]done|acceptance checks?|completion|finished|done)\b.*\b(check|verify|met|audit)\b|\b(check|verify)\b.*\b(done|complete|completion|acceptance)\b/, 'done-verifier', 'cheap model', 'low', 'Probe the stated definition of done.', 'verify'],
    [/\b(review|audit)\b/, 'code-reviewer', 'working model', 'high', 'Review the change and reproduce potential defects.', 'review'],
    [/\b(latest|current|live|news|search|browse|research|look up)\b/, 'live-researcher', 'working model', 'medium', 'Fetch current evidence before drawing a conclusion.', 'research'],
    [/\b(read(?:ing)?|summari[sz]e|digest|scan)\b.*\b(files|notes|documents|codebase|repo|folder)\b/, 'reader', 'cheap model', 'low', 'Read the requested files and return cited facts.', 'read'],
    [/\b(design|architect(?:ure)?|ambiguous|tradeoffs?|plan|strategy|unknown cause|find why|debug|diagnose|investigate)\b/, 'deep-planner', 'planning model', 'xhigh', 'Resolve the design and interfaces before building; use equivalent effort where xhigh is unavailable.', 'plan'],
    [/\b(rename|format|sort|classify|tag|bulk|mechanical|replace|lint)\b/, 'bulk-worker', 'cheap model', 'low', 'Apply a repeatable mechanical change.', 'bulk'],
    [/\b(build(?:ing)?|implement|code|fix|create|write|add|refactor)\b/, 'builder', 'working model', 'high', 'Build within a task brief and run its acceptance checks.', 'build']
  ];
  for (const [pattern, agent, tier, effort, reason, role] of routes) if (pattern.test(text)) return { agent, tier, effort, reason, role };
  return null;
}

export async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(HELP); return 0; }
  const [command, ...rest] = args;
  if (command === 'models') return modelsMain(rest);
  if (command === 'install') return runNode(join(ROOT, 'bin', 'cli.js'), rest);
  if (command === 'cli-run') {
    const parsed = runnerArgs(rest);
    if (parsed.rest.includes('--doctor')) {
      const here = join(parsed.dir || join(process.cwd(), 'ai-orchestrator'), 'bin');
      try {
        lstatSync(join(here, 'lanes.json'));
        return runnerMain(parsed.rest, { here });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      console.error('doctor: no installed lanes.json found; pass --dir PATH to inspect a custom rules folder.');
      return runnerMain(parsed.rest);
    }
    // The packaged runner is the default. A project's own runner only runs
    // when --dir names it explicitly (R1); this is the one place cli-run
    // dispatch can execute code from outside the package.
    if (parsed.dir !== undefined) {
      const local = join(parsed.dir, 'bin', 'cli-run.mjs');
      if (regular(local)) {
        console.error(`aunx: using project runner ${local}`);
        return runNode(local, parsed.rest);
      }
    }
    return runNode(join(ROOT, 'bin', 'cli-run.mjs'), parsed.rest);
  }
  if (command === 'route-metrics') {
    return runNode(join(ROOT, 'templates', 'agents', 'snippets', 'route-metrics.mjs'), rest.length ? rest : ['--summary']);
  }
  if (command === 'brief' && rest.length === 0) { process.stdout.write(readFileSync(join(COMMON, 'TASK_BRIEF.md'), 'utf8')); return 0; }
  if (['brief', 'context', 'checks'].includes(command)) {
    if (rest.length === 1 && ['--help', '-h'].includes(rest[0])) { console.log(HELP); return 0; }
    if (command === 'checks' && rest[0] === 'run') {
      if (rest.length > 2) throw new Error('usage: aunx checks run [PATH]');
      return runChecks(rest[1] || 'ACCEPTANCE_CHECKS.json');
    }
    const tail = rest[0] === 'new' ? rest.slice(1) : rest;
    if (tail.length > 1 || tail[0]?.startsWith('-')) throw new Error(`usage: aunx ${command} [new] [PATH]`);
    const template = { brief: 'TASK_BRIEF.md', context: 'CONTEXT.md', checks: 'ACCEPTANCE_CHECKS.json' }[command];
    return scaffold(template, tail[0] || template);
  }
  if (command === 'route') {
    if (rest.length === 1 && ['--help', '-h'].includes(rest[0])) { console.log(HELP); return 0; }
    const parsed = runnerArgs(rest);
    if (parsed.rest.length !== 1 || !parsed.rest[0].trim()) throw new Error('usage: aunx route [--dir PATH] "<task>"');
    const route = suggestRoute(parsed.rest[0]);
    const roles = readManifestRoles({ dir: parsed.dir });
    console.log(route ? `Suggestion: ${route.role} | tier: ${route.tier} | effort: ${route.effort}\nAgent: ${route.agent}\n${roles ? stackSuggestion(roles[route.role]) + '\n' : ''}${route.reason} Confirm against your ROUTING.md.` : 'Suggestion: unknown task category. Read your ROUTING.md and choose a route for the task.');
    if (!roles) console.log('No install found; run the installer or pass --dir to see who your stack assigns.');
    return 0;
  }
  if (command && !command.startsWith('-')) {
    throw new Error(`unknown aunx subcommand: ${command}\nAvailable subcommands: install, cli-run, route-metrics, brief, context, checks, route, models`);
  }
  return runNode(join(ROOT, 'bin', 'cli.js'), args);
}
