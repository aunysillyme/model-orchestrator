#!/usr/bin/env node
// model-orchestrator installer.
// Asks which level you want and which AIs you have access to, then writes the
// matching files into a folder. It never writes a secret, never runs a vendor
// shell script, and never overwrites a file you already have unless --force.

import { stdin, stdout } from 'node:process';
import { makeAsker } from '../src/prompt.js';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { which } from '../src/detect.js';
import { AIS, LEVELS, TOOLS, aisForLevel, agentCandidates, byId } from '../src/catalog.js';
import { planFiles, writeFiles, resolveSelection, resolveTools, dirProblems } from '../src/install.js';

// One strict parse. Unknown flags, missing values and duplicates are usage
// errors (exit 2) before anything is planned, so a typo like --dryy can never
// turn a dry run into a real one.
const SPEC = {
  level: 'value', ais: 'value', primary: 'value', dir: 'value', tools: 'value',
  yes: 'bool', force: 'bool', dry: 'bool', 'no-install': 'bool', 'no-tools': 'bool', list: 'bool', help: 'bool', h: 'bool'
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
  --dir path         where to write (default ./ai-orchestrator)
  --yes              skip confirmations
  --force            overwrite files that already exist
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

  // 4. Target
  const dir = resolve(opt('dir') || (await ask('\nWrite into [./ai-orchestrator]: ', './ai-orchestrator')));
  const dirBad = dirProblems(dir);
  if (dirBad.length) bad(dirBad.join('; '));

  // 5. Plan
  const files = planFiles({ level, selected, primary, dir, tools });
  const lvl = LEVELS.find((l) => l.id === level);
  console.log(`\nPlan\n  level    ${lvl.id} ${lvl.name}\n  access   ${selected.map((a) => a.id).join(', ')}\n  primary  ${primary ? primary.id : 'none'}\n  tools    ${tools.map((t) => t.id).join(', ') || 'none'}\n  folder   ${dir}\n  files    ${files.length}`);
  if (flag('dry')) {
    for (const f of files) console.log('  - ' + f.rel);
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

  let written, skipped;
  try {
    ({ written, skipped } = writeFiles(files, { dir, force: flag('force') }));
  } catch (e) {
    if (e && e.code === 'PREFLIGHT') bad(e.message);
    throw e;
  }
  console.log(`\nWrote ${written.length} file(s)` + (skipped.length ? `, kept ${skipped.length} existing (use --force to overwrite):` : '.'));
  for (const s of skipped) console.log('  kept ' + s);

  // 6. Installs, opt-in per CLI, npm only. Vendor scripts are printed, never run.
  const missing = selected.filter((a) => a.bin && !which(a.bin));
  if (missing.length) {
    console.log('\nNot found on this machine:');
    for (const a of missing) {
      if (a.install.npm) {
        const run = flag('no-install') || yes ? 'n' : await ask(`  ${a.name}: run \`npm install -g ${a.install.npm}\` now? [y/N]: `, 'n');
        if (/^y/i.test(run)) {
          const r = spawnSync('npm', ['install', '-g', a.install.npm], { stdio: 'inherit' });
          console.log(r.status === 0 ? `  installed ${a.install.npm}` : `  npm exited ${r.status}; install it by hand`);
        } else {
          console.log(`  ${a.name}: npm install -g ${a.install.npm}`);
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
  console.log(`\nNext: open ${dir}/README.md. It is written for level ${level} and the AIs you picked.\n`);
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
