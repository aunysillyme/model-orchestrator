# Gap analysis: compare scope with the request

When a task covers several requirements or surfaces, compare the result with the user's ask and the prepared map. For a build, run this as the companion consult in the same audit step; it asks scope versus ask while the auditor checks build versus scope.

## Check coverage

1. Enumerate the actual files, tests, configured lanes, jobs and sources within scope.
2. Map every clause of the request to evidence in the result.
3. Identify missing requirements, unintended additions and changes omitted from the map.
4. Check the behavior expected when a dependency is absent or unavailable.
5. Return one coverage row per requirement with IMPLEMENTED, PARTIAL, MISSING or OUT-OF-SCOPE and a source path or check.

## Choose the reviewer

- When an independent reviewer is available, give it the whole ask and scope with the final artifact.
- At level 2 and above, consider this selected lane: {{GAP_ANALYSIS_LANE}}
- When only one agent is available, use a fresh context for the coverage question and identify the independence limit. A build's required independent audit remains pending until an eligible reviewer can perform it.
- For a recurring capability check, enumerate live state and compare it with the documented configuration on the configured schedule.

## Resolve reported gaps

When a gap is reported, verify the claim against the artifact before assigning a change. Keep unverified observations separate. When a gap changes the approved scope, return the decision to the user; when it is already in scope, complete it and rerun its acceptance check.
