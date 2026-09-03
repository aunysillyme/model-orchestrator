# Memory and record: the store is part of the change

Every protocol here ends in a write: the end-to-end doc, the rename that lands everywhere, the research brief, the gap report. A write that nothing indexes is a note in a drawer. This protocol says how the store is kept honest, whatever the store is.

Companion tool for this rule: **obsidian-tc**, {{OBSIDIAN_TC_STATUS}}.

## Rules

1. **Search before you write.** A research brief, a decision, a rule: check whether it already exists (`semantic_search` for the concept, `search_text` for the exact phrase). Duplicates are how a store starts lying: two notes, two answers, and a reader picks one.
2. **The folder index is part of the change, not a follow-up.** Every folder has one index file that says what is in it and what state it is in. Any write, edit or delete reopens that index in the same pass and corrects whatever the change made untrue. A stale index is worse than a missing one because agents believe it.
3. **One writer per run.** Several agents may propose; one records. If you are not the writer, produce the file and name it in your report.
4. **Machine output stays out of the index.** Scan dumps, logs, traces embed well and outrank the thing they describe. Keep them outside the searchable store, or in a folder the index excludes.
5. **A record is not present state.** A note, a ticket, a checkbox is a dated observation. Re-read the live thing before you act on it.
6. **Inferred content is marked as inferred.** A conclusion an agent reached, rather than copied from a source, carries `source: agent-synthesis` (and, with obsidian-tc, goes through its poison scan before it lands). A reader must be able to tell a quote from a guess.
7. **Compare-and-swap on overwrite.** Read, then write with the hash you read. A blind overwrite of a note someone else changed is a lost update nobody notices.

## Where the other protocols touch the store

| Protocol | Store call |
|---|---|
| Propagate, step 1 | `get_backlinks` on the thing being renamed; `search_text` for the literal old term; after the change, `find_unresolved_links` |
| Build, Stage 7 | the end-to-end doc goes in the folder that owns the domain; its index is updated in the same pass |
| Deep research, step 4 | `semantic_search` before the brief is written; a hit means append to the existing note, not a second note |
| Gap analysis | the "what exists" enumeration starts from the store, then diffs against the live state |

## Without obsidian-tc

The rules still bind. `grep -rn` is your literal search, a folder README is your index, `git` is your compare-and-swap. What is not allowed is a write nobody can find again.

Source: https://github.com/The-40-Thieves/obsidian-tc
