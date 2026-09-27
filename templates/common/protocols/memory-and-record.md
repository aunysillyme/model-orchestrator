# Memory and record: keep durable information findable

When writing durable information, search existing records, update their index and use one writer for the shared record.

Optional companion: **obsidian-tc**, {{OBSIDIAN_TC_STATUS}}.

## Record a change

1. Search for the concept and exact phrase before creating a new record. When a matching record exists, update it within the granted scope.
2. Read the owning folder's index and correct any description, status or link changed by the work.
3. Assign one writer; have other lanes return proposed edits with evidence.
4. Keep machine logs and raw traces outside the curated record index, or in an explicitly excluded folder.
5. Before acting on a dated record, probe the current state it describes.
6. Mark synthesis and inference distinctly from source quotations.
7. Before overwriting, verify the current version or content hash. If it changed since the read, reconcile the changes first.

## Connect records to work

| Workflow | Record action |
|---|---|
| Shared rename | Search references and backlinks, then check for unresolved links |
| Build report | Store the operations document in its owning folder and update the index |
| Research | Search existing coverage and attach new verified evidence |
| Coverage check | Compare recorded scope against the current artifact |
| Decision | Record Did / Why / Serves / Rejected with evidence |

## Local record workflow

When obsidian-tc is absent, use scoped file search, a folder README and version control. Before editing, compare the file with the version you read; version control alone does not prevent a concurrent lost update. Keep writes within the task's authorized paths.

Companion source: https://github.com/The-40-Thieves/obsidian-tc
