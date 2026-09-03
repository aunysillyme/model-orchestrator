# RESEARCH_TRIAGE.md: three engines in parallel, one triager

The deep-research lane at level 2: fan the same plan out to different model families through their CLIs, then triage against primary sources you open yourself.

Your `cli-run` lanes: {{CLI_RUN_LANES}}.

## Roles

| Role | Typical lane | Job |
|---|---|---|
| Web sweep | the research CLI (`agy`) | widest landscape pass |
| Adversarial read | the second-coder CLI (`codex --audit`) | attack the premise, hunt for what the others would get wrong |
| Live data | the live-data CLI (`grok`) | dated primary sources, real-time reads |
| Cheap divergent read | the free tier (`hermes`) | a fourth opinion at $0 |
| Triage + the durable record | the orchestrator | opens primary sources, marks every claim, writes the artifact |

Run each engine as one `cli-run` call with a task bundle in `--brief`. A run that produced nothing exits 10 and is a missing engine, not an empty finding.

## One run

```bash
BRIEF=research/brief.md      # purpose, sub-questions, source standard, report contract, exit parameters
node bin/cli-run.js agy   --brief "$BRIEF" --timeout 900 > research/out-agy.md
node bin/cli-run.js codex --audit --brief "$BRIEF" --timeout 900 > research/out-codex.md
node bin/cli-run.js grok  --brief "$BRIEF" --timeout 900 > research/out-grok.md
```

Then the orchestrator reads the three outputs, opens every primary source that carries a decision, and writes one dated brief with marks: **CONFIRMED** (two engines + primary source) · **DISAGREEMENT** (both readings kept) · **REPORTED** (someone's own post, quoted not trusted) · **UNVERIFIED**.

## Triage discipline

- Plant one deliberately wrong figure in one brief. An engine that does not correct it has confirmations worth less than they look.
- Expect one engine to return confident unsourced numerics and claim full coverage. Downgrade to hypothesis. Weight the engines that report their own gaps.
- Agreement is weak evidence. Disagreement is the signal.
- Only the orchestrator writes the durable record. Every other engine proposes.
- Count dispositions, not briefs.
