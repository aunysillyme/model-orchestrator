# Reproduce the measurements

Generated from [results.json](results.json). Each figure has a method, sample size, measurement date and expiry. Run the scripts on your own machine to compare.

Environment: Node v22.22.3, darwin arm64. Timing varies with startup caches and other work on the machine. Synthetic cases show what those fixtures exercise.

| Measurement | Result | Sample size | Measured | Expires | Reproduce |
|---|---|---|---|---|---|
| Dry install wall time | 42.22 ms median | 7 | 2026-09-27 | 2026-10-11 | [script](../proof/scripts/install-time.js) |
| Lane runner overhead | 63.74 ms median difference | 7 | 2026-09-27 | 2026-10-11 | [script](../proof/scripts/runner-overhead.js) |
| Empty results flagged | 10 fixtures rejected | 10 | 2026-09-27 | 2026-10-11 | [script](../proof/scripts/missing-results.js) |
| Acceptance failures blocked | 4 fixtures rejected | 4 | 2026-09-27 | 2026-10-11 | [script](../proof/scripts/check-gate.js) |
| Main conversation browser tokens | 408147 tokens per browser step (median) | 9775 | 2026-09-26 | 2026-10-27 | author setup, re-measured locally |
| Small browser subagent tokens | 17197 tokens per step (highest of 5 runs) | 5 | 2026-09-27 | 2026-10-27 | author setup, re-measured locally |

## Run the proof scripts

```sh
node proof/scripts/measure.js
node proof/scripts/render.js
npm test
```

The measurement command refreshes reproducible entries and preserves separately sourced author-setup entries. The test suite rejects expired, future-dated or incomplete entries and checks this page against the data. The weekly [refresh workflow](../.github/workflows/proof.yml) reruns the scripts and commits their data and generated page.

## Try the acceptance gate

```sh
aunx checks ACCEPTANCE_CHECKS.json
aunx checks run ACCEPTANCE_CHECKS.json
```

The scaffold starts red. Replace the sample with commands that prove your requirements, then put `aunx checks run ACCEPTANCE_CHECKS.json && <your-release-command>` in your own release sequence. Commands are local code you review before running. Manual evidence stays UNVERIFIED and blocks the gate.

![Acceptance gate rejects a missing output, then passes after the output exists](gate-demo.gif)

The [recording script](scripts/record-gate.js) captures real command output into an asciicast, then renders it with an already installed agg. Companion tools are installed by their users.

## Measurement methods

### Dry install wall time

Spawn a fresh Node installer process per sample; level 2, Claude Code + Codex, no companions, --dry. Includes Node startup and planning; writes no install files. Isolated home and PATH, no real vendors.

Kind: reproducible local measurement. Sample size: 7. Measured: 2026-09-27. Expires: 2026-10-11.

Source: [proof/scripts/install-time.js](../proof/scripts/install-time.js).

### Lane runner overhead

Paired fresh processes: direct Node stub versus cli-run hermes with the same stub. Alternates pair order. Includes wrapper startup, validation and local log writes; excludes vendor/network/model time.

Kind: reproducible local measurement. Sample size: 7. Measured: 2026-09-27. Expires: 2026-10-11.

Source: [proof/scripts/runner-overhead.js](../proof/scripts/runner-overhead.js).

### Empty results flagged

Run cli-run against an exit-0 stub for every supported lane, once with empty stdout and once with an empty native final result. Count exit 10/11 only. A successful Hermes response is the positive control. Synthetic fixtures measure these shapes only.

Kind: reproducible local measurement. Sample size: 10. Measured: 2026-09-27. Expires: 2026-10-11.

Source: [proof/scripts/missing-results.js](../proof/scripts/missing-results.js).

### Acceptance failures blocked

Run aunx checks run against nonzero, manual, missing-program and timeout fixtures. Each must exit 1; a passing command must exit 0. This is a local command gate, activated by the user in their release sequence.

Kind: reproducible local measurement. Sample size: 4. Measured: 2026-09-27. Expires: 2026-10-11.

Source: [proof/scripts/check-gate.js](../proof/scripts/check-gate.js).

### Main conversation browser tokens

Measured on the author's Claude Code sessions: every browser tool call in the transcripts, counting tokens re-read by the main conversation per step. Median: 408,147 tokens per browser step across 145 sessions and 9,775 browser steps. Sample size counts browser steps.

Kind: measured on the author's setup. Sample size: 9775. Measured: 2026-09-26. Expires: 2026-10-27.

Source: author setup, re-measured locally.

### Small browser subagent tokens

At least 23x fewer tokens per step in this sample: the main conversation median of 408,147 divided by the highest subagent run of 17,197 is 23.73x. Measured on the author's Claude Code sessions, with the same kind of work handed to a small browser subagent. Five runs, tokens divided by steps or tool calls per run: 17,197 (206,369 tokens / 12 steps, 2026-09-26); 4,077 (93,773 / 23), 4,201 (105,034 / 25), 4,585 (91,709 / 20), and 4,489 (94,263 / 21), all four on 2026-09-27. Range: 4,077 to 17,197; median of 5 runs: 4,489. Typical context, using the median of 5 runs: 90.93x fewer tokens per step. These are measurements from the author's own sessions, not a controlled comparison or a guarantee for other setups. The four 2026-09-27 runs shared one browser pane, so some steps were spent recovering a drifting tab, which raises the step count and lowers per-step tokens. The first run counted steps; the later runs counted tool calls. Sample size counts runs.

Kind: measured on the author's setup. Sample size: 5. Measured: 2026-09-27. Expires: 2026-10-27.

Source: author setup, re-measured locally.

## Operation and verification

- **What and why:** executable measurements keep public figures traceable to current output.
- **Trigger:** weekly schedule, workflow dispatch, or `node proof/scripts/measure.js`.
- **Invocation chain:** workflow -> measurement functions -> isolated Node fixtures -> results.json -> this page -> npm test.
- **Dependencies:** Node and the repository. The optional GIF recorder uses agg from the asciinema project.
- **Reads:** package scripts, the installer, runner and acceptance-check runner. Fixture tests use an isolated home and PATH.
- **Writes:** results.json, this generated page, temporary fixture directories and local fixture logs. The recorder writes gate-demo.cast and gate-demo.gif.
- **Closed loop:** the workflow fails when measurement or tests fail. GitHub Actions records the failure; repository notification settings decide who receives it. No separate alert service is configured.
- **Failure modes:** runner behavior changes, an expired catalog snapshot, missing runtime, unavailable write permission, or timing noise. Review the failed job, rerun locally, and send a reproducible issue to the repository maintainers.
- **Run and verify:** run the commands above, inspect sample arrays and fixture exit codes in results.json, and require npm test to pass. A future-time unit test proves expiry can fail.
- **Source of truth:** results.json and the scripts it names. Author-setup evidence is added separately by its owner.
