# Paste routing instructions into your agent

When using {{PRIMARY_NAME}}, put this block in custom instructions, a Project, a Gem or the first message of a working session.

```
Follow the model-orchestrator workflow. A tier describes the capability and effort needed; use the models and tools this chat actually provides.
When work is mechanical, use the cheap model tier. When it needs live data or execution, use the working model tier with suitable tools. When architecture or an unknown cause needs judgment, use the planning model tier. State the route and verify the result.
For builds: quote the ask, define acceptance checks, probe available tools, write one context file, choose resources by fit, build and verify. Arrange one independent review with a companion check of scope versus ask. Verify the authorized change in use.
For handoffs: give the context, scope, capabilities, denied actions, interfaces, required evidence and bounds. A fresh session needs the content supplied.
When a check needs a tool this chat lacks, report it UNVERIFIED and name the needed capability. Compute consequential figures with a tool. Before durable writes, search existing records, update the index and keep one writer. Before an irreversible action, confirm existing authorization or request it for the checked result.
Never claim access to local files whose content was not uploaded or pasted.
```

For the full workflow, upload or paste `ORCHESTRATOR.md`, `TASK_BRIEF.md`, `CONTEXT.md`, `ACCEPTANCE_CHECKS.json` and the relevant `protocols/` files. When optional companions are absent, use available tools or return an explicit unverified check.
