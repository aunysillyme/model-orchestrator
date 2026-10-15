// Public installer API. Implementations live in cohesive modules under install/.
export { GENERATOR_VERSION, TEMPLATES, CLI_RUN_SRC, ACTIVATION_JSON_BYTE_CAP } from './install/shared.js';
export { auditLane, laneVars, subagentsLoadRules, claudeAgentIds, routeGateTable, routeGateSection, decisionRule5, decisionRule5Beginner,
   whoBuildsSection, addEndpointRow, inlineThresholdNote, delegateRulesNote, planBigExecuteSmallLine, rolesBuilderRow,
      builderHandoffNote } from './install/routing.js';
export { lanesTable, installTable, gatewayModels, envNames, scriptInstallers, composeEnv, composeOllama, snippetFor, primaryActivationStep,
   activationSteps, proofSteps } from './install/docs.js';
export { planFiles } from './install/plan.js';
export { shellQuote, systemdEscape, dirProblems, realRoot, globalConfigProblem, preflight, writePreflightProblems } from './install/paths.js';
export { MACHINE_OWNED, RUNTIME, toPosixRel, fileClass, readManifest } from './install/ownership.js';
export { atomicWriteFile, backupStamp, backupPath, ensureBackupDirectory } from './install/backups.js';
export { writeFiles } from './install/write.js';
export { resolveSelection, resolveApis, resolveTools } from './install/selection.js';
export { AIS, LEVELS, TOOLS, PROVIDERS, IMAGES, npmSpec } from './catalog.js';
