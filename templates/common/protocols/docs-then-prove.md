# Docs, then prove: documentation is a lead, never a verdict

**Why this is not `numbers-and-logic.md`.** That protocol is scoped to arithmetic, comparisons and complexity claims. This one is scoped to a different failure: trusting what a library, SDK, API or CLI is documented to do instead of checking what it actually does on this version, in this codebase. Two different mistakes, two different tools, one rule underneath both: a model that feels finished is not the same thing as a model that checked.

Companion tool for this rule: **Context7** (Upstash), {{CONTEXT7_STATUS}}. It pairs with **codecalc**, {{CODECALC_STATUS}}: Context7 tells the agent what the library is SUPPOSED to do (current, version-aware docs); codecalc runs the code and proves what it actually does. Docs never stand as proof on their own, and where a doc and a run disagree, the run wins and the source settles it.

## When calling is mandatory

| You are about to | Use |
|---|---|
| write code against a library, SDK, API or CLI you have not confirmed the current signature for | Context7 (`resolve-library-id` then `query-docs`, or `ctx7 library` / `ctx7 docs`), then write the call |
| claim a documented behaviour is what the code actually does | run it (`execute_code`, the project's own test suite, or a REPL), never the doc alone |
| a doc and a run disagree | the run wins. Say so, and say what the doc got wrong (a stale version, a changed default, a deprecated flag) |
| training-data recall of a library's API surface, with no source open | treat it as a guess until a doc or a run confirms it; version drift and renamed APIs are the common failure, not a rare one |

Trivial, unversioned standard-library calls you would bet the build on are exempt. Anything with a version number attached to its behaviour is not.

## How to report a documentation-derived claim

Name the library, the version if Context7 returned one, and that it came from docs, not a run: "per Context7, `/vercel/next.js@14.0.0`'s middleware API takes X" reads differently from "Next.js middleware takes X", because the first can be checked against a version and the second cannot. If the claim was then verified by running it, say that too, and which one actually settled the question.

## Without Context7

The rule still binds. Read the vendor's own README, changelog or source before writing code against it, the same way this repository's own `AGENTS.md` asks: read the actual API, not a recollection of it. What is not allowed is code written against a remembered shape of a library that was never opened this session.

Source: https://github.com/upstash/context7
