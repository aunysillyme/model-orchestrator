# Propagate: change completeness

**A rename is a refactor, not a single-file edit.** Any change to a name, term, path, slug, schema field, routing rule or shared convention has a blast radius, and the goal is zero silent strays.

This is retrieval work. It stays with the orchestrator (or a cheap worker for the grep sweep). It never goes to the deep tier: a judgment model re-deriving a file list is the most expensive routing mistake there is.

## 1. Map the blast radius (before editing anything)

- **Docs and notes:** backlinks to the thing being renamed; literal search for the old term and its link forms. With obsidian-tc: `get_backlinks`, `search_text`, then `find_unresolved_links` after the change (`protocols/memory-and-record.md`).
- **Memory / instructions:** grep every instructions file your agents read (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `QWEN.md`, custom instructions) and any memory store.
- **Code / config:** grep the repos, settings files, hooks, scheduled jobs, CI, and the files this installer wrote.
- **Other people's surfaces:** anything that consumes the old name from outside (webhooks, dashboards, bookmarks).

```bash
grep -rniE "<old-term>" --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist .
```

## 2. Build the checklist

Every hit becomes a line, grouped by surface. Nothing closes until the list is empty. Mark which items are approval-gated (production deploys, database migrations, anything public).

## 3. Execute on all fronts

Change every item. Use the tool's own governed rename where one exists (a link rewriter, an IDE refactor) over hand edits. If an index or README lists the renamed thing, that index is part of the change, not a follow-up.

## 4. Verify: the loud negative (non-negotiable)

Re-grep the OLD identifier across every surface. **Expect zero**, except historical records you name explicitly. Then check for dangling references the rename created (unresolved links, 404s, failing imports).

Paste the final grep output as proof. If any stray survives, it is not done.

## Why the last step is the one that matters

Steps 1 to 3 find what you thought of. Step 4 finds what you did not. A rename that "looks complete" and leaves one stray is worse than an unstarted one, because the stray is now believed.
