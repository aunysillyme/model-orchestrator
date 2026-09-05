#!/usr/bin/env node
// model-orchestrator installer.
// Asks which level you want and which AIs you have access to, then writes the
// matching files into a folder. It never writes a secret, never runs a vendor
// shell script, and never overwrites a file you already have unless --force.

import { stdin, stdout } from 'node:process';
import { makeAsker } from '../src/prompt.js';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { which } from '../src/detect.js';
import { AIS, LEVELS, TOOLS, PROVIDERS, aisForLevel, agentCandidates, byId, npmSpec } from '../src/catalog.js';
import { planFiles, writeFiles, resolveSelection, resolveTools, resolveApis, dirProblems, readManifest, MACHINE_OWNED, RUNTIME, GENERATOR_VERSION } from '../src/install.js';

// One strict parse. Unknown flags, missing values and duplicates are usage
// errors (exit 2) before anything is planned, so a typo like --dryy can never
// turn a dry run into a real one.
const SPEC = {
  level: 'value', ais: 'value', primary: 'value', dir: 'value', project: 'value', tools: 'value', apis: 'value',
  yes: 'bool', force: 'bool', dry: 'bool', 'no-install': 'bool', 'no-tools': 'bool', 'no-apis': 'bool', 'upgrade-runtime': 'bool', list: 'bool', help: 'bool', h: 'bool'
};
export function parseArgs(argv) {
  const out = {};
  const errors = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
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

if (flag('help') || flag('h')) {
  console.log(`model-orchestrator: set up a model orchestrator for the AIs you actually have.

Usage
  npx model-orchestrator                      interactive
  npx model-orchestrator --list               show the AI catalog and exit
  npx model-orchestrator --yes --level 2 --ais claude-code,codex,grok [--primary claude-code] [--dir ./ai-orchestrator]

Flags
  --level 1|2|3      1 beginner (one agent), 2 intermediate (many CLIs), 3 advanced (plus a VM)
  --ais a,b,c        catalog ids you have access to (see --list)
  --primary id       level 1 only: the one agent that will run the system
  --tools a,b        companion tools to set up, all optional (default with --yes: codecalc only); --no-tools for none
  --apis a,b         level 3 only: metered API keys you HOLD (anthropic,openai,google,xai,openrouter); --no-apis for none.
                     Asked separately from the CLIs because a subscription is not an API key.
  --dir path         where to write the docs and protocols (default ./ai-orchestrator)
  --project path     the project root your agent runs from; subagent definitions go here (default: current directory)
  --yes              skip confirmations
  --force            overwrite every file that already exists, documents included
  --upgrade-runtime  replace the runtime files (cli-run, the audit job, compose, gateway config, setup script) even
                     when they cannot be verified as untouched; documents are still kept
  --dry              print the plan, write nothing
  --no-install       never offer to run npm installs
  --list             print the catalog
`);
  process.exit(0);
}

if (flag('list')) {
  for (const l of LEVELS) console.log(`level ${l.id}  ${l.name}: ${l.tagline}`);
  console.log('');
  for (const a of AIS) {
    const here = a.bin ? (which(a.bin) ? 'installed' : 'not on PATH') : 'app';
    console.log(`${a.id.padEnd(13)} ${a.name}\n${''.padEnd(13)} level ${a.minLevel}+ · ${a.access} · ${here}\n${''.padEnd(13)} ${a.role}`);
  }
  console.log('\nmetered API providers (--apis a,b, level 3 gateway only):');
  for (const prov of PROVIDERS) console.log(`${prov.id.padEnd(13)} ${prov.name}  (variable name: ${prov.envName})`);
  console.log('\ncompanion tools (--tools a,b), all optional:');
  for (const t of TOOLS) console.log(`${t.id.padEnd(13)} ${t.name}\n${''.padEnd(13)} ${t.role}\n${''.padEnd(13)} needs: ${t.requires}\n${''.padEnd(13)} ${t.optionalNote}\n${''.padEnd(13)} ${t.repo}`);
  process.exit(0);
}

const yes = flag('yes');
const rl = yes ? null : makeAsker({ input: stdin, output: stdout });
const ask = (q, fallback) => (rl ? rl.ask(q, fallback) : Promise.resolve(fallback));

function bad(msg) {
  console.error('model-orchestrator: ' + msg);
  process.exit(2);
}

async function main() {
  console.log('\nmodel-orchestrator\nRoute every task to the cheapest AI that does it well.\n');

  // 1. Level
  let level = Number(opt('level'));
  if (![1, 2, 3].includes(level)) {
    if (yes) bad('--level must be 1, 2 or 3 when --yes is set');
    console.log('Which level?');
    for (const l of LEVELS) console.log(`  ${l.id}  ${l.name}: ${l.tagline}`);
    level = Number(await ask('\nLevel [1]: ', '1'));
    if (![1, 2, 3].includes(level)) bad('level must be 1, 2 or 3');
  }

  // 2. Access
  const available = aisForLevel(level);
  let ids;
  if (opt('ais')) {
    ids = opt('ais').split(',').map((s) => s.trim()).filter(Boolean);
  } else {
    if (yes) bad('--ais is required with --yes (comma-separated ids, see --list)');
    console.log('\nWhich AIs do you have access to? (numbers, comma-separated; detected ones are marked)');
    available.forEach((a, i) => {
      const mark = a.bin && which(a.bin) ? '*' : ' ';
      console.log(`  ${String(i + 1).padStart(2)} ${mark} ${a.name}`);
    });
    const detected = available.map((a, i) => (a.bin && which(a.bin) ? i + 1 : null)).filter(Boolean);
    const fallback = detected.join(',');
    const answer = await ask(`\nYour picks${fallback ? ' [' + fallback + ']' : ''}: `, fallback);
    ids = answer
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => {
        const a = available[Number(n) - 1];
        if (!a) bad(`no AI numbered ${n}`);
        return a.id;
      });
  }
  const { selected, unknown } = resolveSelection(ids);
  if (unknown.length) bad('unknown AI id(s): ' + unknown.join(', ') + ' (see --list)');
  if (!selected.length) bad('pick at least one AI');
  const tooHigh = selected.filter((a) => a.minLevel > level);
  if (tooHigh.length) bad(`${tooHigh.map((a) => a.id).join(', ')} need level ${Math.max(...tooHigh.map((a) => a.minLevel))} or higher`);

  // 3. Primary agent (the one that runs the system)
  const candidates = agentCandidates(selected);
  let primary = null;
  if (opt('primary')) {
    primary = byId[opt('primary')];
    if (!primary || !candidates.includes(primary)) bad('--primary must be one of: ' + candidates.map((a) => a.id).join(', '));
  } else if (candidates.length === 1) {
    primary = candidates[0];
  } else if (candidates.length === 0) {
    bad('pick at least one agent or chat app to be the orchestrator; a local model runtime on its own cannot run the system');
  } else if (candidates.length > 1) {
    if (yes) primary = candidates.find((a) => a.id === 'claude-code') || candidates[0];
    else {
      console.log('\nWhich one is your primary agent (the one that runs the system)?');
      candidates.forEach((a, i) => console.log(`  ${i + 1}  ${a.name}`));
      const n = Number(await ask('\nPrimary [1]: ', '1'));
      primary = candidates[n - 1];
      if (!primary) bad('pick a listed number');
    }
  }

  // 3b. Companion tools (not AIs: things the AIs call)
  let tools = [];
  if (flag('no-tools') && opt('tools')) bad('--no-tools and --tools contradict each other');
  if (!flag('no-tools')) {
    if (opt('tools')) {
      const r = resolveTools(opt('tools').split(',').map((s) => s.trim()).filter(Boolean));
      if (r.unknown.length) bad('unknown tool id(s): ' + r.unknown.join(', ') + ' (see --list)');
      tools = r.tools;
    } else if (yes) {
      tools = TOOLS.filter((t) => t.recommended);
    } else {
      console.log('\nCompanion tools (all optional): things your agents call. Selecting one writes docs and config snippets; it installs nothing.');
      for (const t of TOOLS) {
        console.log(`\n  ${t.id}: ${t.role}\n    ${t.repo}\n    needs: ${t.requires}\n    ${t.optionalNote}`);
        const def = t.recommended ? 'y' : 'n';
        const a = await ask(`  Set up ${t.id}? [${t.recommended ? 'Y/n' : 'y/N'}]: `, def);
        if (/^y/i.test(a)) tools.push(t);
      }
    }
  }

  // 3c. Level 3: which metered API keys the user HOLDS. Separate from the CLI
  // question on purpose: a Claude Code plan is not an Anthropic API key.
  let apis = [];
  if (flag('no-apis') && opt('apis')) bad('--no-apis and --apis contradict each other');
  if (level >= 3 && !flag('no-apis')) {
    if (opt('apis')) {
      const r = resolveApis(opt('apis').split(',').map((s) => s.trim()).filter(Boolean));
      if (r.unknown.length) bad('unknown provider id(s): ' + r.unknown.join(', ') + ' (see --list)');
      apis = r.apis;
    } else if (!yes) {
      console.log('\nLevel 3 gateway: which metered API keys do you HOLD? (numbers, comma-separated, or none)');
      console.log('  This is separate from the CLIs above: a subscription is not an API key. Only variable NAMES are written; you keep the values in your secrets manager.');
      PROVIDERS.forEach((prov, i) => console.log(`  ${String(i + 1).padStart(2)}   ${prov.name}  (${prov.envName})`));
      const a = await ask('\nYour keys [none]: ', '');
      apis = a
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((n) => {
          const prov = PROVIDERS[Number(n) - 1];
          if (!prov) bad(`no provider numbered ${n}`);
          return prov;
        });
    }
  } else if (level < 3 && opt('apis')) {
    bad('--apis only applies at level 3 (the gateway)');
  }

  // 4. Targets: the docs folder, and the project root the agent runs from
  const dir = resolve(opt('dir') || (await ask('\nWrite docs and protocols into [./ai-orchestrator]: ', './ai-orchestrator')));
  const dirBad = dirProblems(dir);
  if (dirBad.length) bad(dirBad.join('; '));
  const project = resolve(opt('project') || (primary && primary.agentsDir && !yes ? await ask(`\nProject root your agent runs from (subagents go in ${primary.agentsDir}/ there) [.]: `, '.') : '.'));
  const projectBad = dirProblems(project);
  if (projectBad.length) bad('--project: ' + projectBad.join('; '));

  // 5. Plan
  const files = planFiles({ level, selected, primary, dir, project, tools, apis });
  const lvl = LEVELS.find((l) => l.id === level);
  const agentFiles = files.filter((f) => f.root === 'project');
  console.log(`\nPlan\n  level    ${lvl.id} ${lvl.name}\n  access   ${selected.map((a) => a.id).join(', ')}\n  primary  ${primary ? primary.id : 'none'}\n  tools    ${tools.map((t) => t.id).join(', ') || 'none'}` + (level >= 3 ? `\n  api keys ${apis.map((p) => p.id).join(', ') || 'none'}` : '') + `\n  folder   ${dir}\n  project  ${project}${agentFiles.length ? ' (' + agentFiles.length + ' subagent files go here)' : ''}\n  files    ${files.length}`);
  if (flag('dry')) {
    for (const f of files) console.log('  - ' + (f.root === 'project' ? '[project] ' : '') + f.rel);
    console.log('\n--dry: nothing written.');
    rl && rl.close();
    return;
  }
  const go = yes ? 'y' : await ask('\nWrite these files? [Y/n]: ', 'y');
  if (!/^y/i.test(go)) {
    console.log('Nothing written.');
    rl && rl.close();
    return;
  }

  // Reconfiguration: compare what a previous run recorded with what was asked now.
  const prev = readManifest(dir);
  const changed = prev
    ? ['level', 'primary'].filter((k) => String(prev[k]) !== String(k === 'level' ? level : primary ? primary.id : null))
        .concat(['ais', 'tools', 'apis'].filter((k) => JSON.stringify(prev[k] || []) !== JSON.stringify({ ais: selected, tools, apis }[k].map((x) => x.id))))
    : [];

  let written, skipped, upgraded, conflicts, unverifiable;
  try {
    ({ written, skipped, upgraded, conflicts, unverifiable } = writeFiles(files, { dir, project, force: flag('force'), upgradeRuntime: flag('upgrade-runtime'), prevManifest: prev }));
  } catch (e) {
    if (e && e.code === 'PREFLIGHT') bad(e.message);
    throw e;
  }
  const ownedWritten = written.filter((w) => MACHINE_OWNED.has(w));
  console.log(`\nWrote ${written.length} file(s)` + (skipped.length ? `, kept ${skipped.length} existing:` : '.'));
  for (const s of skipped) console.log('  kept ' + s);
  const existingRuntime = files.filter((f) => f.root !== 'project' && RUNTIME.has(f.rel)).length;
  if (prev || existingRuntime && (upgraded.length || conflicts.length || unverifiable.length)) {
    console.log(`\nExisting installation found${prev ? ` (MANIFEST.json from generator ${prev.generatorVersion || 'pre-0.1.1'}, ${prev.generatedAt || 'undated'}; this run is ${GENERATOR_VERSION})` : ' (no MANIFEST.json: it predates 0.1.1)'}.`);
    if (prev) {
      if (changed.length) {
        console.log(`  selection changed: ${changed.join(', ')}`);
        console.log(`  applied: ${ownedWritten.join(', ') || 'nothing'} (machine-owned files are always rewritten, so the new lanes are live)`);
      } else console.log('  selection identical.');
    }
    if (upgraded.length) console.log(`  runtime upgraded: ${upgraded.join(', ')} (each installed copy matched the hash of a previous run, so nobody had edited it)`);
    if (conflicts.length) {
      console.log(`  runtime CONFLICT, kept: ${conflicts.join(', ')}`);
      console.log('    these differ from what a previous run generated, so you edited them. The fixes in this release were NOT applied to them.');
      console.log('    Options: move your copy aside and re-run; or --upgrade-runtime to replace runtime files only; or --force to replace everything.');
    }
    if (unverifiable.length) {
      console.log(`  runtime kept, UNVERIFIABLE: ${unverifiable.join(', ')}`);
      console.log('    the previous install left no manifest, so it is not possible to tell whether you edited these. Executable fixes were NOT applied.');
      console.log('    Re-run with --upgrade-runtime to replace runtime files only (documents stay), or --force to replace everything.');
    }
    if (skipped.length && prev && changed.length) console.log('  documents kept: they may describe the old selection. --force regenerates them (this overwrites your edits), or edit them by hand.');
  }

  // 6. Installs, opt-in per CLI, npm only. Vendor scripts are printed, never run.
  const missing = selected.filter((a) => a.bin && !which(a.bin));
  if (missing.length) {
    console.log('\nNot found on this machine (presence is checked; installed versions are not validated):');
    for (const a of missing) {
      if (a.install.npm) {
        const spec = npmSpec(a); // the same pinned spec the table and the box script use
        const run = flag('no-install') || yes ? 'n' : await ask(`  ${a.name}: run \`npm install -g ${spec}\` now? [y/N]: `, 'n');
        if (/^y/i.test(run)) {
          const r = spawnSync('npm', ['install', '-g', spec], { stdio: 'inherit' });
          console.log(r.status === 0 ? `  installed ${spec}` : `  npm exited ${r.status}; install it by hand`);
        } else {
          console.log(`  ${a.name}: npm install -g ${spec}   (pinned to the version this installer was released with)`);
        }
      } else if (a.install.script) {
        console.log(`  ${a.name}: the vendor installer is a shell script. Download it, read it, then run it:\n      curl -fsSL ${a.install.script} -o /tmp/${a.id}-install.sh && less /tmp/${a.id}-install.sh && bash /tmp/${a.id}-install.sh`);
      } else {
        console.log(`  ${a.name}: ${a.install.url}` + (a.install.brew ? `  (or: brew install ${a.install.brew})` : ''));
      }
      console.log(`      sign in: ${a.auth}`);
    }
  }

  for (const t of tools) {
    const doc = t.id.toUpperCase() + '.md';
    console.log(`\n${t.name}\n  optional: ${t.optionalNote}\n  needs:    ${t.requires}\n  run:      ${t.install}\n  one-click or self-registering for: ${t.autoClients.join(', ')}. Other agents and the details: ${dir}/${doc}`);
  }

  // 7. Activation summary: writing the folder is half the job. Say exactly what
  // turns it on, in order, with one command that proves it.
  const snippet = files.find((f) => /\.snippet\.md$|^PASTE-INTO-YOUR-AGENT\.md$/.test(f.rel));
  const steps = [];
  if (snippet && primary && primary.rulesFile) steps.push(`copy the block in ${join(dir, snippet.rel)} into ${join(project, primary.rulesFile)} (create it if missing)`);
  else if (snippet) steps.push(`paste ${join(dir, snippet.rel)} into ${primary.name}'s custom instructions or Project`);
  if (primary && primary.agentsDir) steps.push(`subagents are in ${join(project, primary.agentsDir)}; run ${primary.bin} from ${project} to pick them up`);
  for (const a of selected.filter((a) => a.bin && a.kind === 'agent-cli')) steps.push(`sign in to ${a.name}: ${a.auth}`);
  for (const t of tools) steps.push(`${t.id}: ${t.install}`);
  if (level >= 2) steps.push(`smoke test: node ${join(dir, 'bin', 'cli-run.mjs')} --doctor   (add --run to send each lane one tiny prompt)`);
  if (level >= 3) steps.push(`box: read ${join(dir, 'vm', 'README.md')}; keys named in vm/ENVIRONMENT.md go in your secrets manager, never a file`);
  console.log('\nTo activate, in order:');
  steps.forEach((st, i) => console.log(`  ${i + 1}. ${st}`));
  console.log(`\nStart here: ${join(dir, 'README.md')} (written for level ${level} and the AIs you picked).\n`);
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
  process.exit(e && e.code === 'EOF' ? 2 : 1);
});
