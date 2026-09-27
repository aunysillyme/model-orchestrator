# How the model router chooses work

Your agent reads the installed routing rules and chooses a model and tools for each task. A **lane** is a tool or model that can receive work. A **tier** describes model strength and cost: planning model, working model or cheap model. [Installation](install.md) writes the rules for your selection.

## Routing by role, complexity and stakes

- **Role selects the job:** bulk work, reading, live data, review, finding verification, definition-of-done verification, planning or building.
- **Complexity sets effort:** a clear transformation and an unresolved architectural choice require different reasoning.
- **Stakes select the model and reviewer:** security, privacy, data loss and irreversible changes need checks suited to the consequences of a mistake.
- **Availability limits the choice:** check tools, model names, permissions and remaining headroom before assigning work.

`aunx route "rename this file"` prints a cheap bulk-work suggestion. `aunx route "design the auth system"` prints a deep-planning suggestion. These are keyword classifications, labelled as suggestions. An unmatched request points to `ROUTING.md` for a decision with the full context.

## Verify a review finding

When a review returns a finding, `finding-verifier` reads the cited line, states the trigger and looks for a caller, guard or test that disproves it. It returns **CONFIRMED**, **NOT_REPRODUCED** or **INCONCLUSIVE**. A confirmed finding gets a repair and a regression check capable of failing before the fix.

Use a different model family for the review when one is available. The build protocol has one audit step: the reviewer checks the build against its scope, while a companion reviewer checks the scope against the user's ask. Fix verification follows the reproduced regression; a second full audit pass is outside that sequence.

## Check completion and digest many files

`done-verifier` probes the artifact named in a definition of done and returns MET, NOT_MET or UNVERIFIABLE. On Claude Code it has Bash for read-only probes, so that behavior is instructed by its prompt rather than restricted by the tool grant. It has no file-editing tools. Antigravity's command-execution policy blocks commands for that agent.

`reader` digests many files into a cited answer. Its tool grants contain neither Bash nor file-editing tools. Use `bulk-worker` when the job includes classification or writing.

## Choose and record model and effort

Probe your vendor's current roster, then request the model and effort the task needs:

```bash
aunx cli-run codex --brief TASK_BRIEF.md --model '<model-id>' --effort high
# Direct form from the installed rules folder:
node bin/cli-run.mjs codex --brief TASK_BRIEF.md --model '<model-id>' --effort high
aunx cli-run --doctor
# Direct form: node bin/cli-run.mjs --doctor
```

Explicit flags override defaults in `bin/lanes.json`. Without either, the vendor CLI uses its own configuration. The runner records what was requested and the source of each request: `flag`, `lanes.json` or `lane_default`. These fields describe requested settings; the vendor's own reporting is the place to verify the actual model used.

## Share facts once, then scope each worker

Use `aunx context CONTEXT.md` to scaffold one context file for the run. Use `aunx brief new TASK_BRIEF.md` to quote the ask, name the output, bound edits, list checks and record what the worker has and lacks. Every worker reads the same context file; each brief defines its own section and reports coverage against it.
