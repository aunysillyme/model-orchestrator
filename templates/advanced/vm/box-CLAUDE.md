# CLAUDE.md for the box

Copy to `~/CLAUDE.md` on the machine (or your agent's equivalent rules file). A session here inherits these without a human present.

## Cost rule
Prefer the cheapest tier that does the job well. Delegate grunt work through the dispatch layer; keep the reasoning in-session.

Send to the cheap tier via the gateway or `cli-run`: bulk classification and tagging, reformatting, extraction, first-pass summaries, mechanical transforms, explicit rough drafts.

Never send to the cheap tier: anything that will be published in a person's own voice, code that gets committed, anything needing current vendor-specific knowledge, anything where being wrong is expensive, anything time-sensitive.

## On dispatch failure
Report it and fall back to doing the work in-session. Never silently retry the same lane.

## Zero ingress
Nothing binds to `0.0.0.0`. Nothing publishes a container port to the public interface. New services go on loopback or the private mesh.

## Unattended means no human-gated escalation
An unresolved call that is irreversible or rewrites a standing rule gets surfaced (a message, a ticket comment) and stops. It is never executed on the strength of a model's confidence.

## One writer
Scheduled jobs and other engines propose. One writer records. If you are not that writer, produce a file and name it in your report.

## Secrets
Names in the environment, values in the secrets manager. Never print one, never pass one in argv, never write one to disk here.

## Routing
`{{RULES_PATH}}/ROUTING.md` and `{{RULES_PATH}}/DELEGATION_MATRIX.md` are the rules. `{{RULES_PATH}}/protocols/` are the procedures.
