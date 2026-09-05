import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync, readdirSync, statSync, lstatSync, unlinkSync, realpathSync } from 'node:fs';
import { join, dirname, relative, resolve, sep, parse as parsePath, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './render.js';
import { createHash } from 'node:crypto';
import { AIS, LEVELS, TOOLS, PROVIDERS, IMAGES, byId, toolById, providerById, npmSpec } from './catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const GENERATOR_VERSION = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).version;
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const TEMPLATES = join(HERE, '..', 'templates');
export const CLI_RUN_SRC = join(HERE, '..', 'bin', 'cli-run.mjs');

function walk(dir, base = dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p, base));
    else out.push({ abs: p, rel: relative(base, p) });
  }
  return out;
}

// A README.md at the ROOT of a template tier (beginner/, intermediate/,
// advanced/, agents/*) documents this repo's folder and is not installed.
// common/README.md is the exception: it is the user's start-here file.
// Deeper README.md files (protocols/, vm/) are installed, they index the
// folder they sit in.
function installable(sub, rel) {
  if (rel !== 'README.md') return true;
  return sub === 'common';
}

function table(rows, header) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

export function lanesTable(selected) {
  const rows = selected.map((a) => [
    a.name,
    a.lane === 'A' ? 'A (subscription, $0 per call)' : a.lane === 'B' ? 'B (metered)' : a.lane === 'local' ? 'local' : 'chat',
    a.role,
    a.cliRun ? '`cli-run ' + a.id + '`' : a.bin ? '`' + a.bin + '`' : 'the app'
  ]);
  return table(rows, ['AI', 'Lane', 'Wins at', 'Call it with']);
}

export function installTable(selected) {
  const rows = selected.map((a) => {
    const how = a.install.npm
      ? '`npm install -g ' + npmSpec(a) + '` (pinned; check for newer)'
      : a.install.script
        ? 'vendor script: ' + a.install.script
        : a.install.url;
    return [a.name, how, a.auth];
  });
  return table(rows, ['AI', 'Install', 'Sign in']);
}

// Gateway lanes come from the metered API keys the user said they HOLD, never
// from which subscription CLIs they selected: those are different entitlements.
// Only variable NAMES appear here. The installer never writes a value.
export function gatewayModels(selected, apis = []) {
  const lines = [];
  if (selected.some((a) => a.id === 'ollama')) {
    lines.push('  - model_name: local-small', '    litellm_params:', '      model: ollama/llama3.2:3b', '      api_base: http://ollama:11434');
  }
  for (const prov of apis) {
    for (const [alias, model] of prov.lanes) {
      lines.push(`  - model_name: ${alias}`, '    litellm_params:', `      model: ${model}`, `      api_key: os.environ/${prov.envName}`);
    }
  }
  if (!lines.length) lines.push('  # No provider key and no local runtime selected. Add one lane per provider here; keys stay in the environment.');
  return lines.join('\n');
}

export function envNames(selected, apis = []) {
  const names = new Set(apis.map((prov) => prov.envName));
  names.add('GATEWAY_MASTER_KEY');
  return [...names];
}

export function scriptInstallers(selected) {
  const lines = [];
  for (const a of selected) {
    if (a.install.script) lines.push(`say "  ${a.name}:  curl -fsSL ${a.install.script} -o /tmp/${a.id}-install.sh && less /tmp/${a.id}-install.sh && bash /tmp/${a.id}-install.sh"`);
    else if (a.install.url && a.kind !== 'chat') lines.push(`say "  ${a.name}:  ${a.install.url}"`);
  }
  return lines.length ? lines.join('\n') : 'say "  none"';
}

export function composeEnv(selected, apis = []) {
  // Pass-through of NAMES only. Compose substitutes each from the host environment.
  const rows = envNames(selected, apis)
    .filter((n) => n !== 'GATEWAY_MASTER_KEY')
    .map((n) => `      - ${n}=\${${n}:-}`);
  return rows.length ? rows.join('\n') : '      # no metered provider keys selected';
}

export function composeOllama(selected) {
  if (!selected.some((a) => a.id === 'ollama')) return '  # no local runtime selected';
  return [
    '  ollama:',
    `    image: ${IMAGES.ollama}`,
    '    container_name: ollama',
    '    restart: unless-stopped',
    '    ports:',
    '      - "127.0.0.1:11434:11434"',
    '    volumes:',
    '      - ollama:/root/.ollama',
    '',
    'volumes:',
    '  ollama: {}'
  ].join('\n');
}

// --dir is rendered into a bash script and a systemd unit. It is data there,
// never syntax: single-quoted for bash (the only character that needs care
// inside single quotes is the quote itself), and %-escaped for systemd, whose
// specifiers begin with %. Control characters and newlines are refused outright
// because no quoting convention survives them in both grammars.
export function shellQuote(v) {
  return "'" + String(v).replace(/'/g, "'\\''") + "'";
}
export function systemdEscape(v) {
  return String(v).replace(/%/g, '%%');
}
export function dirProblems(dir) {
  const abs = resolve(dir);
  const problems = [];
  if (/[\x00-\x1f\x7f]/.test(abs)) problems.push('the target path contains control characters or a newline');
  if (abs === parsePath(abs).root) problems.push('the target is the filesystem root; pick a folder');
  return problems;
}

// The lane the generated weekly audit calls: the first ENABLED cli-run lane
// in this preference order. None enabled means the job refuses at run time
// (exit 13) instead of calling a lane the installer disabled.
export const AUDIT_LANE_ORDER = ['hermes', 'qwen', 'codex', 'agy', 'grok'];
export function auditLane(selected) {
  const enabled = new Set(selected.filter((a) => a.cliRun).map((a) => a.id));
  return AUDIT_LANE_ORDER.find((l) => enabled.has(l)) || null;
}

// Everything ROUTING.md and RESEARCH_TRIAGE.md say about lanes is rendered
// from the lanes the user actually has. A generated manual must never
// recommend a command its own lanes.json disables.
export function laneVars(selected) {
  const has = (id) => selected.some((a) => a.id === id);
  const enabled = selected.filter((a) => a.cliRun).map((a) => a.id);
  const cr = (id) => '`cli-run ' + id + '`';
  const step0 = [];
  if (has('hermes')) step0.push(`${cr('hermes')} (the free tier) for rough drafts and divergent reads`);
  if (has('qwen')) step0.push(`${cr('qwen')} (the cheapest metered lane) for structured bulk, never for anything citing a line, number or source`);
  if (has('grok')) step0.push(`${cr('grok')} for X and live web reads at $0`);
  if (has('codex')) step0.push(`${cr('codex --audit')} for an adversarial read by a second model family`);
  if (has('agy')) step0.push(`${cr('agy')} for research sweeps and concurrent fan-out`);
  const stage1 = [];
  if (has('codex')) stage1.push(`${cr('codex')} for adversarial critique of the map`);
  if (has('grok')) stage1.push(`${cr('grok')} to verify current API behaviour instead of trusting recall`);
  if (has('hermes')) stage1.push(`${cr('hermes')} for a divergent read`);
  if (has('agy')) stage1.push(`${cr('agy')} for a wide sweep of prior art`);
  const examples = [];
  examples.push(has('grok') ? `| "What is trending on X today" | ${cr('grok')} |` : '| "What is trending on X today" | live-researcher (standard tier with web tools) |');
  examples.push(has('codex') ? `| "Audit this auth diff" | ${cr('codex --audit')} |` : '| "Audit this auth diff" | code-reviewer at deep tier, in a fresh context told to attack |');
  examples.push(has('qwen') ? `| "Classify these 200 items" | bulk-worker, or ${cr('qwen')} if the items may leave the machine |` : '| "Classify these 200 items" | bulk-worker |');
  examples.push(enabled.length >= 2 ? '| "Research this topic properly" | several engines in parallel, see `RESEARCH_TRIAGE.md` |' : '| "Research this topic properly" | deep tier plans, standard tier sweeps, a fresh context attacks; see `RESEARCH_TRIAGE.md` |');
  const roles = [];
  if (has('agy')) roles.push('| Web sweep | `cli-run agy` | widest landscape pass |');
  if (has('codex')) roles.push('| Adversarial read | `cli-run codex --audit` | attack the premise, hunt for what the others would get wrong |');
  if (has('grok')) roles.push('| Live data | `cli-run grok` | dated primary sources, real-time reads |');
  if (has('hermes')) roles.push('| Cheap divergent read | `cli-run hermes` | another opinion at $0 |');
  if (has('qwen')) roles.push('| Structured extraction | `cli-run qwen` | pull the facts into a table; never trust its citations without a check |');
  roles.push('| Triage + the durable record | the orchestrator | opens primary sources, marks every claim, writes the artifact |');
  const run = [];
  if (has('agy')) run.push('node bin/cli-run.mjs agy   --brief "$BRIEF" --timeout 900 > research/out-agy.md');
  if (has('codex')) run.push('node bin/cli-run.mjs codex --audit --brief "$BRIEF" --timeout 900 > research/out-codex.md');
  if (has('grok')) run.push('node bin/cli-run.mjs grok  --brief "$BRIEF" --timeout 900 > research/out-grok.md');
  if (has('hermes')) run.push('node bin/cli-run.mjs hermes --brief "$BRIEF" --timeout 900 > research/out-hermes.md');
  if (has('qwen')) run.push('node bin/cli-run.mjs qwen  --brief "$BRIEF" --timeout 900 > research/out-qwen.md');
  return {
    LANE_STEP0: step0.length ? step0.map((l) => '   - ' + l).join('\n') : '   - none selected yet: every task stays on your primary agent\'s tiers until you add a lane (re-run the installer with more AIs)',
    STAGE1_LANES: stage1.length ? '; ' + stage1.join(', ') : '',
    ATTACK_LANE: has('codex') ? '`cli-run codex --audit` (a second model family in a read-only sandbox)' : 'code-reviewer at deep tier, in a fresh context told to attack and allowed to answer CLEAN',
    LIVE_LANE: has('grok') ? '`cli-run grok` first ($0), then' : '',
    BULK_LANE: has('qwen') ? ', or `cli-run qwen` if the data may leave your machine' : has('hermes') ? ', or `cli-run hermes` for a free rough pass' : '',
    LANE_EXAMPLES: examples.join('\n'),
    RESEARCH_ROLES: roles.join('\n'),
    RESEARCH_RUN: run.length ? run.join('\n') : '# no cli-run lane selected: run the sweep on your primary agent, then a fresh adversarial turn (protocols/deep-research.md, level 1 shape)',
    RESEARCH_ENGINES: String(run.length)
  };
}

function vars(opts) {
  const { level, selected, primary } = opts;
  const tools = opts.tools || [];
  const apis = opts.apis || [];
  const lvl = LEVELS.find((l) => l.id === level);
  const lane = auditLane(selected);
  const codecalc = tools.some((t) => t.id === 'codecalc');
  const dirAbs = resolve(opts.dir || 'ai-orchestrator');
  const projectAbs = resolve(opts.project || process.cwd());
  let rulesPath = relative(projectAbs, dirAbs).split(sep).join(posix.sep);
  if (rulesPath === '') rulesPath = '.';
  else if (rulesPath.startsWith('..')) rulesPath = dirAbs; // outside the project: absolute is the only honest path
  const pinOf = (id) => (toolById[id] && toolById[id].pin) || 'latest';
  return {
    ...laneVars(selected),
    RULES_PATH: rulesPath,
    ROUTING_FILE: level >= 2 ? 'ROUTING.md' : 'ORCHESTRATOR.md',
    PROJECT_DIR: projectAbs,
    AGENTS_DIR: primary && primary.agentsDir ? join(projectAbs, primary.agentsDir) : 'none (your primary agent has no subagent folder)',
    LITELLM_IMAGE: IMAGES.litellm,
    OLLAMA_IMAGE: IMAGES.ollama,
    CODECALC_PIN: pinOf('codecalc'),
    OBSIDIAN_TC_PIN: pinOf('obsidian-tc'),
    APIS_LIST: apis.length ? apis.map((prov) => '- ' + prov.name + ' (`' + prov.envName + '`)').join('\n') : '- none: no metered provider key was selected, so the gateway serves only a local lane if you picked one',
    INSTALL_DIR: dirAbs,
    INSTALL_DIR_SH: shellQuote(dirAbs),
    INSTALL_DIR_SYSTEMD: systemdEscape(dirAbs),
    AUDIT_LANE: lane || 'none',
    // Enforced boundary per lane: codex has a read-only sandbox flag; the others
    // run with whatever their own config allows, and the script says so.
    AUDIT_LANE_FLAGS: lane === 'codex' ? '--audit' : '',
    AUDIT_LANE_BOUNDARY_NOTE: lane === 'codex'
      ? 'codex --audit, a read-only filesystem sandbox; commands and network follow the codex config'
      : lane
        ? `${lane} offers no sandbox flag cli-run can pass, so the denied-actions list is instruction-level only and enforcement is whatever ${lane}'s own permission config allows`
        : 'no lane selected',
    AUDIT_LANE_GUARD: lane
      ? ''
      : 'echo "weekly-audit: no cli-run lane was enabled at install time; enable one in bin/lanes.json and edit AUDIT_LANE" >&2; exit 13',
    TOOLS_LIST: tools.length ? tools.map((t) => '- ' + t.name + ': ' + t.role).join('\n') : '- none selected (re-run the installer with --tools codecalc to add the calculator and code runner)',
    CODECALC_STATUS: codecalc ? 'installed alongside this folder (see `CODECALC.md`)' : 'not selected; the rule below still binds, do the arithmetic with any tool that computes rather than guesses',
    OBSIDIAN_TC_STATUS: tools.some((t) => t.id === 'obsidian-tc') ? 'selected (see `OBSIDIAN-TC.md`); the tool names below are live calls' : 'not selected; the rule below still binds against whatever store you keep (a notes folder, a wiki, a repo of markdown), the tool names are what obsidian-tc would give you',
    DATE: new Date().toISOString().slice(0, 10),
    LEVEL_ID: String(level),
    LEVEL_NAME: lvl.name,
    LEVEL_TAGLINE: lvl.tagline,
    PRIMARY_ID: primary ? primary.id : 'none',
    PRIMARY_NAME: primary ? primary.name : 'your agent',
    PRIMARY_RULES_FILE: primary && primary.rulesFile ? primary.rulesFile : 'your agent\'s instructions file',
    PRIMARY_DEEP: primary && primary.models ? primary.models.deep : 'your strongest model',
    PRIMARY_STANDARD: primary && primary.models ? primary.models.standard : 'your everyday model',
    PRIMARY_FAST: primary && primary.models ? primary.models.fast : 'your cheapest model',
    AIS_LIST: selected.map((a) => '- ' + a.name + ': ' + a.role).join('\n'),
    AI_IDS: selected.map((a) => a.id).join(','),
    LANES_TABLE: lanesTable(selected),
    INSTALL_TABLE: installTable(selected),
    CLI_RUN_LANES: selected.filter((a) => a.cliRun).map((a) => a.id).join(', ') || 'none selected',
    GATEWAY_MODELS: gatewayModels(selected, apis),
    ENV_NAMES: envNames(selected, apis).map((n) => '- `' + n + '`').join('\n'),
    ENV_EXPORTS: envNames(selected, apis).map((n) => n + '=').join('\n'),
    NPM_PACKAGES: selected.map(npmSpec).filter(Boolean).join(' ') || '""',
    SCRIPT_INSTALLERS: scriptInstallers(selected),
    COMPOSE_ENV: composeEnv(selected, apis),
    COMPOSE_OLLAMA: composeOllama(selected)
  };
}

// Build the list of files this run would write. Pure: touches no disk except
// reading templates, so tests and --dry can inspect it.
export function planFiles(opts) {
  const { level, selected, primary } = opts;
  const v = vars(opts);
  const files = [];
  // root: 'dir' (the docs folder) or 'project' (where the agent actually looks for subagents)
  const add = (rel, content, mode, root = 'dir') => files.push({ rel, content, mode: mode || 0o644, root });
  const addTemplates = (sub) => {
    for (const f of walk(join(TEMPLATES, sub))) {
      if (!installable(sub, f.rel)) continue;
      const raw = readFileSync(f.abs, 'utf8');
      add(f.rel, render(raw, v));
    }
  };

  addTemplates('common');
  addTemplates('beginner');

  // The primary agent's own loading surface.
  if (primary && primary.id === 'claude-code') {
    for (const f of walk(join(TEMPLATES, 'agents', 'claude-code'))) {
      if (!installable('agents', f.rel)) continue;
      add(join('.claude', 'agents', f.rel), render(readFileSync(f.abs, 'utf8'), v), 0o644, 'project');
    }
    add('CLAUDE.snippet.md', render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'claude-code.md'), 'utf8'), v));
  } else if (primary && primary.id === 'agy') {
    for (const f of walk(join(TEMPLATES, 'agents', 'agy'))) {
      if (!installable('agents', f.rel)) continue;
      add(join('.agents', 'agents', f.rel), render(readFileSync(f.abs, 'utf8'), v), 0o644, 'project');
    }
    add('GEMINI.snippet.md', render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'generic.md'), 'utf8'), v));
  } else if (primary && primary.rulesFile) {
    add(primary.rulesFile.replace('.md', '.snippet.md'), render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'generic.md'), 'utf8'), v));
  } else if (primary) {
    add('PASTE-INTO-YOUR-AGENT.md', render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'chat.md'), 'utf8'), v));
  }

  for (const t of opts.tools || []) {
    if (existsSync(join(TEMPLATES, 'tools', t.id))) addTemplates(join('tools', t.id));
  }

  if (level >= 2) {
    addTemplates('intermediate');
    add(join('bin', 'cli-run.mjs'), readFileSync(CLI_RUN_SRC, 'utf8'), 0o755);
    add(
      join('bin', 'lanes.json'),
      JSON.stringify(
        {
          enabled: selected.filter((a) => a.cliRun).map((a) => a.id),
          note: 'Lanes cli-run may call. Edit to enable or disable a lane. A lane not listed here exits 13 (unavailable).'
        },
        null,
        2
      ) + '\n'
    );
  }

  if (level >= 3) {
    addTemplates('advanced');
  }

  // MANIFEST.json records the choices this run was generated from, the
  // generator version, and a hash of every file as generated, so a later run
  // can tell an untouched generated file (safe to upgrade) from one the user
  // edited (kept, reported as a conflict). Machine-owned: rewritten every run.
  const fileHashes = {};
  for (const f of files) fileHashes[(f.root === 'project' ? '[project] ' : '') + f.rel.split(sep).join('/')] = sha256(f.content);
  files.push({
    rel: 'MANIFEST.json',
    mode: 0o644,
    root: 'dir',
    content:
      JSON.stringify(
        {
          generator: 'model-orchestrator',
          generatorVersion: GENERATOR_VERSION,
          generatedAt: new Date().toISOString(),
          level,
          ais: selected.map((a) => a.id),
          primary: primary ? primary.id : null,
          tools: (opts.tools || []).map((t) => t.id),
          apis: (opts.apis || []).map((p) => p.id),
          dir: resolve(opts.dir || 'ai-orchestrator'),
          project: resolve(opts.project || process.cwd()),
          files: fileHashes,
          note: 'Machine-owned. Rewritten on every run together with bin/lanes.json. Edit the docs, not this.'
        },
        null,
        2
      ) + '\n'
  });

  return files;
}

// Every write is checked before any write happens:
//   containment  the resolved target stays inside --dir (template names are ours,
//                but a check is cheaper than trusting that forever)
//   no symlinks  no existing path component under --dir may be a symlink, so a
//                target/bin -> /elsewhere link cannot redirect a write
//   parent type  an existing component that must be a directory is one
// Then files are written with an exclusive create unless --force, and any file
// this run created is removed again if a later write fails.
// Resolve the target root through whatever part of it already exists. A
// symlinked ancestor (macOS /tmp -> /private/tmp, a user's ~/projects link) is
// the user's own choice and is followed; the resolved real path is what every
// containment check compares against. A root that exists and is not a
// directory is refused.
export function realRoot(dir) {
  const abs = resolve(dir);
  const missing = [];
  let cur = abs;
  while (!existsSync(cur)) {
    missing.unshift(cur.slice(dirname(cur).length + (dirname(cur).endsWith(sep) ? 0 : 1)));
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  const real = realpathSync(cur);
  return { root: missing.length ? join(real, ...missing) : real, exists: missing.length === 0 };
}

export function preflight(files, dir) {
  const problems = dirProblems(dir);
  if (problems.length) return problems;
  const { root, exists } = realRoot(dir);
  if (exists && !statSync(root).isDirectory()) return [`the target exists and is not a directory: ${resolve(dir)}`];
  for (const f of files) {
    const abs = resolve(root, f.rel);
    if (abs === root || !abs.startsWith(root + sep)) {
      problems.push(`${f.rel}: resolves outside the target directory`);
      continue;
    }
    const parts = relative(root, abs).split(sep);
    let cur = root;
    for (let i = 0; i < parts.length; i++) {
      cur = join(cur, parts[i]);
      let st;
      try {
        st = lstatSync(cur);
      } catch {
        break; // nothing below here exists yet
      }
      const last = i === parts.length - 1;
      if (st.isSymbolicLink()) {
        problems.push(`${f.rel}: ${relative(root, cur)} is a symlink`);
        break;
      }
      if (!last && !st.isDirectory()) {
        problems.push(`${f.rel}: ${relative(root, cur)} exists and is not a directory`);
        break;
      }
      if (last && !st.isFile()) {
        problems.push(`${f.rel}: exists and is not a regular file`);
        break;
      }
    }
  }
  return problems;
}

// Three classes of generated file.
//   MACHINE_OWNED  structured configuration: rewritten on every run so a new
//                  selection applies (MANIFEST.json, bin/lanes.json).
//   RUNTIME        executables and units: rewritten when the installed copy is
//                  byte-identical to what a previous run generated (the manifest
//                  hash proves nobody edited it), kept and reported as a conflict
//                  when it was edited, kept and reported as unverifiable when no
//                  manifest exists. --upgrade-runtime forces this class only.
//   documents      everything else: the user may have edited them; kept unless --force.
export const MACHINE_OWNED = new Set(['MANIFEST.json', 'bin/lanes.json']);
export const RUNTIME = new Set([
  'bin/cli-run.mjs',
  'vm/setup-vm.sh',
  'vm/docker-compose.yml',
  'vm/gateway.config.yaml',
  'vm/jobs/weekly-audit.sh',
  'vm/jobs/weekly-audit.service',
  'vm/jobs/weekly-audit.timer'
]);
export function fileClass(rel) {
  const r = rel.split(sep).join('/');
  if (MACHINE_OWNED.has(r)) return 'owned';
  if (RUNTIME.has(r)) return 'runtime';
  return 'document';
}

export function readManifest(dir) {
  try {
    const j = JSON.parse(readFileSync(join(resolve(dir), 'MANIFEST.json'), 'utf8'));
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

// Files carry a root: 'dir' for the docs folder, 'project' for the agent
// definitions the user's CLI reads from the project root. Each root gets its
// own preflight; one failure anywhere rolls back everything this run touched.
// Machine-owned files are always rewritten (they carry the selection); other
// existing documents are kept unless --force, or --update-docs for the ones a previous run wrote and nobody edited.
export function writeFiles(files, opts) {
  const { dir, force = false, dry = false, upgradeRuntime = false, updateDocs = false } = opts;
  const prevHashes = (opts.prevManifest && opts.prevManifest.files) || null;
  const roots = { dir, project: opts.project || dir };
  const groups = { dir: files.filter((f) => (f.root || 'dir') === 'dir'), project: files.filter((f) => f.root === 'project') };
  const problems = [];
  for (const k of ['dir', 'project']) {
    if (!groups[k].length) continue;
    problems.push(...preflight(groups[k], roots[k]).map((p) => (k === 'project' ? `[project] ${p}` : p)));
  }
  if (problems.length) {
    const e = new Error('refusing to write:\n  ' + problems.join('\n  '));
    e.code = 'PREFLIGHT';
    throw e;
  }
  const written = [];
  const skipped = [];
  const upgraded = [];      // runtime files replaced because the installed copy was an untouched generated one
  const conflicts = [];     // runtime files kept because the installed copy differs from what we generated
  const unverifiable = [];  // runtime files kept because there is no manifest to compare against
  const docsUpdated = [];   // --update-docs: documents regenerated because the installed copy was an untouched generated one
  const docsConflict = [];  // --update-docs: documents kept because you edited them
  const docsUnverifiable = []; // --update-docs: documents kept because there is no manifest to compare against
  const created = [];
  const originals = new Map(); // abs -> {content, mode} of files --force overwrote, restored on failure
  // Files that exist and were NOT rewritten this run. MANIFEST.json must record the hash of
  // what is on disk for them (the previous run's hash, or nothing when there was no manifest),
  // never the hash of content this run planned but did not write. Otherwise the next
  // --update-docs or upgrade sees every kept file as "edited".
  const keptKeys = new Set();
  try {
    // project first so MANIFEST.json (last in the dir group) is the final write and can
    // describe every decision made above it
    for (const k of ['project', 'dir']) {
      if (!groups[k].length) continue;
      const { root } = realRoot(roots[k]);
      for (const f of groups[k]) {
        const abs = resolve(root, f.rel);
        const exists = existsSync(abs);
        const label = k === 'project' ? '[project] ' + f.rel : f.rel;
        const key = (k === 'project' ? '[project] ' : '') + f.rel.split(sep).join('/');
        const cls = k === 'dir' ? fileClass(f.rel) : 'document';
        if (exists && !force) {
          if (cls === 'document') {
            // Documents are the user's. Without --update-docs they are never touched.
            // With it, the same hash rule the runtime class uses applies: regenerate
            // only what a previous run wrote and nobody edited since.
            if (!updateDocs) {
              skipped.push(label);
              keptKeys.add(key);
              continue;
            }
            const onDisk = sha256(readFileSync(abs));
            if (onDisk === sha256(f.content)) {
              skipped.push(label); // already current
              continue;
            }
            const prev = prevHashes ? prevHashes[key] : undefined;
            if (!prev) {
              docsUnverifiable.push(label);
              keptKeys.add(key);
              continue;
            }
            if (onDisk !== prev) {
              docsConflict.push(label);
              keptKeys.add(key);
              continue;
            }
            docsUpdated.push(label);
          }
          if (cls === 'runtime') {
            const onDisk = sha256(readFileSync(abs));
            if (onDisk === sha256(f.content)) {
              skipped.push(label); // already current
              continue;
            }
            if (!upgradeRuntime) {
              const prev = prevHashes ? prevHashes[key] : undefined;
              if (!prev) {
                unverifiable.push(label);
                keptKeys.add(key);
                continue;
              }
              if (onDisk !== prev) {
                conflicts.push(label);
                keptKeys.add(key);
                continue;
              }
            }
            upgraded.push(label); // untouched generated file, or --upgrade-runtime said replace it: either way it is reported
          }
        }
        let content = f.content;
        if (f.rel === 'MANIFEST.json' && keptKeys.size) {
          const m = JSON.parse(content);
          for (const kk of Object.keys(m.files || {})) {
            if (!keptKeys.has(kk)) continue;
            if (prevHashes && prevHashes[kk]) m.files[kk] = prevHashes[kk];
            else delete m.files[kk]; // never recorded: stays unverifiable, which is the truth
          }
          content = JSON.stringify(m, null, 2) + '\n';
        }
        if (!dry) {
          if (exists) originals.set(abs, { content: readFileSync(abs), mode: statSync(abs).mode });
          mkdirSync(dirname(abs), { recursive: true });
          writeFileSync(abs, content, { flag: exists ? 'w' : 'wx' });
          if (!exists) created.push(abs);
          chmodSync(abs, f.mode);
        }
        written.push(label);
      }
    }
  } catch (e) {
    for (const abs of created.reverse()) {
      try {
        unlinkSync(abs);
      } catch {
        /* best effort */
      }
    }
    for (const [abs, o] of originals) {
      try {
        writeFileSync(abs, o.content);
        chmodSync(abs, o.mode);
      } catch {
        /* best effort */
      }
    }
    throw e;
  }
  return { written, skipped, upgraded, conflicts, unverifiable, docsUpdated, docsConflict, docsUnverifiable };
}

export function resolveSelection(ids) {
  const selected = [];
  const unknown = [];
  for (const id of ids) {
    if (byId[id]) selected.push(byId[id]);
    else unknown.push(id);
  }
  return { selected, unknown };
}

export function resolveApis(ids) {
  const apis = [];
  const unknown = [];
  for (const id of ids) {
    if (providerById[id]) apis.push(providerById[id]);
    else unknown.push(id);
  }
  return { apis, unknown };
}

export function resolveTools(ids) {
  const tools = [];
  const unknown = [];
  for (const id of ids) {
    if (toolById[id]) tools.push(toolById[id]);
    else unknown.push(id);
  }
  return { tools, unknown };
}

export { AIS, LEVELS, TOOLS, PROVIDERS, IMAGES, npmSpec };
