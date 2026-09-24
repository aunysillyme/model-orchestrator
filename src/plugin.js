// The Claude Code plugin bundle under plugin/. Every file this plans is
// generated from the templates the installer renders, so the plugin carries
// no second copy of an agent or a hook: `npm run gen:plugin` writes them and
// test/plugin.test.js fails when the committed bundle drifts from this plan.
// plugin/README.md and plugin/hooks/hooks.json are plugin-only and hand-owned.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render } from './render.js';
import { TEMPLATES, GENERATOR_VERSION, claudeAgentIds } from './install.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..');
export const PLUGIN_DIR = join(ROOT, 'plugin');
export const PLUGIN_NAME = 'model-orchestrator';
export const REPO_URL = 'https://github.com/aunysillyme/model-orchestrator';

// The installer's default --dir, and the rules file each level writes there:
// ROUTING.md at level 2 and 3, ORCHESTRATOR.md at level 1. Level 2 first, so
// a project that moved up a level reads the newer file.
export const DEFAULT_RULES = ['ai-orchestrator/ROUTING.md', 'ai-orchestrator/ORCHESTRATOR.md'];
export const DEFAULT_TASK_BUNDLE = 'ai-orchestrator/TASK_BUNDLE.md';

// route-metrics.mjs is not here on purpose: it appends a routing log to disk,
// and the plugin ships only hooks that read. `npx model-orchestrator` still
// installs it.
export const PLUGIN_HOOKS = ['route-gate.mjs', 'subagent-context.mjs'];

// Files in plugin/ that are written by hand, not by planPluginFiles().
export const HAND_OWNED = ['README.md', 'hooks/hooks.json'];

export function pluginVars() {
  return {
    PRIMARY_NAME: 'Claude Code',
    RULES_PATH_NOTE_COMMENT: '',
    // Plugin hooks retain their existing project-root-only environment access.
    RULES_DIR_OVERRIDE_JS: "''",
    RULES_FILE_REL: DEFAULT_RULES.join(' or '),
    RULES_FILE_REL_JSON: JSON.stringify(DEFAULT_RULES[0] + ' (' + DEFAULT_RULES[1] + ' on a level 1 install)'),
    TASK_BUNDLE_REL_JSON: JSON.stringify(DEFAULT_TASK_BUNDLE),
    RULES_CANDIDATES_JSON: JSON.stringify(DEFAULT_RULES),
    SETUP_HINT_JSON: JSON.stringify(
      'This project has no model-orchestrator routing rules yet. Running `npx model-orchestrator` in the project root writes them (' +
        DEFAULT_RULES[0] +
        '), and this hook reads them from the next prompt on. Until then, pick the lane yourself, and name that command if the user asks about routing.'
    ),
    SETUP_NOTICE_JSON: JSON.stringify(
      'model-orchestrator: this project has no routing rules yet, so the plugin has no routing table to inject. Run `npx model-orchestrator` in the project root to write them; the plugin reads them from your next prompt.'
    ),
    CONTEXT_SUFFIX_JSON: JSON.stringify(
      '\nThe model-orchestrator plugin installs the agents named above as model-orchestrator:<name>, for example model-orchestrator:builder.'
    )
  };
}

export function pluginManifest() {
  const n = claudeAgentIds().length;
  return {
    name: PLUGIN_NAME,
    version: GENERATOR_VERSION,
    description:
      'Routing for Claude Code: a hook injects your project\'s routing table on every prompt, so each task goes to the right subagent tier and fewer tokens go to the most expensive model. Ships ' +
      n +
      ' subagents across three model tiers.',
    author: { name: 'model-orchestrator maintainers', url: REPO_URL },
    homepage: REPO_URL + '#readme',
    repository: REPO_URL,
    license: 'MIT',
    keywords: ['routing', 'subagents', 'hooks', 'model-router', 'token-optimization', 'delegation']
  };
}

// Pure: reads templates, writes nothing. Paths are posix, relative to plugin/.
export function planPluginFiles() {
  const v = pluginVars();
  const files = [];
  files.push({ rel: '.claude-plugin/plugin.json', content: JSON.stringify(pluginManifest(), null, 2) + '\n' });
  for (const id of claudeAgentIds()) {
    files.push({ rel: 'agents/' + id + '.md', content: render(readFileSync(join(TEMPLATES, 'agents', 'claude-code', id + '.md'), 'utf8'), v) });
  }
  for (const hook of PLUGIN_HOOKS) {
    files.push({ rel: 'hooks/' + hook, content: render(readFileSync(join(TEMPLATES, 'agents', 'snippets', hook), 'utf8'), v) });
  }
  files.push({ rel: 'LICENSE', content: readFileSync(join(ROOT, 'LICENSE'), 'utf8') });
  return files;
}
