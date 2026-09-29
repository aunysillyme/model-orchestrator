# How the model router chooses work

Your agent reads the installed routing rules and chooses a model and tools for each task. A **lane** is a tool or model that can receive work. A **tier** describes model strength and cost: planning model, working model or cheap model. [Installation](install.md) writes the rules for your selection.

## Routing by role, complexity and stakes

- **Role selects the job:** bulk work, reading, live data, review, finding verification, definition-of-done verification, planning or building.
- **Complexity sets effort:** a clear transformation and an unresolved architectural choice require different reasoning.
- **Stakes select the model and reviewer:** security, privacy, data loss and irreversible changes need checks suited to the consequences of a mistake.
- **Availability limits the choice:** check tools, model names, permissions and remaining headroom before assigning work.

`aunx route "rename this file"` prints a cheap bulk-work suggestion. `aunx route "design the auth system"` prints a deep-planning suggestion. These are keyword classifications, labelled as suggestions. An unmatched request points to `ROUTING.md` for a decision with the full context.

## Your stack: who does what

Each install assigns jobs from the selected AIs' capability facts. The same inputs give the same assignment, stored in `MANIFEST.json` and rendered in the installed README, routing rules and delegation matrix. Selection order breaks ties; a detected binary is an advisory marker and leaves the assignment unchanged.

| Role | Selection rule |
|---|---|
| Plan | Prefer the main agent, then the largest known context capacity |
| Build | Require file writes and main-agent access or a headless runner; prefer the main agent, then project-rule loading and agent definitions |
| Review | Require a supported runner and a known model family different from the main agent; prefer read-only mode, then billing order |
| Verify | Use the main agent or a supported runner; prefer a different known model family, then billing order |
| Research | Require stated live-web access; prefer billing order |
| Bulk | Require a headless supported runner; prefer billing order, then known input pricing when both options are pay-per-token |
| Read | Prefer the main agent, then the largest known context capacity |
| Private | Require a runtime that keeps work on your machine |
| Fan-out | Show when a selected tool states that one call starts several children; prefer billing order |
| Long-context | Show when a selected tool's known context capacity exceeds the main agent's; prefer the largest |

Billing order is local, free, subscription, then pay-per-token. Unknown prices leave ties in selection order and require checking your provider's rate. Unknown capabilities render as **unverified** and cannot satisfy a role requirement. Two inherited capabilities remain true with **UNVERIFIED against a vendor doc** beside them: Antigravity's fan-out and Grok's live-web tools. Their current vendor behavior needs verification.

When a separate lane is unavailable, the main agent carries the job at its named tier. Review and private work are exceptions: the table says **none selected**. A fresh-context review on your main agent is a self-check; independent review needs a known different model family. If the main agent's family is unknown, independence is unverified. With no local runtime, keep private work off the selected lanes.

`aunx route` reads the assigned role from the current manifest, even if you preserve edited routing documents during an upgrade. Pass `--dir PATH` for a custom rules folder. It tries that manifest, then `./ai-orchestrator/MANIFEST.json`, then `./MANIFEST.json`. With no usable manifest it keeps the generic suggestion and adds an install notice. It reads bounded regular JSON files and executes no project code.

## Verify a review finding

When a review returns a finding, use the assigned verification role to read the cited line, state the trigger and look for a caller, guard or test that disproves it. Where an agent set is installed, `finding-verifier` supplies this prompt. It returns **CONFIRMED**, **NOT_REPRODUCED** or **INCONCLUSIVE**. A confirmed finding gets a repair and a regression check capable of failing before the fix.

Use a different model family for the review when one is available. The build protocol has one audit step: the reviewer checks the build against its scope, while a companion reviewer checks the scope against the user's ask. Fix verification follows the reproduced regression; a second full audit pass is outside that sequence.

## Check completion and digest many files

Use the verification role to probe the artifact named in a definition of done. Where installed, `done-verifier` supplies this prompt and returns MET, NOT_MET or UNVERIFIABLE. On Claude Code it has Bash for read-only probes, so that behavior is instructed by its prompt rather than restricted by the tool grant. It has no file-editing tools. Antigravity's command-execution policy blocks commands for that agent.

The read role digests many files into a cited answer. Where installed, `reader` supplies this prompt; its tool grants contain neither Bash nor file-editing tools. Use the bulk role when the job includes classification or writing.

## Choose and record model and effort

Agent definitions specify planning, working or cheap model tiers and use your plan's configured model. Every current plan mapping is unverified, so generated definitions omit `model:`. Claude Code can use `CLAUDE_CODE_SUBAGENT_MODEL`; a manual `model:` line can pin a verified choice. Antigravity defaults to its inherited model. Support for Claude Code's `xhigh` and `max` effort on every plan is UNVERIFIED.

Probe your vendor's current roster, then request the model and effort the task needs. Replace `<lane>` with a supported CLI named in your stack table. These examples use `--effort`; for a lane whose runner does not support that flag, omit it and configure the model directly:

```bash
aunx cli-run '<lane>' --brief TASK_BRIEF.md --model '<model-id>' --effort high
# Direct form from the installed rules folder:
node bin/cli-run.mjs '<lane>' --brief TASK_BRIEF.md --model '<model-id>' --effort high
aunx cli-run --doctor
# Direct form: node bin/cli-run.mjs --doctor
```

Hermes also takes `--provider '<provider-id>'` (or `"provider"` in its `lanes.json` defaults), always together with a model, because one Hermes install can reach several providers and a model sent to the wrong one fails with HTTP 400. `--doctor` notes a Hermes model pinned without a provider.

Explicit flags override defaults in `bin/lanes.json`. Without either, the vendor CLI uses its own configuration. The runner records what was requested and the source of each request: `flag`, `lanes.json` or `lane_default`. These fields describe requested settings; the vendor's own reporting is the place to verify the actual model used.

## Share facts once, then scope each worker

Use `aunx context CONTEXT.md` to scaffold one context file for the run. Use `aunx brief new TASK_BRIEF.md` to quote the ask, name the output, bound edits, list checks and record what the worker has and lacks. Every worker reads the same context file; each brief defines its own section and reports coverage against it.
