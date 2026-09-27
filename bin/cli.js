#!/usr/bin/env node
// model-orchestrator installer.
// Detects available AIs and previews a stack-specific setup for confirmation.
// Writes the matching files into a folder. It never writes a secret or runs a vendor
// shell script. Existing documents are preserved unless an update is requested.

import { stdin, stdout } from 'node:process';
import { makeAsker } from '../src/prompt.js';
import { resolve, join } from 'node:path';
import { which } from '../src/detect.js';
import { AIS, LEVELS, TOOLS, PROVIDERS, aisForLevel, agentCandidates, byId, npmSpec, summaryWithEvidence } from '../src/catalog.js';
import { planFiles, writeFiles, resolveSelection, resolveTools, resolveApis, dirProblems, readManifest, activationSteps, MACHINE_OWNED, RUNTIME, toPosixRel, GENERATOR_VERSION } from '../src/install.js';
import { uninstallFiles } from '../src/uninstall.js';
import { assertSnippetPrimary, planSnippetApplication } from '../src/apply-snippets.js';
import { assignRoles, inferPrimary, roleTable } from '../src/roles.js';

// One strict parse. Unknown flags, missing values and duplicates are usage
// errors (exit 2) before anything is planned, so a typo like --dryy can never
// turn a dry run into a real one.
const SPEC = {
  level: 'value', ais: 'value', primary: 'value', dir: 'value', project: 'value', tools: 'value', apis: 'value', plans: 'value',
  'apply-snippets': 'bool', yes: 'bool', force: 'bool', dry: 'bool', 'dry-run': 'bool', uninstall: 'bool', 'no-install': 'bool', 'no-tools': 'bool', 'no-apis': 'bool', 'effort-auto': 'bool', 'upgrade-runtime': 'bool', 'update-docs': 'bool', list: 'bool', help: 'bool', h: 'bool', version: 'bool', v: 'bool'
};
export function parseArgs(argv) {
  const out = {};
  const errors = [];
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    // The only single-dash forms, both bool: everything else stays strict, so a
    // typo cannot be silently absorbed as a short flag. `-h`/`-v` were listed in
    // SPEC before 0.1.9 but unreachable, because parsing required a `--` prefix.
    if (a === '-h') a = '--help';
    else if (a === '-v') a = '--version';
    if (!a.startsWith('--')) {
      errors.push(`unexpected argument: ${a}`);
      continue;
    }
    let name = a.slice(2);
    let inline = null;
    const eq = name.indexOf('=');
    if (eq !== -1) {
      inline = name.slice(eq + 1);
      name = name.slice(0, eq);
    }
    const kind = SPEC[name];
    if (!kind) {
      errors.push(`unknown flag: --${name}`);
      continue;
    }
    if (name in out) errors.push(`--${name} given more than once`);
    if (kind === 'bool') {
      if (inline !== null) errors.push(`--${name} takes no value`);
      out[name] = true;
    } else {
      let v = inline;
      if (v === null) {
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) {
          errors.push(`--${name} requires a value`);
          continue;
        }
        v = next;
        i++;
      }
      if (v === '') errors.push(`--${name} requires a non-empty value`);
      out[name] = v;
    }
  }
  return { out, errors };
}
const parsed = parseArgs(process.argv.slice(2));
if (parsed.errors.length) {
  console.error('model-orchestrator: ' + parsed.errors.join('; ') + '\nrun with --help');
  process.exit(2);
}
const flag = (name) => parsed.out[name] === true;
const opt = (name) => (typeof parsed.out[name] === 'string' ? parsed.out[name] : null);

// Answered before anything else is validated, so `--version` works from a
// broken or half-configured directory: the one question a user asks when they
// are about to file a bug must never depend on the rest of the run.
if (flag('version') || flag('v')) {
  console.log(GENERATOR_VERSION);
  process.exit(0);
}

if (flag('help') || flag('h')) {
  console.log(`model-orchestrator: set up a model router for the AIs you actually have.

Usage
  npx model-orchestrator                      interactive
  npx model-orchestrator --list               show the AI catalog and exit
  npx model-orchestrator --uninstall --dir <dir> --project <project>
  npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok [--primary claude-code] [--dir ./ai-orchestrator] [--project .]

Flags
  --level 1|2|3      1 beginner (one agent), 2 intermediate (many CLIs), 3 advanced (plus a VM)
  --ais a,b,c        catalog ids you have access to (see --list)
  --primary id       the main agent that runs the system and receives the subagents (any level). When several qualify
                     and --yes is set, the run picks one and says so in the plan; pass this to decide it yourself.
  --tools a,b        companion docs and snippets to set up, all optional (default: none)
  --apis a,b         level 3 only: metered API keys you HOLD (anthropic,openai,google,xai,openrouter); --no-apis for none.
                     Select these with --apis or the edit screen; a subscription is not an API key.
  --plans a=plan,b=plan  stated subscription plans for guidance; --plans none clears prior stated plans
  --effort-auto      consent to write auto effort defaults for selected high or max plan cli-run lanes
  --dir path         where to write the docs and protocols (default ./ai-orchestrator)
  --project path     the project root your agent runs from; subagent definitions go here (default: current directory,
                     so set it: a run from your home folder otherwise drops the subagent files there)
  --yes              skip confirmations; requires --level and --ais for a reproducible install
  --apply-snippets   apply Claude Code rules and hooks with timestamped backups (opt-in)
  --force            overwrite every file that already exists, documents included
  --upgrade-runtime  replace the runtime files (cli-run, the audit job, compose, gateway config, setup script) even
                     when they cannot be verified as untouched; documents are still kept
  --update-docs      regenerate the documents a previous run wrote and nobody edited since (hash-checked against
                     MANIFEST.json), so a changed selection reaches ROUTING.md and friends; edited documents are kept
                     and reported, and nothing happens without a manifest
  --uninstall        remove unedited managed files recorded in MANIFEST.json; keep and list edited files
  --dry, --dry-run   print the plan, write nothing
  --no-install       accepted for compatibility; installs always write only this package's files
  --no-tools         accepted for compatibility; companions default to none
  --list             print the catalog
  --version, -v      print the version and exit
  --help, -h         print this and exit
`);
  process.exit(0);
}

if (flag('list')) {
  for (const l of LEVELS) console.log(`level ${l.id}  ${l.name}: ${l.tagline}`);
  console.log('');
  for (const a of AIS) {
    const here = a.bin ? (which(a.bin) ? 'installed' : 'not on PATH') : 'app';
    const billing = { subscription: 'subscription lane', 'pay-per-token': 'pay-per-token lane', free: 'free lane', local: 'local lane' }[a.facts.billing];
    console.log(`${a.id.padEnd(13)} ${a.name}\n${''.padEnd(13)} level ${a.minLevel}+ · ${billing} · ${here}\n${''.padEnd(13)} ${summaryWithEvidence(a)}`);
    const install = a.install.npm
      ? 'npm install -g ' + npmSpec(a)
      : a.install.script
        ? `curl -fsSL ${a.install.script} -o /tmp/${a.id}-install.sh && less /tmp/${a.id}-install.sh && bash /tmp/${a.id}-install.sh`
        : a.install.url + (a.install.brew ? ` (or: brew install ${a.install.brew})` : '');
    console.log(`${''.padEnd(13)} install: ${install}\n${''.padEnd(13)} sign in: ${a.auth}`);
    if (a.plans) for (const p of a.plans) console.log(`${''.padEnd(13)} plan ${p.id}: ${p.name} (${p.headroom} headroom, checked ${p.checked}, ${p.source})`);
  }
  console.log('\nmetered API providers (--apis a,b, level 3 gateway only):');
  for (const prov of PROVIDERS) console.log(`${prov.id.padEnd(13)} ${prov.name}  (variable name: ${prov.envName})`);
  console.log('\ncompanion tools (--tools a,b), all optional:');
  for (const t of TOOLS) console.log(`${t.id.padEnd(13)} ${t.name}\n${''.padEnd(13)} ${t.role}\n${''.padEnd(13)} needs: ${t.requires}\n${''.padEnd(13)} ${t.optionalNote}\n${''.padEnd(13)} ${t.repo}`);
  process.exit(0);
}

const yes = flag('yes');
let rl = null;
const ask = (q, fallback) => (rl ? rl.ask(q, fallback) : Promise.resolve(fallback));

// Throws instead of exiting directly. Every call site outside the interactive
// edit screen has no handler in between, so the error rides the promise chain
// up to main().catch() below, which prints the same message and exits 2: flag
// validation and --yes keep their hard exit. Inside editSetup() a catch block
// takes the USAGE code as a signal to re-ask the same field instead of
// letting the process die on a typo (H1).
function bad(msg) {
  const err = new Error(msg);
  err.code = 'USAGE';
  throw err;
}

function plansFromIds(raw, selected) {
  if (raw === 'none') return {};
  const out = {};
  for (const part of raw.split(',')) {
    const [id, plan, ...extra] = part.split('=');
    if (!id || !plan || extra.length) bad(`--plans entry must be AI=plan: ${part}`);
    if (Object.hasOwn(out, id)) bad(`--plans names ${id} more than once`);
    const ai = byId[id];
    if (!ai) bad(`--plans names unknown AI id: ${id}`);
    if (!selected.includes(ai)) bad(`--plans names ${id}, which is not selected`);
    const found = (ai.plans || []).find((p) => p.id === plan);
    if (!found) bad(`--plans names unknown plan ${plan} for ${id}`);
    out[id] = found;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

function plansFromManifest(manifest, selected) {
  const raw = manifest && manifest.plans;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const pairs = Object.entries(raw).filter(([id]) => selected.some((ai) => ai.id === id));
  return pairs.length ? plansFromIds(pairs.map(([id, plan]) => `${id}=${plan}`).join(','), selected) : {};
}

function inferLevel(selected) {
  return Math.min(2, Math.max(1, selected.length >= 2 && selected.some((ai) => ai.facts.cliRun) ? 2 : 1, ...selected.map((ai) => ai.minLevel)));
}

// 0.1.35's --primary auto-pick (git show 20408a8:bin/cli.js), kept verbatim
// for --yes so a reproducible flag-only run never changes its main agent
// across a version bump (K1): claude-code first, else the first candidate
// that can load project agent definitions, else the first candidate in
// selection order. `inferPrimary`'s capability ranking is for the
// interactive default only.
export function legacyPrimary(candidates) {
  if (!candidates.length) return null;
  return candidates.find((ai) => ai.id === 'claude-code') || candidates.find((ai) => ai.facts.agentDefinitions) || candidates[0];
}

// Detection reads filesystem metadata only. A caller can supply the detector
// for deterministic tests; no detected vendor program is executed here.
export function inferSetup({ selected, detect = which } = {}) {
  const detected = new Set(AIS.filter((ai) => ai.bin && detect(ai.bin)).map((ai) => ai.id));
  const picks = selected || AIS.filter((ai) => detected.has(ai.id));
  return { detected, selected: picks, level: inferLevel(picks), primary: inferPrimary(agentCandidates(picks)) || null, tools: [], apis: [], plans: {}, effortAuto: [] };
}

function selectedFromIds(raw) {
  const { selected, unknown } = resolveSelection(raw.split(',').map((s) => s.trim()).filter(Boolean));
  if (unknown.length) bad('unknown AI id(s): ' + unknown.join(', ') + ' (see --list)');
  if (!selected.length) bad('pick at least one AI');
  return selected;
}

function numberedPicks(answer, available, noun) {
  if (answer.toLowerCase() === 'none') return [];
  const picked = answer.split(',').map((s) => s.trim()).filter(Boolean).map((number) => {
    const index = Number(number);
    const item = Number.isInteger(index) && index > 0 ? available[index - 1] : null;
    if (!item) bad(`no ${noun} numbered ${number}`);
    return item;
  });
  return [...new Set(picked)];
}

async function askAis(available, detected, selected = []) {
  console.log('\nWhich AIs do you have access to? (numbers, comma-separated; detected ones are marked)');
  available.forEach((ai, i) => console.log(`  ${String(i + 1).padStart(2)} ${detected.has(ai.id) ? '*' : ' '} ${ai.name}`));
  const fallback = available.map((ai, i) => selected.includes(ai) ? i + 1 : null).filter(Boolean).join(',');
  return numberedPicks(await ask(`\nYour picks${fallback ? ' [' + fallback + ']' : ''}: `, fallback), available, 'AI');
}

function eligibleEffort(selected, plans) {
  return selected.filter((ai) => ai.facts.cliRun && plans[ai.id] && ['high', 'max'].includes(plans[ai.id].headroom)).map((ai) => ai.id).sort();
}

function validateSetup(state) {
  if (![1, 2, 3].includes(state.level)) bad('level must be 1, 2 or 3');
  if (!state.selected.length) bad('pick at least one AI');
  const tooHigh = state.selected.filter((ai) => ai.minLevel > state.level);
  if (tooHigh.length) bad(`${tooHigh.map((ai) => ai.id).join(', ')} need level ${Math.max(...tooHigh.map((ai) => ai.minLevel))} or higher`);
  const candidates = agentCandidates(state.selected);
  if (!candidates.length) bad('pick at least one agent or chat app to be the orchestrator; a local model runtime on its own cannot run the system');
  if (!candidates.includes(state.primary)) bad('--primary must be one of: ' + candidates.map((ai) => ai.id).join(', '));
  if (state.level < 3 && state.apis.length) bad('--apis only applies at level 3 (the gateway)');
  const dirBad = dirProblems(state.dir);
  if (dirBad.length) bad(dirBad.join('; '));
  const projectBad = dirProblems(state.project);
  if (projectBad.length) bad('--project: ' + projectBad.join('; '));
}

// A typo here must never cost the user the whole session (H1): every field
// below re-asks itself on a bad answer instead of exiting, and every earlier
// answer stays put. `bad()`'s hard exit still applies to flags and --yes;
// only a USAGE error raised while THIS function is running is caught locally.
async function editSetup(state, sources) {
  while (true) {
    console.log('\nChange what?\n  1 level (1, 2 or 3; 3 needs an always-on Linux machine)\n  2 which AIs\n  3 main agent\n  4 companion tools\n  5 where the files go (folder and project root)\n  6 subscription plans' + (state.level === 3 ? '\n  7 level 3 API keys' : '') + '\n  0 nothing, back to the summary');
    const choice = await ask('\nNumber [0]: ', '0');
    if (choice === '0') return;
    if (choice === '1') {
      LEVELS.forEach((l) => console.log(`  ${l.id} ${l.name}: ${l.tagline}`));
      while (true) {
        const answer = Number(await ask(`Level [${state.level}]: `, String(state.level)));
        if ([1, 2, 3].includes(answer)) { state.level = answer; break; }
        console.log('Pick 1, 2 or 3.');
      }
      state.levelChosen = true;
      sources.delete('level');
    } else if (choice === '2') {
      while (true) {
        try { state.selected = await askAis(AIS, state.detected, state.selected); break; }
        catch (e) { if (!e || e.code !== 'USAGE') throw e; console.log(e.message); }
      }
      sources.delete('ais');
      if (!state.levelChosen) state.level = inferLevel(state.selected);
      if (!state.primaryChosen || !agentCandidates(state.selected).includes(state.primary)) {
        state.primary = inferPrimary(agentCandidates(state.selected)) || null;
        state.primaryChosen = false;
        sources.delete('primary');
      }
      state.plans = Object.fromEntries(Object.entries(state.plans).filter(([id]) => state.selected.some((ai) => ai.id === id)));
      state.effortAuto = state.effortAuto.filter((id) => state.selected.some((ai) => ai.id === id && ai.facts.cliRun));
    } else if (choice === '3') {
      const candidates = agentCandidates(state.selected);
      candidates.forEach((ai, i) => console.log(`  ${i + 1} ${ai.name}`));
      const fallback = String(candidates.indexOf(state.primary) + 1);
      while (true) {
        const answer = Number(await ask(`Main agent [${fallback}]: `, fallback));
        if (Number.isInteger(answer) && answer >= 1 && answer <= candidates.length) { state.primary = candidates[answer - 1]; break; }
        console.log(`Pick 1-${candidates.length}.`);
      }
      state.primaryChosen = true;
      sources.delete('primary');
    } else if (choice === '4') {
      console.log('Companion tools (optional): selecting one writes docs and config snippets. Install each project yourself.');
      TOOLS.forEach((tool, i) => console.log(`  ${i + 1} ${tool.name}: ${tool.role}\n    ${tool.requires}\n    ${tool.optionalNote}`));
      const fallback = TOOLS.map((tool, i) => state.tools.includes(tool) ? i + 1 : null).filter(Boolean).join(',') || 'none';
      while (true) {
        try { state.tools = numberedPicks(await ask(`Companions [${fallback}]: `, fallback), TOOLS, 'tool'); break; }
        catch (e) { if (!e || e.code !== 'USAGE') throw e; console.log(e.message); }
      }
      sources.delete('tools');
      sources.delete('no-tools');
    } else if (choice === '5') {
      while (true) {
        const dir = resolve(await ask(`Docs folder [${state.dir}]: `, state.dir));
        const problems = dirProblems(dir);
        if (!problems.length) { state.dir = dir; break; }
        console.log(problems.join('; '));
      }
      while (true) {
        const project = resolve(await ask(`Project root [${state.project}]: `, state.project));
        const problems = dirProblems(project);
        if (!problems.length) { state.project = project; break; }
        console.log(problems.join('; '));
      }
      sources.delete('dir');
      sources.delete('project');
    } else if (choice === '6') {
      const plans = {};
      for (const ai of state.selected.filter((candidate) => candidate.plans)) {
        const first = ai.plans[0];
        console.log(`\nWhich ${ai.vendor} plan? (checked ${first.checked}, source ${first.source})`);
        ai.plans.forEach((plan, i) => console.log(`  ${i + 1} ${plan.name} (${plan.headroom} headroom)`));
        console.log(`  ${ai.plans.length + 1} not sure`);
        const fallback = String(state.plans[ai.id] ? ai.plans.indexOf(state.plans[ai.id]) + 1 : ai.plans.length + 1);
        while (true) {
          const answer = Number(await ask(`Plan [${fallback}]: `, fallback));
          if (Number.isInteger(answer) && answer >= 1 && answer <= ai.plans.length + 1) {
            if (answer <= ai.plans.length) plans[ai.id] = ai.plans[answer - 1];
            break;
          }
          console.log(`Pick 1-${ai.plans.length + 1}.`);
        }
      }
      state.plans = plans;
      state.plansChosen = true;
      state.effortChosen = true;
      const eligible = eligibleEffort(state.selected, plans);
      state.effortAuto = eligible.length && /^y/i.test(await ask(`Size reasoning effort per task automatically on ${eligible.join(', ')}? [y/N] `, 'n')) ? eligible : [];
      sources.delete('plans');
      sources.delete('effort-auto');
    } else if (choice === '7' && state.level === 3) {
      console.log('Which metered API keys do you HOLD? A subscription is not an API key. Only variable names are written.');
      PROVIDERS.forEach((provider, i) => console.log(`  ${i + 1} ${provider.name} (${provider.envName})`));
      const fallback = PROVIDERS.map((provider, i) => state.apis.includes(provider) ? i + 1 : null).filter(Boolean).join(',') || 'none';
      while (true) {
        try { state.apis = numberedPicks(await ask(`Your keys [${fallback}]: `, fallback), PROVIDERS, 'provider'); break; }
        catch (e) { if (!e || e.code !== 'USAGE') throw e; console.log(e.message); }
      }
      sources.delete('apis');
      sources.delete('no-apis');
    } else {
      console.log('Pick a listed edit number.');
      continue;
    }
    // A single field can pass its own check and still leave the whole setup
    // inconsistent (e.g. a level dropped below what a still-selected AI
    // needs). Catch that here too: report it and go back to the menu instead
    // of exiting, so the user can fix whichever field caused it.
    try { validateSetup(state); return; }
    catch (e) { if (!e || e.code !== 'USAGE') throw e; console.log(e.message); }
  }
}

async function main() {
  if (flag('uninstall')) {
    const allowed = new Set(['uninstall', 'dir', 'project', 'dry', 'dry-run', 'yes']);
    const incompatible = Object.keys(parsed.out).filter((name) => !allowed.has(name));
    if (incompatible.length) bad(`--uninstall cannot be combined with ${incompatible.map((name) => '--' + name).join(', ')}`);
    const dir = resolve(opt('dir') || './ai-orchestrator');
    const project = resolve(opt('project') || '.');
    const dry = flag('dry') || flag('dry-run');
    const actions = uninstallFiles({ dir, project, dry });
    console.log(dry ? 'Uninstall preview (--dry): nothing changed.' : 'Uninstall complete.');
    for (const action of actions) console.log(action);
    console.log('\nManual steps: remove the pasted model-orchestrator block from CLAUDE.md and its merged hook entries from .claude/settings.json. Keep your other rules and hooks.');
    console.log(`Applied rules use <!-- model-orchestrator:start --> and <!-- model-orchestrator:end -->. Backups stay beside the originals: ${join(project, 'CLAUDE.md.bak-YYYYMMDDTHHMMSS')} and ${join(project, '.claude', 'settings.json.bak-YYYYMMDDTHHMMSS')}. Review backups before restoring them; later edits may need to be kept.`);
    console.log('For another main agent, remove its pasted activation block from its rules file.');
    return;
  }
  // Says what this generates, not what it guarantees. The old line promised
  // routing this package does not perform: lane choice is an instruction an
  // agent follows, never something enforced here (#11).
  console.log('\nmodel-orchestrator\nModel router for AI coding agents: installs routing rules, 8 subagents, hooks and a CLI runner so your AI picks model and effort per task and saves tokens\n');
  if (flag('no-install')) console.log('--no-install is no longer needed: the installer never runs a third-party install.');

  if (!yes) rl = makeAsker({ input: stdin, output: stdout });
  if (yes && ![1, 2, 3].includes(Number(opt('level')))) bad('--level must be 1, 2 or 3 when --yes is set');
  if (yes && !opt('ais')) bad('--ais is required with --yes (comma-separated ids, see --list)');
  if (flag('no-apis') && opt('apis')) bad('--no-apis and --apis contradict each other');

  console.log('Looking for AI tools on your PATH...');
  const setup = inferSetup({ selected: opt('ais') ? selectedFromIds(opt('ais')) : undefined });
  console.log('  found: ' + (AIS.filter((ai) => setup.detected.has(ai.id)).map((ai) => `${ai.bin} (${ai.name})`).join(', ') || 'none'));
  if (!setup.selected.length && !yes) {
    const available = opt('level') ? aisForLevel(Number(opt('level'))) : AIS;
    setup.selected = await askAis(available, setup.detected);
  }
  setup.level = opt('level') ? Number(opt('level')) : inferLevel(setup.selected);
  setup.primary = opt('primary') ? byId[opt('primary')]
    : (yes ? legacyPrimary(agentCandidates(setup.selected)) : inferPrimary(agentCandidates(setup.selected))) || null;
  setup.levelChosen = opt('level') !== null;
  setup.primaryChosen = opt('primary') !== null;
  setup.plansChosen = opt('plans') !== null;
  setup.effortChosen = flag('effort-auto');
  setup.dir = resolve(opt('dir') || './ai-orchestrator');
  setup.project = resolve(opt('project') || '.');
  if (opt('tools')) {
    const result = resolveTools(opt('tools').split(',').map((value) => value.trim()).filter(Boolean));
    if (result.unknown.length) bad('unknown tool id(s): ' + result.unknown.join(', ') + ' (see --list)');
    setup.tools = result.tools;
  }
  if (opt('apis')) {
    const result = resolveApis(opt('apis').split(',').map((value) => value.trim()).filter(Boolean));
    if (result.unknown.length) bad('unknown provider id(s): ' + result.unknown.join(', ') + ' (see --list)');
    setup.apis = result.apis;
    if (setup.level < 3) bad('--apis only applies at level 3 (the gateway)');
  }
  validateSetup(setup);

  let prev = readManifest(setup.dir);
  setup.plans = opt('plans') !== null ? plansFromIds(opt('plans'), setup.selected) : plansFromManifest(prev, setup.selected);
  let plansKept = opt('plans') === null && Object.keys(setup.plans).length > 0;
  setup.effortAuto = flag('effort-auto') ? eligibleEffort(setup.selected, setup.plans)
    : Array.isArray(prev?.effortAuto) ? prev.effortAuto.filter((id) => setup.selected.some((ai) => ai.id === id && ai.facts.cliRun)) : [];
  const sources = new Set(Object.keys(parsed.out));
  const applySnippets = flag('apply-snippets');
  let files;
  let plannedManifest;
  while (true) {
    validateSetup(setup);
    const { level, selected, primary, dir, project, tools, apis, plans, effortAuto, detected } = setup;
    if (applySnippets) assertSnippetPrimary(primary);
    files = planFiles({ level, selected, primary, dir, project, tools, apis, plans, effortAuto, detected, applySnippets });
    plannedManifest = JSON.parse(files.find((file) => file.rel === 'MANIFEST.json').content);
    if (applySnippets) files.push(...planSnippetApplication({ primary, project, files }));
    const lvl = LEVELS.find((entry) => entry.id === level);
    const candidates = agentCandidates(selected);
    const agentFiles = files.filter((file) => file.root === 'project');
    const projectKinds = [
      [agentFiles.filter((file) => primary?.facts.agentDefinitions && toPosixRel(file.rel).startsWith(primary.facts.agentDefinitions + '/')).length, 'subagents'],
      [agentFiles.filter((file) => toPosixRel(file.rel).startsWith('.claude/hooks/')).length, 'hooks']
    ].filter(([count]) => count).map(([count, kind]) => `${count} ${kind}`).join(' + ');
    const from = (key) => sources.has(key) ? ` (from --${key})` : '';
    const autoPrimary = !setup.primaryChosen && candidates.length > 1
      ? ` (chosen for you from ${candidates.map((ai) => ai.id).join(', ')}; pass --primary to decide it yourself)` : '';
    const detectedAccess = !sources.has('ais') && selected.every((ai) => detected.has(ai.id)) ? ' (detected on your PATH)' : '';
    const statedPlans = Object.entries(plans).map(([id, plan]) => `${id}=${plan.id}`).join(', ');
    console.log(`\nPlan\n  level    ${lvl.id} ${lvl.name}: ${lvl.tagline}${from('level')}\n  access   ${selected.map((ai) => ai.id).join(', ')}${from('ais')}${detectedAccess}\n  primary  ${primary.id}${from('primary')}${autoPrimary}\n  tools    ${tools.map((tool) => tool.id).join(', ') || 'none (companions are opt-in)'}${from('tools')}${from('no-tools')}\n  plans    ${statedPlans || 'not stated (your tools select the model)'}${from('plans')}`
      + (level >= 3 ? `\n  api keys ${apis.map((provider) => provider.id).join(', ') || 'none'}${from('apis')}${from('no-apis')}` : '')
      + (effortAuto.length || sources.has('effort-auto') ? `\n  auto effort ${effortAuto.join(', ') || 'none eligible'}${from('effort-auto')}` : '')
      + `\n  folder   ${dir}${from('dir')}\n  project  ${project}${projectKinds ? ' (' + projectKinds + ' go here)' : ''}${from('project')}\n  files    ${files.length}`);
    if (plansKept) console.log('  plans kept from the previous run');
    if (agentFiles.length && !sources.has('project')) console.log(`\nNote: --project defaults to the current directory, so the ${projectKinds} go to the current directory (${project}). Pass --project to put them somewhere else.`);
    const assignment = assignRoles({ selected, primary, detected, plans });
    const agents = Object.fromEntries(Object.entries(plannedManifest.roles || {}).filter(([, role]) => role.agent).map(([id, role]) => [id, role.agent]));
    console.log('\n' + roleTable(assignment, { selected, primary, detected, agents }));
    if (level >= 2 && !selected.some((ai) => ai.facts.cliRun)) console.log('\nWarning: no executable lanes selected; delegation is inactive. Use level 1 for a single-agent setup, or add a supported CLI. Doctor will exit 13 until a lane is enabled.');
    if (flag('dry') || flag('dry-run')) {
      for (const file of files) console.log('  - ' + (file.root === 'project' ? '[project] ' : '') + file.rel);
      if (applySnippets) {
        const preview = writeFiles(files, { dir, project, dry: true, force: flag('force'), upgradeRuntime: flag('upgrade-runtime'), updateDocs: flag('update-docs'), prevManifest: prev, backupExisting: true });
        for (const path of preview.written) console.log('  would write ' + path);
        for (const path of [...preview.skipped, ...preview.conflicts, ...preview.unverifiable, ...preview.docsConflict, ...preview.docsUnverifiable]) console.log('  would keep ' + path);
        for (const path of preview.backups) console.log('  would back up ' + path);
      }
      console.log('\n--dry: nothing written.');
      rl && rl.close();
      return;
    }
    if (yes) break;
    const go = (await ask('\nWrite these files?\n[Y/n/e]  (e to change anything above): ', 'y')).toLowerCase();
    if (go === 'y' || go === 'yes') break;
    if (go === 'e') {
      const oldDir = setup.dir;
      const oldPlans = setup.plans;
      await editSetup(setup, sources);
      if (setup.plans !== oldPlans) plansKept = false;
      if (oldDir !== setup.dir) {
        prev = readManifest(setup.dir);
        if (!setup.plansChosen) {
          setup.plans = plansFromManifest(prev, setup.selected);
          plansKept = Object.keys(setup.plans).length > 0;
        }
        if (!setup.effortChosen) setup.effortAuto = Array.isArray(prev?.effortAuto) ? prev.effortAuto.filter((id) => setup.selected.some((ai) => ai.id === id && ai.facts.cliRun)) : [];
      }
      continue;
    }
    if (go !== 'n' && go !== 'no') bad('answer y, n or e');
    console.log('Nothing written.');
    rl && rl.close();
    return;
  }
  const { level, selected, primary, dir, project, tools, apis, plans, effortAuto } = setup;

  // Reconfiguration: compare what a previous run recorded with what was asked now.
  const changed = prev
    ? ['level', 'primary'].filter((k) => String(prev[k]) !== String(k === 'level' ? level : primary ? primary.id : null))
        .concat(['ais', 'tools', 'apis'].filter((k) => JSON.stringify(prev[k] || []) !== JSON.stringify({ ais: selected, tools, apis }[k].map((x) => x.id))))
        .concat(JSON.stringify(prev.plans || {}) !== JSON.stringify(Object.fromEntries(Object.entries(plans).map(([id, p]) => [id, p.id]))) ? ['plans'] : [])
        .concat(JSON.stringify((prev.effortAuto || []).slice().sort()) !== JSON.stringify(effortAuto.slice().sort()) ? ['effortAuto'] : [])
        .concat(JSON.stringify(prev.roles || {}) !== JSON.stringify(plannedManifest.roles || {}) ? ['roles'] : [])
    : [];

  let written, skipped, upgraded, conflicts, unverifiable, docsUpdated, docsConflict, docsUnverifiable, docsRenamed;
  try {
    ({ written, skipped, upgraded, conflicts, unverifiable, docsUpdated, docsConflict, docsUnverifiable, docsRenamed } = writeFiles(files, { dir, project, force: flag('force'), upgradeRuntime: flag('upgrade-runtime'), updateDocs: flag('update-docs'), prevManifest: prev, backupExisting: applySnippets, onBackup: (path) => console.log('  backup ' + path) }));
  } catch (e) {
    if (e && e.code === 'PREFLIGHT') bad(e.message);
    throw e;
  }
  const ownedWritten = written.filter((w) => MACHINE_OWNED.has(toPosixRel(w)));
  console.log(`\nWrote ${written.length} file(s)` + (skipped.length ? `, kept ${skipped.length} existing:` : '.'));
  for (const s of skipped) console.log('  kept ' + s);
  const existingRuntime = files.filter((f) => f.root !== 'project' && RUNTIME.has(toPosixRel(f.rel))).length;
  if (prev || existingRuntime && (upgraded.length || conflicts.length || unverifiable.length) || docsUnverifiable.length) {
    console.log(`\nExisting installation found${prev ? ` (MANIFEST.json from generator ${prev.generatorVersion || 'pre-0.1.1'}, ${prev.generatedAt || 'undated'}; this run is ${GENERATOR_VERSION})` : ' (no MANIFEST.json: it predates 0.1.1)'}.`);
    if (prev) {
      if (changed.length) {
        console.log(`  selection changed: ${changed.join(', ')}`);
        console.log(`  applied: ${ownedWritten.join(', ') || 'nothing'} (machine-owned files are always rewritten, so the new lanes are live)`);
        if (changed.includes('roles')) console.log('  the role assignment changed; MANIFEST.json and aunx route are current. Any kept documents may still carry the previous assignment.');
      } else console.log('  selection identical.');
    }
    if (upgraded.length) console.log(`  runtime upgraded: ${upgraded.join(', ')} ${flag('upgrade-runtime') ? '(--upgrade-runtime: replaced whether or not you had edited them)' : '(each installed copy matched the hash of a previous run, so nobody had edited it)'}`);
    if (conflicts.length) {
      console.log(`  runtime CONFLICT, kept: ${conflicts.join(', ')}`);
      console.log('    these differ from what a previous run generated, so you edited them. The fixes in this release were NOT applied to them.');
      console.log('    Options: move your copy aside and re-run; or --upgrade-runtime to replace runtime files only; or --force to replace current generated files.');
    }
    if (unverifiable.length) {
      console.log(`  runtime kept, UNVERIFIABLE: ${unverifiable.join(', ')}`);
      console.log('    the previous install left no manifest, so it is not possible to tell whether you edited these. Executable fixes were NOT applied.');
      console.log('    Re-run with --upgrade-runtime to replace runtime files only (documents stay), or --force to replace everything.');
    }
    if (docsUpdated.length) console.log(`  documents updated: ${docsUpdated.join(', ')} (each matched the hash of a previous run, so nobody had edited them)`);
    if (docsRenamed.length) console.log(`  documents renamed: ${docsRenamed.join(', ')} (the old copy matched its installed hash)`);
    if (docsConflict.length) {
      console.log(`  document CONFLICT, kept: ${docsConflict.join(', ')}`);
      console.log('    these differ from what a previous run generated, so you edited them. Edit them by hand; --force replaces current generated paths. Edited legacy briefs stay.');
    }
    if (docsUnverifiable.length) {
      console.log(`  documents kept, UNVERIFIABLE: ${docsUnverifiable.join(', ')}`);
      console.log('    the previous install left no manifest, so --update-docs cannot tell your edits from generated text. --force replaces current generated paths. Unverifiable legacy briefs stay.');
    }
    if (skipped.length && prev && changed.length && !flag('update-docs')) console.log('  documents kept: they may describe the old selection. --update-docs regenerates the ones you have not edited; --force regenerates all of them (this overwrites your edits).');
  }

  // 6. Print manual setup commands for missing CLIs and selected companions.
  const missing = selected.filter((a) => a.bin && !which(a.bin));
  if (missing.length || tools.length) {
    console.log('\nInstall these yourself (binary presence checked; versions and companion setup need your verification):');
    for (const a of missing) {
      const command = a.install.npm
        ? 'npm install -g ' + npmSpec(a)
        : a.install.script
          ? `curl -fsSL ${a.install.script} -o /tmp/${a.id}-install.sh && less /tmp/${a.id}-install.sh && bash /tmp/${a.id}-install.sh`
          : a.install.brew ? `brew install ${a.install.brew}` : 'Follow the vendor setup guide';
      console.log(`  ${a.name}: ${command}\n    official guide: ${a.install.url || a.install.script}\n    sign in: ${a.auth}`);
    }
    for (const t of tools) {
      const doc = t.id.toUpperCase() + '.md';
      console.log(`  ${t.name}: ${t.install}\n    official guide: ${t.repo}\n    needs: ${t.requires}\n    ${t.optionalNote}\n    setup verification and other agents: ${join(dir, doc)}`);
    }
  }

  // 7. Activation summary: writing the folder is half the job. Say exactly what
  // turns it on, in order, with one command that proves it. The generated
  // README renders this same array, so the two surfaces cannot disagree (#20).
  const steps = activationSteps({ level, selected, primary, tools, dir, project, applySnippets });
  console.log('\nTo activate, in order:');
  steps.forEach((st, i) => console.log(`  ${i + 1}. ${st}`));
  console.log(`\nStart here: ${join(dir, 'README.md')} (written for level ${level} and the AIs you picked).`);
  console.log('\nIf this saved you time, a star helps people find it: https://github.com/aunysillyme/model-orchestrator\n');
  rl && rl.close();
}

import { realpathSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
function isEntryPoint() {
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
  } catch {
    return false;
  }
}
if (isEntryPoint()) main().catch((e) => {
  console.error('model-orchestrator: ' + (e && e.message ? e.message : e));
  process.exit(e && ['EOF', 'UNINSTALL', 'PREFLIGHT', 'USAGE'].includes(e.code) ? 2 : 1);
});
