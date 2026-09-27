import { spawn, spawnSync } from 'node:child_process';
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, parse, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { windowsSpawnPlan } from '../bin/cli-run.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const COMMON = join(ROOT, 'templates', 'common');
const HELP = `aunx: model router tools for AI coding agents

  aunx [installer flags]              Run the model-orchestrator installer
  aunx cli-run [--dir PATH] <args>     Run a lane; --dir names a project's own runner
  aunx route-metrics [--summary]      Read the local routing summary
  aunx brief [PATH]                   Print the task brief template, or scaffold it at PATH
  aunx brief new [PATH]               Create TASK_BRIEF.md
  aunx context [new] [PATH]           Create CONTEXT.md
  aunx checks [new] [PATH]            Create ACCEPTANCE_CHECKS.json
  aunx checks run [PATH]              Run local checks; exit 1 on any FAIL. checks run executes
                                       the commands in your checks file, so run it only on files you trust.
  aunx route "<task>"                 Suggest an agent, tier and effort

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
  writeFileSync(path, readFileSync(join(COMMON, template)), { flag: 'wx', mode: 0o600 });
  console.log(`Created ${path}`);
  return 0;
}

function readChecks(path) {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  let config;
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error('checks file must be a regular JSON file of at most 1 MiB');
    config = JSON.parse(readFileSync(fd, 'utf8'));
  } finally { closeSync(fd); }
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

export function runChecks(file) {
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
    const result = spawnSync(command, args, { ...options, cwd, stdio: 'inherit', timeout: check.timeoutMs || 30000, killSignal: 'SIGKILL' });
    const pass = !result.error && result.status === 0;
    failed ||= !pass;
    console.log(`${pass ? 'PASS' : 'FAIL'} ${check.id}: ${result.error ? result.error.code : result.signal ? `signal ${result.signal}` : `exit ${result.status}`}`);
  }
  return failed ? 1 : 0;
}

// Ordered by the action requested. These are suggestions, so the project rules remain authoritative.
export function suggestRoute(task) {
  const text = task.toLowerCase();
  const routes = [
    [/\b(verify|reproduce|validate|confirm|check)\b.*\b(findings?|reports?|bugs?)\b/, 'finding-verifier', 'working model', 'high', 'Reproduce each claim against the named evidence.'],
    [/\b(definition[- ]of[- ]done|acceptance checks?|completion|finished|done)\b.*\b(check|verify|met|audit)\b|\b(check|verify)\b.*\b(done|complete|completion|acceptance)\b/, 'done-verifier', 'cheap model', 'low', 'Probe the stated definition of done.'],
    [/\b(review|audit)\b/, 'code-reviewer', 'working model', 'high', 'Review the change and reproduce potential defects.'],
    [/\b(latest|current|live|news|search|browse|research|look up)\b/, 'live-researcher', 'working model', 'medium', 'Fetch current evidence before drawing a conclusion.'],
    [/\b(read(?:ing)?|summari[sz]e|digest|scan)\b.*\b(files|notes|documents|codebase|repo|folder)\b/, 'reader', 'cheap model', 'low', 'Read the requested files and return cited facts.'],
    [/\b(design|architect(?:ure)?|ambiguous|tradeoffs?|plan|strategy|unknown cause|find why|debug|diagnose|investigate)\b/, 'deep-planner', 'planning model', 'xhigh', 'Resolve the design and interfaces before building; use equivalent effort where xhigh is unavailable.'],
    [/\b(rename|format|sort|classify|tag|bulk|mechanical|replace|lint)\b/, 'bulk-worker', 'cheap model', 'low', 'Apply a repeatable mechanical change.'],
    [/\b(build(?:ing)?|implement|code|fix|create|write|add|refactor)\b/, 'builder', 'working model', 'high', 'Build within a task brief and run its acceptance checks.']
  ];
  for (const [pattern, agent, tier, effort, reason] of routes) if (pattern.test(text)) return { agent, tier, effort, reason };
  return null;
}

export async function main(args) {
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) { console.log(HELP); return 0; }
  const [command, ...rest] = args;
  if (command === 'install') return runNode(join(ROOT, 'bin', 'cli.js'), rest);
  if (command === 'cli-run') {
    const parsed = runnerArgs(rest);
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
    const local = join(process.cwd(), '.claude', 'hooks', 'route-metrics.mjs');
    return runNode(regular(local) ? local : join(ROOT, 'templates', 'agents', 'snippets', 'route-metrics.mjs'), rest.length ? rest : ['--summary']);
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
    if (rest.length !== 1 || !rest[0].trim()) throw new Error('usage: aunx route "<task>"');
    const route = suggestRoute(rest[0]);
    console.log(route ? `Suggestion: ${route.agent} | tier: ${route.tier} | effort: ${route.effort}\n${route.reason} Confirm against your ROUTING.md.` : 'Suggestion: unknown task category. Read your ROUTING.md and choose a route for the task.');
    return 0;
  }
  return runNode(join(ROOT, 'bin', 'cli.js'), args);
}
