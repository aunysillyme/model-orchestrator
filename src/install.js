import { readFileSync, existsSync, mkdirSync, writeFileSync, chmodSync, readdirSync, statSync, lstatSync, unlinkSync, realpathSync } from 'node:fs';
import { join, dirname, relative, resolve, sep, parse as parsePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './render.js';
import { AIS, LEVELS, TOOLS, byId, toolById } from './catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));
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
      ? '`npm install -g ' + a.install.npm + '`'
      : a.install.script
        ? 'vendor script: ' + a.install.script
        : a.install.url;
    return [a.name, how, a.auth];
  });
  return table(rows, ['AI', 'Install', 'Sign in']);
}

export function gatewayModels(selected) {
  // Only env var NAMES appear here. The installer never writes a value.
  const lines = [];
  const has = (id) => selected.some((a) => a.id === id);
  if (has('ollama')) {
    lines.push(
      '  - model_name: local-small',
      '    litellm_params:',
      '      model: ollama/llama3.2:3b',
      '      api_base: http://ollama:11434'
    );
  }
  if (has('qwen')) {
    lines.push(
      '  - model_name: bulk-cheap',
      '    litellm_params:',
      '      model: openrouter/qwen/qwen3.7-flash',
      '      api_key: os.environ/OPENROUTER_API_KEY'
    );
  }
  if (has('grok')) {
    lines.push(
      '  - model_name: live-fast',
      '    litellm_params:',
      '      model: xai/grok-4.1-fast',
      '      api_key: os.environ/XAI_API_KEY'
    );
  }
  if (has('claude-code') || has('claude-app')) {
    lines.push(
      '  - model_name: standard',
      '    litellm_params:',
      '      model: anthropic/claude-sonnet-5',
      '      api_key: os.environ/ANTHROPIC_API_KEY',
      '  - model_name: deep',
      '    litellm_params:',
      '      model: anthropic/claude-opus-5',
      '      api_key: os.environ/ANTHROPIC_API_KEY'
    );
  }
  if (has('codex') || has('chatgpt-app')) {
    lines.push(
      '  - model_name: second-opinion',
      '    litellm_params:',
      '      model: openai/gpt-5.6-terra',
      '      api_key: os.environ/OPENAI_API_KEY'
    );
  }
  if (has('agy') || has('gemini-app')) {
    lines.push(
      '  - model_name: long-context',
      '    litellm_params:',
      '      model: gemini/gemini-3.1-pro',
      '      api_key: os.environ/GEMINI_API_KEY'
    );
  }
  if (!lines.length) {
    lines.push('  # No provider selected. Add one lane per provider here; keys stay in the environment.');
  }
  return lines.join('\n');
}

export function envNames(selected) {
  const names = new Set();
  const has = (id) => selected.some((a) => a.id === id);
  if (has('qwen')) names.add('OPENROUTER_API_KEY');
  if (has('grok')) names.add('XAI_API_KEY');
  if (has('claude-code') || has('claude-app')) names.add('ANTHROPIC_API_KEY');
  if (has('codex') || has('chatgpt-app')) names.add('OPENAI_API_KEY');
  if (has('agy') || has('gemini-app')) names.add('GEMINI_API_KEY');
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

export function composeEnv(selected) {
  // Pass-through of NAMES only. Compose substitutes each from the host environment.
  return envNames(selected)
    .filter((n) => n !== 'GATEWAY_MASTER_KEY')
    .map((n) => `      - ${n}=\${${n}:-}`)
    .join('\n');
}

export function composeOllama(selected) {
  if (!selected.some((a) => a.id === 'ollama')) return '  # no local runtime selected';
  return [
    '  ollama:',
    '    image: ollama/ollama:latest',
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

function vars(opts) {
  const { level, selected, primary } = opts;
  const tools = opts.tools || [];
  const lvl = LEVELS.find((l) => l.id === level);
  const lane = auditLane(selected);
  const codecalc = tools.some((t) => t.id === 'codecalc');
  return {
    INSTALL_DIR: resolve(opts.dir || 'ai-orchestrator'),
    INSTALL_DIR_SH: shellQuote(resolve(opts.dir || 'ai-orchestrator')),
    INSTALL_DIR_SYSTEMD: systemdEscape(resolve(opts.dir || 'ai-orchestrator')),
    AUDIT_LANE: lane || 'none',
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
    GATEWAY_MODELS: gatewayModels(selected),
    ENV_NAMES: envNames(selected).map((n) => '- `' + n + '`').join('\n'),
    ENV_EXPORTS: envNames(selected).map((n) => n + '=').join('\n'),
    NPM_PACKAGES: selected.filter((a) => a.install.npm).map((a) => a.install.npm).join(' ') || '""',
    SCRIPT_INSTALLERS: scriptInstallers(selected),
    COMPOSE_ENV: composeEnv(selected),
    COMPOSE_OLLAMA: composeOllama(selected)
  };
}

// Build the list of files this run would write. Pure: touches no disk except
// reading templates, so tests and --dry can inspect it.
export function planFiles(opts) {
  const { level, selected, primary } = opts;
  const v = vars(opts);
  const files = [];
  const add = (rel, content, mode) => files.push({ rel, content, mode: mode || 0o644 });
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
      add(join('.claude', 'agents', f.rel), render(readFileSync(f.abs, 'utf8'), v));
    }
    add('CLAUDE.snippet.md', render(readFileSync(join(TEMPLATES, 'agents', 'snippets', 'claude-code.md'), 'utf8'), v));
  } else if (primary && primary.id === 'agy') {
    for (const f of walk(join(TEMPLATES, 'agents', 'agy'))) {
      if (!installable('agents', f.rel)) continue;
      add(join('.agents', 'agents', f.rel), render(readFileSync(f.abs, 'utf8'), v));
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

export function writeFiles(files, opts) {
  const { dir, force = false, dry = false } = opts;
  const problems = preflight(files, dir);
  if (problems.length) {
    const e = new Error('refusing to write:\n  ' + problems.join('\n  '));
    e.code = 'PREFLIGHT';
    throw e;
  }
  const { root } = realRoot(dir);
  const written = [];
  const skipped = [];
  const created = [];
  const originals = new Map(); // abs -> {content, mode} of files --force overwrote, restored on failure
  try {
    for (const f of files) {
      const abs = resolve(root, f.rel);
      const exists = existsSync(abs);
      if (exists && !force) {
        skipped.push(f.rel);
        continue;
      }
      if (!dry) {
        if (exists) originals.set(abs, { content: readFileSync(abs), mode: statSync(abs).mode });
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, f.content, { flag: exists ? 'w' : 'wx' });
        if (!exists) created.push(abs);
        chmodSync(abs, f.mode);
      }
      written.push(f.rel);
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
  return { written, skipped };
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

export function resolveTools(ids) {
  const tools = [];
  const unknown = [];
  for (const id of ids) {
    if (toolById[id]) tools.push(toolById[id]);
    else unknown.push(id);
  }
  return { tools, unknown };
}

export { AIS, LEVELS, TOOLS };
