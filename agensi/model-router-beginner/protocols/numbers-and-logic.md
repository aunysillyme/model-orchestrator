# Numbers and logic: compute decision inputs

When a number or logical claim affects a decision, compute it with an appropriate tool. This includes money, rates, percentages, budgets, token counts, comparisons, complexity, equivalence and performance claims. Trivial single-digit sums can be stated directly.

Optional companion: **codecalc**, optional, verify availability at setup; otherwise use the local runtime, spreadsheet or tests.

## Select the check

| Claim | Verification |
|---|---|
| A figure someone will act on | Exact arithmetic with a calculator, interpreter or spreadsheet |
| One option is cheaper, larger or faster | Compute both values and their comparison |
| A port preserves behavior | Relevant tests or `verify_translation` |
| An optimization preserves behavior | Regression checks or `verify_optimization` |
| Complexity or scaling | Source analysis or `analyze_complexity`; benchmark measured performance |
| A logical property or constraint holds | An appropriate solver such as `z3_check` or a truth table |
| A snippet behaves a certain way | Run it with `execute_code` or the project's local runtime |

When using a companion command, probe that tool's current schema before calling it. When codecalc is absent, use the local runtime, test suite, spreadsheet or a suitable calculator.

## Report the evidence

- Give the input, exact result and useful decimal representation, with method and source.
- For measurements, name the script, sample size, environment and date.
- When a tool reports a limit or an unenforced property, state it beside the result.
- When a claim cannot be computed or checked from available evidence, mark it UNVERIFIED.
- When a decision depends on logic, report the checked property and result. Keep private chain-of-thought out of the evidence record.

Companion source: https://github.com/The-40-Thieves/codecalc
