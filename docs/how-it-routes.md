# How it routes

The reasoning behind the lane choice, and the three verifier agents that keep a routed answer honest. Install mechanics are in [install.md](install.md).

## Routing by role, complexity and stakes

Role picks the agent. Two more inputs move the choice, and they move it in
different directions, so `TIERS.md` states them separately rather than folding
them into the role:

- **Complexity moves the effort.** A worker executing a finished plan needs less
  reasoning than the reviewer judging its output. When the plan is airtight the
  spec is carrying the thinking.
- **Stakes move the tier and the reader.** Security, privacy, data loss and
  irreversible changes buy the challenge lane, a named check, a rollback path or
  a human yes. A one-line change to an auth check is simple and high-stakes at
  the same time, and it is the stakes that decide.

Stakes means what a mistake would cost: a security hole, leaked personal data,
lost data, or something you can't undo. Most tasks are low-stakes and route
normally.

The top of the ladder is bought with evidence: a reproduced failure, an
unresolved checkpoint, an irreversible change. A task that merely feels hard is
a deep-tier task, not an escalation.

## A finding is a claim, not a fact

Review findings do not go straight to a repair. `finding-verifier` reads the
cited line, states what would trigger the problem, then hunts for the guard,
caller or test that makes it impossible, and returns **CONFIRMED**,
**NOT_REPRODUCED** or **INCONCLUSIVE** per finding. Only CONFIRMED earns a
change. Use a different model family from the one that produced the finding
where you have one: a family asked to check its own claim tends to agree with
itself.

## Two more fast-tier checks

`done-verifier` probes the artifact a tracker item's done-signal names (a file, a commit, a URL, a log line, a count) and returns MET, NOT_MET or UNVERIFIABLE; it never closes or edits anything itself. It carries no file-editing tools, but on claude-code it does carry `Bash` for those probes (`git log`, `grep`, `wc -l`, `test -f`); staying to read-only commands there is a rule in its prompt, not a restriction on the tool grant, and its own description says so. On agy, `commandExecutionPolicy: off` blocks command execution mechanically instead. `reader` is the one that is read-only by tool grant on both: no `Write`, `Edit`, or `Bash`. It reads and digests many files or notes and hands back exactly what the brief asked for, cited by `path:line`; it never classifies, tags or writes, which is what separates it from `bulk-worker`. Both ship in the claude-code and agy agent sets, at the fast tier.

## Pin the route, or know that you did not

A lane with no `--model`, no `--effort` and no `defaults` entry in
`bin/lanes.json` runs on **its own config file**, which `cli-run` cannot see. A
CLI configured months ago at a low reasoning effort keeps auditing at that
effort while your routing docs describe a second-opinion pass.

```bash
node bin/cli-run.mjs codex "<prompt>" --model gpt-6-astra --effort high
node bin/cli-run.mjs --doctor     # prints what each lane is pinned to, and what is not pinned
```

Every run logs the model and effort **requested** and where the request came
from: `flag`, `lanes.json`, or `lane_default`, on every record including the
runs that never reached a lane. It does not log an actual. One lane of five
(grok) reports a model id in its own output and the other four report none, so
an actual field would be present for one lane and missing for four, and it
would be a provider-supplied string, which the durable log deliberately never
holds.

