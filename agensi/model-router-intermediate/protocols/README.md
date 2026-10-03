# Workflow playbooks

When a task matches a row, use that procedure and keep its evidence with the result.

| File | Use when | Result |
|---|---|---|
| `build-protocol.md` | Building, implementing, migrating or deploying | A scoped, checked change verified in use |
| `context-file.md` | Sharing build context across agents | One source file every brief reads |
| `acceptance-checks.md` | Turning requirements into final-artifact checks | Commands and explicit manual checks with PASS/FAIL evidence |
| `decision-log.md` | Choosing an approach or skipping a step | Did / Why / Serves / Rejected with evidence |
| `propagate.md` | Changing a shared name, path or convention | All affected surfaces updated and the old identifier checked |
| `gap-analysis.md` | Checking coverage against a request | Missing scope and evidence gaps reported |
| `deep-research.md` | Answering a question from an initially unknown source set | Bounded research with verified sources |
| `numbers-and-logic.md` | Reporting consequential numbers or logical claims | Computed results and method |
| `memory-and-record.md` | Writing durable information | A searchable, indexed record with one writer |
| `docs-then-prove.md` | Coding against a changing interface | Current documentation and runtime verification |

For lookups, prose edits, bulk classification and one-line configuration changes, use the relevant routing rule and direct verification. When an optional companion tool is absent, each affected procedure names an equivalent local workflow.
