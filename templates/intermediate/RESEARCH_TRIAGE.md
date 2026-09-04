# RESEARCH_TRIAGE.md: engines in parallel, one triager

The deep-research lane at level 2: fan the same plan out to different model families through their CLIs, then triage against primary sources you open yourself.

Your `cli-run` lanes: {{CLI_RUN_LANES}} ({{RESEARCH_ENGINES}} research engine(s) below). Everything in this file was rendered from that selection; a lane that is not listed is not one you have.

## Roles

| Role | Typical lane | Job |
|---|---|---|
{{RESEARCH_ROLES}} opens primary sources, marks every claim, writes the artifact |

Run each engine as one `cli-run` call with a task bundle in `--brief`. A run that produced nothing exits 10 and is a missing engine, not an empty finding.

## One run

```bash
BRIEF=research/brief.md      # purpose, sub-questions, source standard, report contract, exit parameters
{{RESEARCH_RUN}}
```

Then the orchestrator reads the three outputs, opens every primary source that carries a decision, and writes one dated brief with marks: **CONFIRMED** (two engines + primary source) · **DISAGREEMENT** (both readings kept) · **REPORTED** (someone's own post, quoted not trusted) · **UNVERIFIED**.

## Triage discipline

- Plant one deliberately wrong figure in one brief. An engine that does not correct it has confirmations worth less than they look.
- Expect one engine to return confident unsourced numerics and claim full coverage. Downgrade to hypothesis. Weight the engines that report their own gaps.
- Agreement is weak evidence. Disagreement is the signal.
- Only the orchestrator writes the durable record. Every other engine proposes.
- Count dispositions, not briefs.
