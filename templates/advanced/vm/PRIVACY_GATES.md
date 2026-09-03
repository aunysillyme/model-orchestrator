# PRIVACY_GATES.md: what never leaves the machine

A bar that is not named is not enforced. Fill in the names.

## Data classes

| Class | Examples | May go to |
|---|---|---|
| Public | published posts, open docs, public repos | any lane |
| Working | your own notes, drafts, code you will publish | your primary vendor's lanes, subscription CLIs you trust with it |
| Confidential | client data, other people's records, contracts | your primary vendor only, or the local lane |
| Personal | health, identity, private journals | the local lane only, or nowhere |

## Lanes barred by name for Confidential and Personal

- metered third-party bulk lanes (the cheapest-tier API you use for volume)
- concurrent fan-out lanes on a consumer subscription
- any shared compute lane (free GPU tiers, notebook services)
- any tool that stores conversation history on its own servers without a retention control you have read

Write your own lane names here, in this file, so the bar is checkable:

```
BARRED: <lane>, <lane>, <lane>
```

## The local lane is a privacy lane, not a cost lane

Route to a local model when confinement is the requirement. Never to save money: the accuracy gap is real, and pennies saved are not worth a wrong answer that looks right.

## The check

Before any bulk call: which class is this data, and is the lane in the barred list? If you cannot answer both, it is Confidential.
