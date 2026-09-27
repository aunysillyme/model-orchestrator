# RESEARCH_TRIAGE.md: parallel research with source verification

When a question needs outside evidence, {{RESEARCH_SELECTION_ADVICE}} Then open the primary sources that support decisions.

Use the selected `cli-run` lanes: {{CLI_RUN_LANES}} ({{RESEARCH_ENGINES}} research engine(s) below). When a needed lane is absent, use an available authorized research tool and name the resulting coverage limit.

## Assign the research roles

| Role | Typical lane | Job |
|---|---|---|
{{RESEARCH_ROLES}} opens primary sources, marks claims and writes the final report |

Give each engine a task brief through `--brief`, with the same context file, bounded questions, source standard and stopping condition. When a run returns no usable result, record that engine as unavailable and continue independent source checks.

## Run the selected engines

```bash
BRIEF=research/brief.md
{{RESEARCH_RUN}}
```

When using the installed script directly, `aunx cli-run` accepts the same runner arguments as `node bin/cli-run.mjs`.

When outputs arrive, have one writer inspect the primary sources carrying each decision and produce a dated synthesis:

- **CONFIRMED:** verified against the primary source, with independent corroboration where the question needs it.
- **DISAGREEMENT:** preserve conflicting readings and identify the evidence that would resolve them.
- **REPORTED:** attribute a source's statement to that source.
- **UNVERIFIED:** name the missing evidence or access.

## Verify claims and coverage

- When engines agree, verify the shared premise against source.
- When engines disagree, preserve both claims until evidence resolves them.
- When a report gives a number, open its source or recompute it with an available tool.
- When testing a research method, use a labelled false-premise fixture and confirm the method rejects it before relying on it.
- When recording results, use one writer and return claim dispositions with citations.
- When Context7 or another companion is absent, use official documentation, source and the project's own runtime checks.
