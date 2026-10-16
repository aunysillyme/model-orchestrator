import { existsSync } from 'node:fs';
import { join, relative, resolve, sep, posix } from 'node:path';
import { assignRoles, roleTable, inferPrimary } from '../roles.js';
import { LANE_FLAGS } from '../../bin/cli-run.mjs';
import { AIS, LEVELS, IMAGES, byId, toolById, npmSpec, summaryWithEvidence } from '../catalog.js';
import { companionRegistrationSteps } from '../apply-companions.js';
import { table } from './shared.js';
import { auditLane, stackContext, laneVars, subagentsLoadRules, claudeAgentIds, routeGateSection, decisionRule5, decisionRule5Beginner,
   whoBuildsSection, addEndpointRow, inlineThresholdNote, delegateRulesNote, planBigExecuteSmallLine, rolesBuilderRow, builderHandoffNote } from './routing.js';
import { shellQuote, systemdEscape } from './paths.js';

export function lanesTable(selected, plans = {}, primary = inferPrimary(selected)) {
  const { roles } = assignRoles({ selected, primary, plans });
  const rows = selected.map(a => [
    a.name,
    a.facts.billing,
    summaryWithEvidence(a),
    Object.entries(roles).filter(([, role]) => role.ai === a.id).map(([id]) => id).join(', ') || 'none',
    a.facts.cliRun ? '`cli-run ' + a.bin + '`' : a.bin ? '`' + a.bin + '`' : 'the app',
    plans[a.id] ? `${plans[a.id].name} (${plans[a.id].headroom} headroom)` : 'not stated'
  ]);
  return table(rows, ['AI', 'Lane', 'What it is', 'Assigned roles', 'Call it with', 'Plan']);
}

export function planGuidance(selected, plans = {}) {
  const lines = selected.filter((a) => plans[a.id]).map((a) => {
    const p = plans[a.id];
    const volume = p.headroom === 'base'
      ? ("Keep this base-headroom lane for short second opinions. If it is your main agent, delegate volume to " +
        "high or max headroom lanes.")
      : ("Use this high or max headroom lane for volume: scoped well-specified builds, first-pass research, " +
        "and pre-ship reviews through cli-run when its configured model family differs from the author's.");
    return ("- **" +
      `${a.name}` +
      ": " +
      `${p.name}` +
      " (" +
      `${p.headroom}` +
      " headroom).** " +
      `${volume}` +
      " Capability and independent-review rules are unchanged. Checked " +
      `${p.checked}` +
      ".");
  });
  return lines.length ? lines.join('\n') : ("State subscription plans with `--plans` to receive volume-allocation guidance. Capability and " +
    "independent-review rules stay unchanged.");
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
export function gatewayModels(selected, apis = [], models = null) {
  const lines = [];
  if (selected.some((a) => a.id === 'ollama')) {
    lines.push('  - model_name: local-small', '    litellm_params:', `      model: ${byId.ollama.gatewayModel}`, '      api_base: http://ollama:11434');
  }
  for (const prov of apis) {
    for (const [alias, model] of prov.lanes) {
      const resolvedModel = prov.id === 'anthropic' && models?.tiers[alias]?.model_id ? `anthropic/${models.tiers[alias].model_id}` : model;
      lines.push(`  - model_name: ${alias}`, '    litellm_params:', `      model: ${resolvedModel}`, `      api_key: os.environ/${prov.envName}`);
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
    if (a.install.script) lines.push(("say \"  " +
      `${a.name}` +
      ":  curl -fsSL " +
      `${a.install.script}` +
      " -o /tmp/" +
      `${a.id}` +
      "-install.sh && less /tmp/" +
      `${a.id}` +
      "-install.sh && bash /tmp/" +
      `${a.id}` +
      "-install.sh\""));
    else if (a.install.url && a.facts.kind !== 'chat') lines.push(`say "  ${a.name}:  ${a.install.url}"`);
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


// surfaces: planFiles writes the file, vars() names it in the generated README,
// and bin/cli.js prints it in the terminal. Before 0.1.12 the README hardcoded
// PASTE-INTO-YOUR-AGENT.md and named it for CLI installs that never got one (#20).
export function snippetFor(primary) {
  if (!primary) return null;
  return primary.rulesFile ? primary.rulesFile.replace(/\.md$/, '.snippet.md') : 'PASTE-INTO-YOUR-AGENT.md';
}

// The one primary-instruction step: copy into a known rules file, paste into a
// chat app's surface, or (Q3/Q5) load the block by hand for a CLI main agent
// the catalog has no project rules file for (Grok, Hermes today). Read by the
// terminal summary line, the activation list and the generated README's
// "where things went" section, so the three surfaces cannot describe three
// different things (#20).
export function primaryActivationStep({ primary, dir, project }) {
  const snippet = snippetFor(primary);
  if (!primary || !snippet) return null;
  const dirAbs = resolve(dir || 'ai-orchestrator');
  const projectAbs = resolve(project || process.cwd());
  if (primary.rulesFile) return `copy the block in ${join(dirAbs, snippet)} into ${join(projectAbs, primary.rulesFile)} (create it if missing)`;
  // A chat app has no possessive that survives its catalog note: "Claude app or
  // claude.ai (chat only, no CLI)'s custom instructions" was the sentence this
  // replaces (#22).
  if (primary.facts.kind === 'chat') return ("open " +
    `${primary.chatName || primary.name}` +
    " and paste the block in " +
    `${join(dirAbs, snippet)}` +
    " into its " +
    `${primary.chatSurface || 'custom instructions'}`);
  // A CLI with no cataloged project rules file: say plainly there is nothing
  // to write automatically, and name the accurate fallback (Q3). No verified
  // per-CLI loading convention is cataloged for Grok or Hermes, so this states
  // the honest generic fallback rather than guessing a mechanism.
  return (`${primary.name}` +
    " has no cataloged project rules file, so the installer has nothing to write for it; load the block " +
    "in " +
    `${join(dirAbs, snippet)}` +
    " at the start of a session with " +
    `${primary.name}`);
}

// The activation list, in order. The terminal prints this array at the end of a
// run and the generated README renders the same array, so the page cannot
// describe a different first step from the one the user just read (#20).
export function activationSteps(opts) {
  const { level, selected = [], primary } = opts;
  const tools = opts.tools || [];
  const dirAbs = resolve(opts.dir || 'ai-orchestrator');
  const projectAbs = resolve(opts.project || process.cwd());
  const steps = [];
  // Automatic application only ever covers a primary with a rulesFile; every
  // other case (no rulesFile, or applySnippets off) keeps the manual step.
  if (primary && !(primary.rulesFile && opts.applySnippets)) {
    const step = primaryActivationStep({ primary, dir: opts.dir, project: opts.project });
    if (step) steps.push(step);
  }
  // Only claude-code ships hooks (route-gate, subagent-context): the wiring
  // lives in a snippet, applied only when the user opts in.
  if (!opts.applySnippets && subagentsLoadRules(primary)) steps.push(("merge the hooks in " +
    `${join(dirAbs, 'settings.hooks.snippet.json')}` +
    " into " +
    `${join(projectAbs, '.claude', 'settings.json')}` +
    " (create it if missing) to wire the route-gate, subagent-context and route-metrics hooks"));
  for (const a of selected.filter((a) => a.bin && a.facts.kind === 'agent-cli')) {
    if (opts.authStatuses?.[a.id] === true) continue;
    steps.push(opts.authStatuses?.[a.id] === false
      ? `sign in to ${a.name}: ${a.auth}`
      : `${a.name}, if you have not signed in yet: ${a.auth}`);
  }
  // A local runtime has a bin but no sign-in, so the agent-cli loop above skips it
  // and before this it appeared in no ordered list at any level (#26).
  for (const a of selected.filter((a) => a.bin && a.facts.kind === 'local-runtime')) {
    // Q2/Q6: only print the install step when the runtime is not already on
    // PATH, and name the configured model instead of a placeholder.
    if (level < 3 && opts.detected?.has(a.id)) continue;
    steps.push(level >= 3
      ? (`${a.name}` +
        ": follow vm/README.md, then run `bash setup-vm.sh --start-services` in vm/ to pull the configured " +
        "model into its Compose service and verify local-small")
      : ("install " +
        `${a.name}` +
        ": " +
        `${a.install.url}` +
        ", then `" +
        `${a.bin}` +
        " pull " +
        `${a.gatewayModel.replace(/^ollama\//, '')}` +
        "` before the local lane can answer"));
  }
  steps.push(...companionRegistrationSteps({ ...opts, tools, dir: dirAbs, project: projectAbs }));
  if (level >= 3) steps.push(("box: read " +
    `${join(dirAbs, 'vm', 'README.md')}` +
    "; keys named in vm/ENVIRONMENT.md go in your secrets manager, never a file"));
  return steps;
}

// The verification list, in order. Gated on level for the same reason
// activationSteps is: level 1 writes no bin/, so a step naming cli-run.mjs or
// lanes.json there described an install that did not happen (#27).
export function proofSteps(opts) {
  const { level, primary, selected = primary ? [primary] : [] } = opts;
  const steps = [
    ("Start a fresh agent session and ask: \"Read the orchestrator instructions. Quote the routing rule you " +
      "will use, then sort pear, apple, banana alphabetically. Name the tier and whether you delegated.\""),
    ("Expect the cheap model tier and `apple, banana, pear`. If the agent cannot quote the routing rule, " +
      "check the snippet location or chat instructions before continuing. This is a manual activation " +
      "check, not proof that every future task follows the rules.")
  ];
  if (level >= 2) {
    steps.push(("Run `node bin/cli-run.mjs --doctor` from this folder, or `aunx cli-run --doctor` from your project " +
      "root. It checks binary presence, not authentication or loaded instructions, and prints the model and " +
      "effort each lane is pinned to. `--doctor --run` additionally uses a little quota to test live " +
      "responses. No enabled lanes means delegation is inactive."));
    steps.push(("Decide whether the route matters to you. Every lane starts unpinned, which means it runs on whatever " +
      "its own config file says: a CLI configured months ago at a low reasoning effort will keep auditing " +
      "at that effort while your docs describe something stronger. Pin it in `bin/lanes.json` under " +
      "`defaults`, or per call with `--model` and `--effort`. Either way the run is recorded in the log " +
      "with the value requested and where it came from."));
    if (selected.some(a => a.facts.cliRun)) {
      steps.push(("To test a real output contract, choose an enabled lane from `bin/lanes.json` and run `node " +
        "bin/cli-run.mjs <lane> 'Return only {\"sorted\":[\"apple\",\"banana\",\"pear\"]}' --expect-json`. The same " +
        "command is available as `aunx cli-run <lane>` with those arguments. This uses quota. Expect JSON and " +
        "exit 0; inspect the array yourself. A non-JSON response exits 10, a missing binary exits 13, and an " +
        "authentication failure reports the vendor error. The explicit lane tests execution; your main agent " +
        "still makes delegation decisions."));
    } else {
      steps.push(("Delegation is inactive: no supported CLI lane is selected, so `--doctor` will exit 13. Defer the " +
        "output-contract test until you select a supported CLI lane: re-run the installer with that lane in " +
        "`--ais` and `--update-docs`, then install it and sign in using the printed instructions."));
    }
  }
  // Only claude-code ships the route-gate hook, so only claude-code gets a
  // proof step that checks it fired: the table must come from the hook's
  // injected context, not from the agent reciting ROUTING.md from memory.
  if (subagentsLoadRules(primary)) {
    steps.push(("Ask the agent: \"Quote the route-gate table you were given this turn.\" It should quote the injected " +
      "table verbatim, not recite it from memory. If it cannot, the hooks snippet was not merged into " +
      "`.claude/settings.json`, or the hook found no rules file: check both before trusting the routing " +
      "docs are actually reaching the agent."));
  }
  return steps;
}

export function vars(opts) {
  const { level, selected, primary } = opts;
  const plans = opts.plans || {};
  const tools = opts.tools || [];
  const apis = opts.apis || [];
  const lvl = LEVELS.find((l) => l.id === level);
  const lane = auditLane(selected, primary);
  const assignment = assignRoles({ selected, primary, detected: opts.detected, plans, level });
  const stack = stackContext(selected, primary, opts.detected);
  const enabled = selected.filter(a => a.facts.cliRun);
  const exampleLane = enabled[0]?.bin || '<lane>';
  const exampleDefaults = { model: '<model-id>', ...(LANE_FLAGS[exampleLane]?.effort ? { effort: 'high' } : {}) };
  const auditExample = enabled.find(a => a.facts.readOnlyMode);
  const fallbackNote = ("When no separate lane qualifies, your main agent carries the job at its stated tier. Independent " +
    "review and local-only work require an eligible lane.");
  const gaps = assignment.unassigned.map(id => `${id}: ${assignment.roles[id].why}`).join(' ');
  const codecalc = tools.some((t) => t.id === 'codecalc');
  const dirAbs = resolve(opts.dir || 'ai-orchestrator');
  const projectAbs = resolve(opts.project || process.cwd());
  // dirPosix backs two things that must read the same on every host:
  //   1. INSTALL_DIR / INSTALL_DIR_SH / INSTALL_DIR_SYSTEMD (below), rendered
  //      into vm/jobs/weekly-audit.sh (bash) and vm/jobs/weekly-audit.service
  //      (a systemd unit) for the REMOTE Linux box, neither of which can run
  //      anywhere but Linux;
  //   2. rulesPath below when --dir falls outside --project, which is
  //      prose in generated markdown ("a dir outside the project renders an
  //      absolute path"), not a filesystem call.
  // An absolute --dir given as a bare POSIX path ("/opt/x") is never
  // re-resolved through this host's own path semantics for either: a real
  // Windows path always names a drive ("C:\...", caught by the `startsWith`
  // check below falling through to dirAbs), so a bare "/opt/x" only ever
  // means "a Linux path, or documentation text, verbatim" - resolving it
  // with plain path.resolve() reads that leading "/" as drive-relative on
  // win32 and silently turns it into a local path that does not exist,
  // on the box or in the doc. A relative --dir resolves against this
  // host's cwd exactly as before, which is already correct in the common
  // case: level 3 is normally installed by running this CLI ON the box,
  // where "this host" and "the box" are the same filesystem.
  const rawDir = opts.dir || 'ai-orchestrator';
  const dirPosix = rawDir.startsWith('/') ? posix.normalize(rawDir) : dirAbs;
  let rulesPath = relative(projectAbs, dirAbs).split(sep).join(posix.sep);
  if (rulesPath === '') rulesPath = '.';
  else if (rulesPath.startsWith('..')) rulesPath = dirPosix; // outside the project: absolute is the only honest path
  const rulesPathNote = rulesPath === dirPosix
    ? ("Moved the folder? Re-run the installer or set MODEL_ORCHESTRATOR_RULES_DIR to the rules folder for " +
      "the hooks, and update the paths in your agent instructions.")
    : '';
  const pinOf = (id) => (toolById[id] && toolById[id].pin) || 'latest';
  const snippet = snippetFor(primary);
  const steps = activationSteps({ level, selected, primary, tools, dir: opts.dir, project: opts.project, applySnippets: opts.applySnippets,
     authStatuses: opts.authStatuses, registrations: opts.registrations, detected: opts.detected });
  const proofs = proofSteps({ level, primary, selected });
  const routingFile = level >= 2 ? 'ROUTING.md' : 'ORCHESTRATOR.md';
  // The path route-gate.mjs and subagent-context.mjs resolve at runtime,
  // relative to CLAUDE_PROJECT_DIR. Mirrors the RULES_PATH fallback below:
  // outside the project, the honest path is absolute, never a hardcoded one.
  const relJoin = (name) => (rulesPath === dirPosix ? posix.join(dirPosix, name) : rulesPath === '.' ? name : rulesPath + '/' + name);
  const rulesFileRel = relJoin(routingFile);
  const taskBriefRel = relJoin('TASK_BRIEF.md');
  // Only claude-code and agy put files under the project root. A chat primary
  // puts nothing there, so naming a project root would name a folder this run
  // never created (#21).
  const writesProject = !!(primary && primary.facts.agentDefinitions);
  const readsProjectRules = !!(primary && primary.rulesFile);
  const whereThingsWent = [`- This folder: \`${dirAbs}\``];
  if (writesProject) whereThingsWent.push(`- Project root (where your agent reads rules and subagents): \`${projectAbs}\``,
     `- Subagent definitions: \`${join(projectAbs, primary.facts.agentDefinitions)}\``);
  else if (readsProjectRules) whereThingsWent.push(
    `- Project root (where ${primary.name} reads \`${primary.rulesFile}\`): \`${projectAbs}\``
      + (opts.applySnippets || existsSync(projectAbs)
        ? '' : ' (this run wrote nothing there; create the folder before you copy the snippet in)'),
    '- Subagent definitions: none, this agent has no subagent folder'
  );
  // Q5: a CLI with no cataloged project rules file (Grok, Hermes) is not a
  // chat app, so it gets its own accurate sentence instead of borrowing theirs.
  else if (primary && primary.facts.kind !== 'chat') whereThingsWent.push(("- Project root: none. " +
    `${primary.name}` +
    " has no cataloged project rules file, so this install wrote nothing to a project folder; load the " +
    "block by hand each session."), '- Subagent definitions: none');
  else whereThingsWent.push(("- Project root: none. A chat app reads pasted instructions, not files, so this install wrote nothing " +
    "to a project folder."), '- Subagent definitions: none');
  whereThingsWent.push(`- The rules path your snippets use: \`${rulesPath}\``);
  whereThingsWent.push(rulesPathNote
    ? '- Rules location: absolute, because this folder is outside the project. ' + rulesPathNote
    : '- Rules location: project-relative, so moving the project and its rules folder together preserves the paths.');
  return {
    ...laneVars(selected, primary),
    METRICS_LANE_NAMES_JSON: JSON.stringify([...new Set(['inline', 'main', ...claudeAgentIds(), ...AIS.flatMap((ai) => [ai.id, ai.bin]).filter(Boolean)])]),
    STACK_TABLE: roleTable(assignment, stack),
    STACK_FALLBACK_NOTE: fallbackNote,
    STACK_GAPS: gaps,
    // The "Full assignments" pointer is its own paragraph, not a clause
    // glued onto the end of the gaps sentence (C5): when gaps is non-empty
    // it already ends its own sentence ("...off every lane here."), and
    // running the pointer straight on read as a continuation of it.
    STACK_SUMMARY: ['## Your stack: who does what', fallbackNote, gaps].filter(Boolean).join('\n')
      + '\n\nFull assignments: [README.md](README.md#your-stack-who-does-what).',
    EXAMPLE_LANE: exampleLane,
    EXAMPLE_EFFORT_FLAGS: LANE_FLAGS[exampleLane]?.effort ? ' --effort high' : '',
    EXAMPLE_AUDIT_LANE: auditExample?.id || '',
    EXAMPLE_AUDIT_BLOCK: auditExample ? ("When reviewing with an available read-only mode, select its audit shape:\n\n```bash\naunx cli-run " +
      `${auditExample.bin}` +
      " --audit --brief REVIEW.md\nnode bin/cli-run.mjs " +
      `${auditExample.bin}` +
      " --audit --brief REVIEW.md\n```") : 'When reviewing, verify the chosen lane permissions and request review-only work.',
    EXAMPLE_LANES_JSON: JSON.stringify({ enabled: enabled.map(a => a.bin), defaults: { [exampleLane]: exampleDefaults } }, null, 2),
    // Renders only when Qwen is actually selected: the sentence names a flag
    // that is a usage error on every other lane (C1).
    QWEN_SAFE_MODE_NOTE: selected.some(a => a.id === 'qwen') ? "When Qwen's safe mode is required, pass `--safe-mode` to that lane. " : '',
    ACTIVATION_STEPS: steps.length ? steps.map((st, i) => `${i + 1}. ${st}`).join('\n') : 'Nothing left to do.',
    PROOF_STEPS: proofs.map((st, i) => `${i + 1}. ${st}`).join('\n'),
    LOAD_IT: opts.applySnippets && readsProjectRules
      ? ("The installer applied the generated rules to the model-orchestrator marked block in `" +
        `${primary.rulesFile}` +
        "`" +
        `${subagentsLoadRules(primary) ? ' and merged the hooks into `.claude/settings.json`' : ''}` +
        ". Existing files changed by this run have timestamped backups in the rules folder's gitignored " +
        "`.backups/` directory; their paths were printed in the terminal.")
      : readsProjectRules
      ? (`${primary.name}` +
        " reads its rules from `" +
        `${primary.rulesFile}` +
        "` in the project root. The installer wrote `" +
        `${snippet}` +
        "` next to this README; copy its contents into `" +
        `${join(projectAbs, primary.rulesFile)}` +
        "`, creating that file if it does not exist. Nothing was appended to a file you already had." +
        (`${subagentsLoadRules(primary) ?
           (' Also merge `settings.hooks.snippet.json`, written next to this README, into `.claude/settings.json`'
             + ' (create it if missing) to wire the route-gate, subagent-context and route-metrics hooks.') : ''}`))
      : snippet
        ? (`${primary.name}` +
          " has no cataloged project rules file. Follow the load step under \"What's left for you\" using `" +
          `${snippet}` +
          "` next to this README.")
        : 'No main agent was selected, so no activation file was written. Re-run the installer and pick one.',
    CLAUDE_SNIPPET_INTRO: ("# Add this to your project's CLAUDE.md\n\nCopy the block below into `CLAUDE.md` at your project root " +
      "(create the file if it does not exist). The installer did not modify any file you already had."),
    CLAUDE_HOOKS_ACTIVATION: ("Merge `settings.hooks.snippet.json`, written next to this file, into `.claude/settings.json` to wire " +
      "all three in."),
    CHAT_UPLOAD_NOTE: primary && primary.facts.kind === 'chat' ?
       ' A chat app cannot open a local path: upload or paste any protocol file you want it to read.' : '',
    WHERE_THINGS_WENT: whereThingsWent.join('\n'),
    RULES_PATH: rulesPath,
    RULES_PATH_NOTE: rulesPathNote,
    RULES_PATH_NOTE_COMMENT: rulesPathNote ? '// ' + rulesPathNote : '',
    RULES_DIR_OVERRIDE_JS: 'process.env.MODEL_ORCHESTRATOR_RULES_DIR',
    ROUTING_FILE: level >= 2 ? 'ROUTING.md' : 'ORCHESTRATOR.md',
    PROJECT_DIR: projectAbs,
    AGENTS_DIR: primary && primary.facts.agentDefinitions ? join(projectAbs, primary.facts.agentDefinitions) : 'none (your main agent has no subagent folder)',
    LITELLM_IMAGE: IMAGES.litellm,
    OLLAMA_IMAGE: IMAGES.ollama,
    CODECALC_PIN: pinOf('codecalc'),
    OBSIDIAN_TC_PIN: pinOf('obsidian-tc'),
    CONTEXT7_PIN: pinOf('context7'),
    APIS_LIST: apis.length ? apis.map((prov) => '- ' + prov.name + ' (`' + prov.envName + '`)').join('\n') :
       '- none: no metered provider key was selected, so the gateway serves only a local lane if you picked one',
    INSTALL_DIR: dirPosix,
    INSTALL_DIR_SH: shellQuote(dirPosix),
    INSTALL_DIR_SYSTEMD: systemdEscape(dirPosix),
    // vm/README.md step 3 named `grok login` and `agy` whatever you picked (#26).
    VM_SIGNIN: (() => {
      const lines = selected.filter((a) => a.bin && a.facts.kind === 'agent-cli').map((a) => `   - ${a.name}: ${a.auth}`);
      for (const a of selected.filter((a) => a.bin &&
         a.facts.kind === 'local-runtime')) lines.push(`   - ${a.name}: no sign-in. Step 5 initializes the model in its Compose service.`);
      return lines.length ? lines.join('\n') : '   - none: no CLI you selected needs a sign-in on the box.';
    })(),
    VM_LOCAL_MODEL_SH: shellQuote(selected.some((a) => a.id === 'ollama') ? byId.ollama.gatewayModel.replace(/^ollama\//, '') : ''),
    VM_SCRIPT_INSTALLERS: scriptInstallers(selected.filter((a) => a.facts.kind !== 'local-runtime')),
    VM_LOCAL_SETUP: selected.some((a) => a.id === 'ollama')
      ? ("The command waits for Ollama, pulls `" +
        `${byId.ollama.gatewayModel.replace(/^ollama\//, '')}` +
        "` inside its Compose service, then requires a nonempty chat completion through the gateway alias " +
        "`local-small`. The container uses its own volume; a host Ollama installation is separate. This check " +
        "sends one short prompt to the local model.")
      : ("No local runtime was selected. The command starts the configured services; verify any configured " +
        "provider lanes separately."),
    AUDIT_LANE: lane || 'none',
    // Enforced boundary per lane: codex has a read-only sandbox flag; the others
    // run with whatever their own config allows, and the script says so.
    AUDIT_LANE_FLAGS: selected.find(a => a.bin === lane)?.facts.readOnlyMode ? '--audit' : '',
    AUDIT_LANE_BOUNDARY_NOTE: selected.find(a => a.bin === lane)?.facts.readOnlyMode
      ? `${lane} --audit, a read-only filesystem sandbox; commands and network follow the ${lane} config`
      : lane
        ? (`${lane}` +
          " offers no sandbox flag cli-run can pass, so the denied-actions list is instruction-level only and " +
          "enforcement is whatever " +
          `${lane}` +
          "'s own permission config allows")
        : 'no lane selected',
    AUDIT_LANE_GUARD: lane
      ? ''
      : ("echo \"weekly-audit: no cli-run lane was enabled at install time; enable one in bin/lanes.json and " +
        "edit AUDIT_LANE\" >&2; exit 13"),
    TOOLS_LIST: tools.length ? tools.map((t) => '- ' + t.name + ': ' + t.role).join('\n') :
       '- none selected (re-run the installer with --tools codecalc to add the calculator and code runner)',
    CODECALC_STATUS: codecalc ? 'setup instructions selected (see `CODECALC.md`); verify your own installation before calling it' :
       'use a calculator or the project runtime to compute and verify arithmetic',
    OBSIDIAN_TC_STATUS: tools.some((t) => t.id === 'obsidian-tc') ?
       'setup instructions selected (see `OBSIDIAN-TC.md`); verify server access before calling these tools' :
          ("not selected; the rule below still binds against whatever store you keep (a notes folder, a wiki, a " +
      "repo of markdown), the tool names are what obsidian-tc would give you"),
    CONTEXT7_STATUS: tools.some((t) => t.id === 'context7') ?
       'setup instructions selected (see `CONTEXT7.md`); verify server access before calling these tools' :
          'not selected; the rule below still binds, read the vendor docs or source by hand before trusting them',
    DATE: new Date().toISOString().slice(0, 10),
    LEVEL_ID: String(level),
    LEVEL_NAME: lvl.name,
    LEVEL_TAGLINE: lvl.tagline,
    PRIMARY_ID: primary ? primary.id : 'none',
    PRIMARY_NAME: primary ? primary.name : 'your agent',
    PRIMARY_RULES_FILE: primary && primary.rulesFile ? primary.rulesFile : 'your agent\'s instructions file',
    PRIMARY_DEEP: 'the planning model available in your configuration',
    PRIMARY_STANDARD: 'the working model available in your configuration',
    PRIMARY_FAST: 'the cheap model available in your configuration',
    AIS_LIST: selected.map((a) => '- ' + a.name + ': ' + summaryWithEvidence(a)).join('\n'),
    AI_IDS: selected.map((a) => a.id).join(','),
    LANES_TABLE: lanesTable(selected, plans, primary),
    PLAN_GUIDANCE: planGuidance(selected, plans),
    INSTALL_TABLE: installTable(selected),
    CLI_RUN_LANES: selected.filter((a) => a.facts.cliRun).map((a) => a.bin).join(', ') || 'none selected',
    CLAUDE_WORKER_TRANSPORT: Object.values(assignment.roles).some(role => role.ai === 'claude-code' && role.via === 'cli-run')
      ? ("- When assigning a Claude Code worker, prefer a connected Claude worker MCP service exposed in the " +
        "host tool catalog. Call its tools directly from the host, follow its session and permission " +
        "workflow, and preserve the task scope. See `CLI-RUN.md` for dispatch and fallback boundaries.\n")
      : '',
    GATEWAY_MODELS: gatewayModels(selected, apis, opts.models),
    ENV_NAMES: envNames(selected, apis).map((n) => '- `' + n + '`').join('\n'),
    ENV_EXPORTS: envNames(selected, apis).map((n) => n + '=').join('\n'),
    NPM_PACKAGES: selected.map(npmSpec).filter(Boolean).join(' ') || '""',
    SCRIPT_INSTALLERS: scriptInstallers(selected),
    COMPOSE_ENV: composeEnv(selected, apis),
    COMPOSE_OLLAMA: composeOllama(selected),
    // Delegate-by-default wording uses the verified subagent loading surface.
    // Every other agent confirms tool and rule reach during Assign.
    DECISION_RULE5: decisionRule5(primary),
    DECISION_RULE5_L1: decisionRule5Beginner(primary),
    WHO_BUILDS: whoBuildsSection(primary),
    CLASS_ROUTE_LINE: ("Resolve one with `aunx route --class frontier|fast|swarm [--data public|private] [--write]`. " +
      "It prints the first installed, eligible lane, its model, and names each skipped candidate."),
    ADD_ENDPOINT_ROW: addEndpointRow(primary),
    INLINE_THRESHOLD_NOTE: inlineThresholdNote(primary),
    DELEGATE_RULES_NOTE: delegateRulesNote(primary),
    PLAN_BIG_LINE: planBigExecuteSmallLine(primary),
    ROLES_BUILDER_ROW: rolesBuilderRow(primary),
    BUILDER_HANDOFF_NOTE: builderHandoffNote(primary),
    ROUTE_GATE_SECTION: subagentsLoadRules(primary) ? '\n' + routeGateSection(selected, primary) + '\n' : '',
    AGENTS_LIST_LINE: claudeAgentIds().map((id) => '`' + id + '`').join(', '),
    RULES_FILE_REL: rulesFileRel,
    RULES_FILE_REL_JSON: JSON.stringify(rulesFileRel),
    TASK_BRIEF_REL_JSON: JSON.stringify(taskBriefRel),
    // route-gate.mjs takes a candidate list so the plugin bundle (src/plugin.js)
    // can render the installer's default locations from the same template. An
    // install knows its one rules file, and wrote it, so it needs no hint.
    RULES_CANDIDATES_JSON: JSON.stringify([rulesFileRel]),
    SETUP_HINT_JSON: JSON.stringify(''),
    SETUP_NOTICE_JSON: JSON.stringify(''),
    CONTEXT_SUFFIX_JSON: JSON.stringify('')
  };
}
