# DELEGATION_MATRIX.md: task → lane → pick

Generated {{DATE}} from the AIs you said you have: `{{AI_IDS}}`.

## Your lanes

{{LANES_TABLE}}

## Task → lane

| Task type | Pick | Why |
|---|---|---|
| Bulk classify / extract / summarize, data may leave the machine | the cheapest metered lane, then the fast tier | cost gap is an order of magnitude; batch APIs add more |
| Bulk work on data that must stay local | the local lane | a privacy lane, never a cost lane; route here for confinement, not to save money |
| Many independent items each needing its own agent turn | a concurrent fan-out lane | one call, N children, on a subscription |
| Live web or social reads | the live-data CLI | subscription-covered; the same search on the API bills per call |
| Code review, no changes | standard tier, or the second-coder CLI | a different model family catches what one misses |
| Adversarial audit of a security-shaped diff | the second-coder CLI in read-only audit mode | Claude writes, a second family attacks, the orchestrator reproduces |
| Deep architecture / planning | deep tier | expensive to get wrong |
| Well-specified execution | the orchestrator | execution does not need the top tier |
| Long-document analysis | the largest-context lane, or caching on the primary | window size vs re-query cost |
| Routing decisions themselves | the cheapest lane you have, or none | never spend deep tokens deciding not to use deep |
| Rough drafts, divergent reads, first-pass summaries | the free tier | $0, and disagreement with the primary is information |
| Anything citing a line, a number, or a source | never the cheapest metered lane without a full verification pass | measured: conclusions right, every supporting number invented |

## Install and sign-in

{{INSTALL_TABLE}}

## Cost playbook

1. Prompt caching everywhere it fits: frozen prefix first, volatile text last.
2. Cascade: cheapest capable tier first, escalate on signal.
3. Batch APIs for anything not latency-sensitive.
4. A free or local model for routing decisions.
5. Effort and reasoning knobs before model swaps; often the bigger lever.
6. Alias-based config so a vendor rename is a one-line repoint.

## Privacy gate

No private notes, client data, or personal records go to a metered third-party bulk lane or a fan-out lane. Name the barred lanes explicitly in your own rules; an unnamed bar is not enforced.
