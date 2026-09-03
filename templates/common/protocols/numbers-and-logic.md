# Numbers and logic: compute, never guess

**Never do arithmetic in your head when being wrong would matter.** Money, rates, percentages, margins, budgets, token and cost counts, any comparison you are about to state, any complexity or equivalence or speedup claim, anything past 2^53. A wrong number that looks right is worse than no number, because it gets acted on.

A model that is confident about `0.1 + 0.2` does not feel uncertain. It feels finished. The tool exists so the feeling is not the check.

Companion tool for this rule: **codecalc**, {{CODECALC_STATUS}}.

## When calling is mandatory

| You are about to | Use |
|---|---|
| state a number someone will act on | `evaluate_expression` (exact rationals, no float drift) |
| say A is bigger, cheaper, faster than B | compute both, then compare; never eyeball |
| claim two programs behave the same (a port, a rewrite) | `verify_translation` |
| claim an optimization preserved behaviour | `verify_optimization` |
| state a Big-O, or that something scales | `analyze_complexity` (static) or `benchmark` (measured) |
| assert a logical property holds, or that a set of constraints is satisfiable | `z3_check` (SMT) or `truth_table` |
| run a snippet to see what it actually does | `execute_code` (31 languages, sandboxed) |

Trivial single-digit sums are exempt. Everything else is not.

## How to report a computed figure

Give the exact form and the decimal, and say which tool produced it. `37/210 = 17.62%` reads differently from `about 18%`; the first can be checked, the second cannot. If a tool returned `unenforced` or a grade below its top, say so beside the number.

## Logic flow

Reasoning scaffolds help models that have no native reasoning mode and add nothing to models that already think before answering. So: do not narrate a chain of thought as evidence. **The authorising evidence is the computed outcome, not the thought log.** When a decision hangs on a logical claim, encode the claim and check it (`z3_check`); when it hangs on behaviour, run it (`execute_code`); when it hangs on a figure, compute it. A trace that was never checked is a story.

## Without codecalc

The rule still binds. Use whatever computes: a shell `python3 -c`, a spreadsheet, the vendor's built-in interpreter. What is not allowed is the number that came from nowhere.

Source: https://github.com/The-40-Thieves/codecalc
