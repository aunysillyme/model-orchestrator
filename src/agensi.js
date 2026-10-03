// Standalone packs share installer templates, with explicit setup slots instead
// of an assumed stack. Pure planner: reads sources and writes nothing.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIS } from './catalog.js';
import { render } from './render.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const AGENSI_DIR = join(ROOT, 'agensi');
export const PACK_NAMES = ['model-router-beginner', 'model-router-intermediate'];
export const AGENSI_VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const TEMPLATES = join(ROOT, 'templates');
const PUBLIC_SOURCE = 'https://github.com/aunysillyme/model-orchestrator/blob/main/';
const BRIEFS = ['TASK_BRIEF.md', 'CONTEXT.md', 'ACCEPTANCE_CHECKS.json', 'DECISIONS.md'];
const INTERMEDIATE_RULES = ['ROUTING.md', 'TIERS.md', 'DELEGATION_MATRIX.md', 'RESEARCH_TRIAGE.md', 'CLI-RUN.md'];

export function packLanes() {
  return {
    enabled: [],
    defaults: {},
    available: AIS.filter(ai => ai.facts.cliRun).map(ai => ai.bin),
    note: 'Fill at setup: add only verified installed CLI names from available to enabled. Every lane starts disabled. An unlisted lane exits 13.',
    defaultsNote: 'Unpinned: inherit each CLI configuration. Verify its current model and effort before a call. Flags override defaults. Qwen has no effort flag. Hermes provider selection requires a matching model. Doctor exits 13 until a lane is enabled.'
  };
}

// Each slot names the fact to probe or the selection rule to apply. No vendor
// model IDs, selected tools, dates or project-specific assignments are invented.
export function unconfiguredVars(level) {
  const role = job => `Fill at setup: ${job}`;
  const stack = '| Role | Tool and model | Selection evidence |\n|---|---|---|\n| Fill at setup: plan, build, review, verify, research, bulk, read, private | Fill at setup: verified user tools and current models, or none selected | Fill at setup: reach, family, permissions, billing and capacity |';
  const vars = {
    STACK_TABLE: stack,
    STACK_SUMMARY: '## Your stack: who does what\n\n' + stack + '\n\nUse SKILL.md first-run setup to fill this table from the user\'s real tools.',
    STACK_FALLBACK_NOTE: 'When a separate eligible lane is absent, the main agent handles the job at the appropriate tier. A same-family fresh-context review is a self-check. Independent review needs a verified different family; private work needs a verified local runtime.',
    STACK_GAPS: 'Fill at setup: name unavailable roles and access. Unknown capabilities remain UNVERIFIED; review and private roles remain none selected until verified.',
    PRIMARY_NAME: role('the user\'s main agent'),
    PRIMARY_DEEP: role('current planning model and supported effort'),
    PRIMARY_STANDARD: role('current working model and supported effort'),
    PRIMARY_FAST: role('current cheap model and supported effort'),
    READER_ROLE: role('reader with enough context and source access'),
    REVIEW_ROLE: role('reviewer from a known different model family, or report independent review pending'),
    PLANNER_ROLE: role('planner, preferring the main agent then largest verified context'),
    BUILDER_ROLE: role('builder with authorized writes and verified main-agent or headless access'),
    FINDING_ROLE: role('finding verifier with reproduction access'),
    DONE_ROLE: role('completion verifier with artifact access'),
    LIVE_ROLE: role('researcher with verified live tools'),
    BULK_ROLE: role('bounded worker, preferring eligible cheaper billing'),
    CODECALC_STATUS: 'optional, verify availability at setup; otherwise use the local runtime, spreadsheet or tests',
    OBSIDIAN_TC_STATUS: 'optional, verify availability at setup; otherwise use project files, search and version control',
    CONTEXT7_STATUS: 'optional, verify availability at setup; otherwise read official docs or installed source',
    DECISION_RULE5_L1: '8. **Build:** use the working model with high effort where supported; verify write reach and acceptance checks first.',
    DECISION_RULE5: '5. **Build:** use the verified builder with high effort where supported; raise to xhigh for architecture, security or irreversible work.',
    INLINE_THRESHOLD_NOTE: ' Keep small lookups local when dispatch adds no useful reach or capacity.',
    DELEGATE_RULES_NOTE: 'Before delegating, probe whether the worker loads project rules; supply any missing instructions explicitly.',
    ROUTE_GATE_SECTION: '## Loading the rules\n\nFill at setup: name the project instruction file or session-loading procedure that reads these rules. Verify it in a fresh session; this pack installs no hooks.',
    BUILDER_HANDOFF_NOTE: 'When dispatching, verify the builder\'s actual tools and project-rule loading; pass missing context explicitly.',
    ROLES_BUILDER_ROW: '| Fill at setup: authorized builder | Implement and verify its assigned section | Granted files and commands |',
    RESEARCH_SELECTION_ADVICE: 'choose verified live tools by question fit; run independent bounded questions together where useful, and record missing coverage.',
    GAP_ANALYSIS_LANE: role('independent coverage reviewer; do not claim independence without a different verified family'),
    LANES_TABLE: '| Tool | Models and family | Reach and permissions | Billing and headroom |\n|---|---|---|---|\n| Fill at setup: actual available tool | Fill at setup: probe current roster | Fill at setup: verified access | Fill at setup: local, free, subscription or metered |',
    PLAN_GUIDANCE: 'Fill at setup: verify the user\'s plans, quota and model availability. Unknown prices or capacity remain UNVERIFIED. Choose by job, complexity, stakes and reach; never assume a subscription permits unlimited work.',
    DATE: '(Fill at setup: date of the live probes)',
    AI_IDS: 'Fill at setup: user-selected tool identifiers',
    TASK_LANES_TABLE: stack,
    INSTALL_TABLE: 'Fill at setup: record verified CLI presence, sign-in and missing prerequisites. This pack runs no vendor installer or login flow; hand required account actions to the user.',
    COST_PLAYBOOK: 'Prefer eligible local, free, subscription, then pay-per-token routes. Verify current prices and headroom; do not spend outside the approved budget. Unknown pricing remains UNVERIFIED.',
    CLI_RUN_LANES: 'none enabled until setup; inspect bin/lanes.json available and enable only verified installed CLIs',
    LANE_STEP0: '0a. **Availability:** read the user\'s filled stack table and verify tools, permissions and headroom before dispatch.',
    BULK_LANE: '',
    FAN_OUT_ADVICE: ' Use fan-out only when a selected tool\'s live capabilities verify it.',
    LIVE_LANE: role('available research tool with verified live access'),
    ATTACK_LANE: role('different-family reviewer with scope and suitable effort'),
    WHO_BUILDS: 'When assigning a build, prefer the main agent with authorized writes, then an eligible headless CLI. Write the choice and evidence in briefs/DECISIONS.md.',
    CLAUDE_WORKER_TRANSPORT: '',
    METERED_CITATION_NOTE: ' Verify current provider rates before quoting costs.',
    PLAN_BIG_LINE: 'Use planning capability for unresolved decisions and scoped working capability for execution. ',
    ADD_ENDPOINT_ROW: '| Add an endpoint from an agreed specification | Fill at setup: verified builder, working model tier |',
    LANE_EXAMPLES: '| Fill at setup: project-specific task | Fill at setup: eligible lane, model and selection reason |',
    RESEARCH_ENGINES: 'Fill at setup: number of verified available',
    RESEARCH_ROLES: '| Fill at setup: bounded research question | Fill at setup: verified live tool | Inspect primary sources and return cited evidence |',
    RESEARCH_RUN: '# Fill at setup: replace <lane> with an enabled research CLI; repeat for independent questions.\nnode <skill-dir>/bin/cli-run.mjs <lane> --brief "$BRIEF"',
    EXAMPLE_LANE: '<lane>',
    EXAMPLE_EFFORT_FLAGS: ' --effort high',
    EXAMPLE_AUDIT_BLOCK: 'When using Codex for an authorized read-only review, use `node <skill-dir>/bin/cli-run.mjs codex --audit --brief TASK_BRIEF.md`. Other lanes require their own verified review permissions.',
    EXAMPLE_LANES_JSON: JSON.stringify(packLanes(), null, 2),
    QWEN_SAFE_MODE_NOTE: 'For Qwen, omit --effort; when required use its --safe-mode flag. '
  };
  for (const [key, job] of Object.entries({ PLANNER: 'planning', REVIEW: 'code review', FINDING: 'finding verification', BUILDER: 'building', LIVE: 'live research', BULK: 'bulk work', DONE: 'completion verification', READER: 'reading' })) {
    vars[`TIER_${key}_ROLE`] = role(`${job} tool and model`);
  }
  return vars;
}

// Rewrite only pack output. Installer templates retain their commands and paths.
function standalone(text) {
  return text
    .replace(/`aunx route "<task>"` prints a deterministic keyword suggestion; verify that suggestion against the task's scope, required tools and stakes before dispatching\./g, 'Apply the decision tree below to the task\'s scope, required tools and stakes before dispatching.')
    .replace(/, optionally starting with `aunx route "<task>"`/g, '')
    .replace(/When `aunx` runs,[^\n]+/g, 'Run `node <skill-dir>/bin/cli-run.mjs` from the user\'s project root, where `<skill-dir>` is the absolute path of the filled project copy; its lanes.json lives beside that script. Save the filled brief as TASK_BRIEF.md in the project root, or pass its absolute path.')
    .replace(/The manifest's `preferredTransport: "mcp"`[^\n]+/g, 'Record the verified transport in your filled stack table. This pack supplies no manifest or worker service.')
    .replace(/When using the installed script directly,[^\n]+/g, 'Run the bundled script from the filled project folder after enabling the chosen lane.')
    .replace(/^aunx cli-run[^\n]*\n/gm, '') // direct Node examples follow these wrapper examples
    .replace(/`aunx cli-run/g, '`node bin/cli-run.mjs')
    .replace(/ \(`aunx brief`\)/g, '')
    .replace(/`aunx brief`/g, 'the filled task brief')
    .replace(/ \(`aunx checks`\)/g, '')
    .replace(/scaffold the context file with `aunx context` and the acceptance checks with `aunx checks`/g, 'copy briefs/CONTEXT.md and briefs/ACCEPTANCE_CHECKS.json, fill their fields and run each approved verifier with the project runtime')
    .replace(/scaffold `CONTEXT.md` with `aunx context`/g, 'copy briefs/CONTEXT.md')
    .replace(/Scaffold a checks file with `aunx checks`/g, 'Copy briefs/ACCEPTANCE_CHECKS.json to the run\'s checks file')
    .replace(/Run `aunx checks run ACCEPTANCE_CHECKS.json` against the final artifact\. A failed command gives the gate exit code 1\./g, 'Run each approved command from ACCEPTANCE_CHECKS.json with the local runtime against the final artifact, using its cwd relative to the checks file. Record each exit code; any failed or unverified check leaves acceptance pending.')
    .replace(/Name the checks file when using `aunx checks run`/g, 'Name the checks file and run each approved verifier with the local runtime')
    .replace(/blocks the automated gate until replaced by a verifiable result/g, 'leaves acceptance pending until verified')
    .replace(/Replace the placeholder with a current vendor model ID before using this example\./g, "Before adding defaults, verify the lane's current vendor model and supported flags.")
    .replace(/- Checks run sequentially[^\n]+/g, '- Run approved checks sequentially and record their exit codes. Bound long runs with the project\'s supported timeout or supervisor; stop descendants on timeout or interruption and verify cleanup. Manual execution provides no automatic process cleanup or sandbox.')
    .replace(/rerun the installer with `--level 2`/g, 'use the intermediate pack and fill its stack table from verified tools')
    .replace(/Select Claude Code with installer ID `claude-code`/g, 'Identify Claude Code as `claude-code` in your stack table')
    .replace(/or re-run the installer with a supported CLI selected/g, 'or enable a verified installed CLI in the project copy of bin/lanes.json')
    .replace(/choose a supported CLI or use level 1/g, 'enable a verified CLI in the project copy of bin/lanes.json, or follow rules/ORCHESTRATOR.md as a single agent')
    .replace(/At level 2 and above, consider this selected lane:/g, 'When a second model family is available, consider this reviewer:');
}

function adaptPaths(text, rel, sources) {
  // Entrypoints are authored against the finished pack layout already.
  if (rel === 'SKILL.md') return text;
  // Markdown destinations resolve by their template location before remapping.
  text = text.replace(/(!?\[[^\]]*\]\()([^\s)]+)(\))/g, (all, start, target, end) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target)) return all;
    const [path, anchor = ''] = target.split('#');
    const source = posix.normalize(posix.join(posix.dirname(sources.get(rel)), path));
    const destination = [...sources].find(([, value]) => value === source)?.[0];
    return start + (destination ? posix.relative(posix.dirname(rel), destination) : PUBLIC_SOURCE + source) + (anchor ? '#' + anchor : '') + end;
  });
  // Templates use code spans for file pointers. Give those their new pack paths.
  const prefix = posix.relative(posix.dirname(rel), '.') || '.';
  const local = path => (prefix === '.' ? '' : prefix + '/') + path;
  text = text.replace(/`((?:protocols\/)?[A-Z][A-Z_-]*\.(?:md|json)|protocols\/[a-z-]+\.md|bin\/(?:cli-run\.mjs|lanes\.json))`/g, (all, path) => {
    let destination = path;
    if (BRIEFS.includes(path)) destination = 'briefs/' + path;
    else if (path === 'ORCHESTRATOR.md' || INTERMEDIATE_RULES.includes(path)) destination = 'rules/' + path;
    return '`' + local(destination) + '`';
  });
  // Shell examples execute from the project-copy root, not from rules/.
  // Worker CLIs inherit the cwd, so the runner is called from the user's project
  // root by the absolute pack path and the filled brief sits in that root.
  return text
    .replace(/`node (?:<skill-dir>\/)?bin\/cli-run\.mjs` or the installed `(?:\.\.\/)?bin\/cli-run\.mjs`/g, '`node <skill-dir>/bin/cli-run.mjs` from the user\'s project root')
    .replace(/node bin\/cli-run\.mjs/g, 'node <skill-dir>/bin/cli-run.mjs')
    .replace(/--brief briefs\/TASK_BRIEF\.md/g, '--brief TASK_BRIEF.md');
}

export function planAgensiFiles() {
  const files = [];
  for (const [index, pack] of PACK_NAMES.entries()) {
    const level = index + 1;
    const sources = new Map([
      ['SKILL.md', `templates/agensi/${level === 1 ? 'beginner' : 'intermediate'}/SKILL.md`],
      ['rules/ORCHESTRATOR.md', 'templates/beginner/ORCHESTRATOR.md'],
      ...BRIEFS.map(name => ['briefs/' + name, 'templates/common/' + name]),
      ...readdirSync(join(TEMPLATES, 'common', 'protocols')).sort().map(name => ['protocols/' + name, 'templates/common/protocols/' + name]),
      ...(level === 2 ? INTERMEDIATE_RULES.map(name => ['rules/' + name, 'templates/intermediate/' + name]) : [])
    ]);
    for (const [rel, source] of sources) {
      const raw = readFileSync(join(ROOT, source), 'utf8');
      const content = adaptPaths(standalone(render(raw, unconfiguredVars(level))), rel, sources);
      if (content.includes('{{') || /\baunx\b/.test(content)) throw new Error(`unresolved pack instruction: ${pack}/${rel}`);
      files.push({ rel: pack + '/' + rel, content });
    }
    files.push({ rel: pack + '/LICENSE', content: readFileSync(join(ROOT, 'LICENSE'), 'utf8') });
    if (level === 2) {
      files.push({ rel: pack + '/bin/cli-run.mjs', content: readFileSync(join(ROOT, 'bin/cli-run.mjs'), 'utf8') });
      files.push({ rel: pack + '/bin/lanes.json', content: JSON.stringify(packLanes(), null, 2) + '\n' });
    }
  }
  return files;
}
