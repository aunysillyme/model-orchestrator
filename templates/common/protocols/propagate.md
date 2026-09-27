# Propagate: complete a shared change

When changing a name, term, path, slug, schema field, routing rule or shared convention, treat every consumer as part of the change. Use scoped search or a cheap worker to collect references before asking a planning model to decide anything.

## Map consumers before editing

- Search code, configuration, hooks, scheduled jobs and CI within the authorized repositories.
- Search project instructions and any authorized record store for the old term and link forms.
- Check documented external consumers such as webhooks, dashboards or generated outputs.
- When obsidian-tc is selected, use backlinks and text search; when absent, use file search and the project's own link checker.
- Scope recursive searches away from `.git`, `node_modules` and generated build output unless that output is explicitly part of verification.

## Update the affected surfaces

- Turn each hit into a checklist item with its owner and needed permission.
- Use a supported refactor or link-rewrite tool when one exists; otherwise apply scoped edits.
- Update indexes and documentation in the same change.
- When a consumer is outside the granted scope, return the exact required handoff and keep it visible in coverage.

## Verify old and new references

- Search the old identifier again in every declared scope.
- Require zero active references, except named compatibility paths or historical records.
- Verify the new links, imports and consumer behavior with the relevant checker.
- Return the search command, exit status and any intentional retained matches as evidence.
