# Context file: one shared source for a run

- When a build begins, copy briefs/CONTEXT.md and fill it from the approved request and bounded source reads.
- Record the live state, affected files, acceptance checks, resource inventory, measurements, dependencies and resolved decisions once.
- When sending a task brief, point it at this context file and give the receiving worker access to the content.
- When a source fact changes, update the file and rerun the affected verifier before dependent work continues.
- Verify a sample of the context file's claims against original source paths or runtime output.
- When the task ends, record final evidence and unresolved limits where the next reader can find them.

When a shared record tool is available, use it within the granted scope. Otherwise keep the file with the project and use version control to preserve edits.
