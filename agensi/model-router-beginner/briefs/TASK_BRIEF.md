# Task brief

When handing work to an agent, CLI or fresh session, fill this brief and pass it with the relevant context. Keep every field; write `none` with a reason for an empty field. Treat capabilities as an explicit allow-list: absence is denial.

## Context

<Path to the run's context file, source files to read first, and facts that explain this task. Give a fresh session access to the actual contents.>

## The user's ask

> <Quote the user's acceptance-critical request. Distinguish a rule from a preference or an unresolved choice.>

## Purpose

<What this task is for and why.>

## Scope of build

- Finished artifact: <one line naming the final result>.
- Files and changes: <each path, its owner and required behavior>.
- Shared interfaces: <contracts every section depends on>.
- Order of work: <dependencies and next steps>.
- Non-goals: <work deliberately outside this task>.
- Interfaces not to break: <existing commands, formats, APIs and behaviors>.

For a non-build task, describe the bounded result here and mark build-only fields inapplicable with a reason.

## Task class

<read_only | draft_only | mutating>. For `draft_only`, write the proposed result to the named output and leave its destination unchanged.

## Granted scope

<Paths, topics, record sets, environments and write ownership. Everything outside this list is out of scope.>

## Capabilities

<Allowed actions and tools, including exact write destinations and permitted commands.>

## Denied actions

<Explicit prohibitions, such as publishing, sending, deleting, changing permissions or exposing secrets. Actions absent from Capabilities are denied.>

## Conventions

<Project rules the receiving session needs. Even a session that loads standing rules needs this task's scope and current decisions.>

## Acceptance checks

| Requirement quoted from the ask | Final property | Verifier command or manual procedure | Baseline result |
|---|---|---|---|
| <quote> | <observable property> | <command; exit 0 means satisfied> | <PASS / FAIL / UNVERIFIED> |

Include availability checks for required tools and access. Name the checks file and run each approved verifier with the local runtime. Replay against the final merged artifact and any materialized output whose properties may change.

## Resource inventory

- The lane **holds**: <probed tools, models, context window, permissions and runtime access>.
- The lane **lacks**: <needed capabilities absent here, and an authorized route to them if known>.
- Probe evidence: <command, date, result and the surface it actually inspected>.

## Measurements

<Runtime spikes, baseline counts or performance figures with method, script, sample size and date. Mark an unmeasured assumption UNVERIFIED.>

## Report contract

Return a coverage table with one row per requirement:

| Requirement | Status | Evidence |
|---|---|---|
| <requirement> | IMPLEMENTED / PARTIAL / MISSING / OUT-OF-SCOPE | <path, test or command output> |

Name changed files, verification results, unresolved decisions and unverified behavior. State what you did and did not do. Keep evidence separate from inference.

## Exit parameters

<A wall-clock ceiling, work ceiling or stop condition. For background work, name the five-minute heartbeat and the response to two checks without progress.>

When a bound is reached, stop and return the partial result with uncovered requirements named. When permission refuses a write, hand the patch to an authorized writer and continue independent work.

## Small read-only lookups

For a one-line lookup with no output artifact, state `Task brief: none (one-line lookup, read-only)` and its scope. For secrets, deletion, bulk mutation, deployment or someone else's data, use the full brief and the appropriate permission boundary.
