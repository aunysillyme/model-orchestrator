# Task Bundle: the brief every delegation carries

A subagent, a second CLI, or a fresh chat window holds none of the rules your main session is holding. It cannot see your conventions, it cannot route, and it will read an unspecified edge as an open one.

> A delegate gets an approved, bounded brief. Absence is not permission.

A brief is under-specified if it is missing **purpose**, **denied actions**, **report contract**, or **exit parameters**.

## Template

Copy this into the delegate's prompt. Delete nothing; write `none` where a field is genuinely empty, so a reader can tell "nothing denied" from "nobody thought about it".

```markdown
## Task bundle

**Purpose.** <one sentence: what this task is for, and why>
**Task class.** <read_only | draft_only | mutating>  (draft_only = produce, do not apply)

**Granted scope.**
- <paths, globs, topics, or record sets this brief covers>
- Anything outside this list is out of scope. Do not widen it on your own judgment.

**Capabilities.** <the actions you MAY take: read, search, write to <path>, run <cmd>>

**Denied actions.** <explicit list: do not commit, push, deploy, delete, send, publish, close a ticket...>
- Anything absent from Capabilities is denied. Absence is not permission.

**Conventions you do not have.** <restate every house rule this task needs; the delegate holds none>

**Report contract.** Return: <exactly what to hand back>. State plainly what you did NOT do
and anything you could not verify. "Unverified" is an acceptable answer; a confident guess is not.

**Exit parameters.** <at least one bound: a wall-clock ceiling, a work ceiling ("at most 20 files"),
or a stop condition. Plus the partial-result clause: if you hit a bound, report what you have and
name what you did not cover. Never keep going past a bound, never return nothing.>
```

## When to skip it

A one-line read-only lookup can say so outright:

```
Task bundle: none (one-line lookup, read-only, no artifact)
```

The reason is required. A bare `none` is indistinguishable from "forgot".

Never skip it for anything touching secrets, deletion, bulk mutation, deploys, or someone else's data. Better: do not delegate those at all.

## Field notes

- **Purpose** is what makes the rest checkable. "Fix the thing" has no edge to exceed.
- **Task class** is the cheapest safety win. Most delegation wants `read_only` or `draft_only`.
- **Denied actions** must be written even when they feel obvious. Nothing is obvious to a delegate with no context.
- **Report contract** is what turns a result into evidence rather than a claim.
- **Exit parameters** exist because a delegate that never returns is more expensive than one that returns wrong. A wrong answer is corrected next turn; a hang burns the session while looking like progress. Bound your own shell calls the same way (pass a timeout; scope recursive searches away from `.git`, `node_modules`, build output).
