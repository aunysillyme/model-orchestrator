# Add routing instructions to {{PRIMARY_RULES_FILE}}

When activating {{PRIMARY_NAME}}, copy the block below into `{{PRIMARY_RULES_FILE}}` under `{{PROJECT_DIR}}`. Create the file when absent. The installer preserves existing files. Subagent folder, when supported: `{{AGENTS_DIR}}`.

```markdown
## Model router

When a task arrives, read `{{RULES_PATH}}/{{ROUTING_FILE}}` and choose the route before acting.
{{RULES_PATH_NOTE}}

When work is mechanical, use the cheap model tier. When it needs live data, use a working model with live tools. When it needs review, choose an independent reviewer. When findings arrive, reproduce them before repair. When checking a definition of done, probe its artifact. When architecture or an unknown cause needs judgment, use the planning model tier. For a build, select the lane, model and effort through Assign.

When building, run `{{RULES_PATH}}/protocols/build-protocol.md`: acceptance checks and live probes, bounded research, one context file, Assign, build and merge, one audit plus a companion consult asking a different question, then the authorized change verified in use.

When delegating, fill `{{RULES_PATH}}/TASK_BRIEF.md` with the context file, quoted ask, scope, allowed and denied actions, interfaces, checks, resource inventory and bounds. Supply any standing rules the receiving session lacks.

When a route fails, diagnose the cause and state the next route. When a refused write needs another permission boundary, hand it to an authorized writer.

When computing consequential figures, use a computing tool or local runtime. When a changing API is involved, use current docs and a runtime check. When recording durable work, search first, update the index and keep one writer. Use optional companions when selected; use local tools and official sources when absent.
```
