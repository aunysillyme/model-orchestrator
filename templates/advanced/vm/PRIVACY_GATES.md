# PRIVACY_GATES.md: match data to authorized lanes

Before sending data to a lane, classify it under the project's policy and verify the lane is authorized for that class. Fill in the allowed and barred lane names before using this template with protected information.

## Data classes

| Class | Examples | Choose |
|---|---|---|
| Public | Published posts, open docs, public repositories | Any lane permitted by project policy |
| Working | Internal drafts and unpublished code | Lanes approved for this project |
| Confidential | Client records, contracts and restricted business data | Explicitly approved processors or a local runtime |
| Personal | Health, identity and private journals | Explicitly authorized processing with the required privacy boundary |

## Name the boundaries

Record the actual tool names and the reason for each rule:

```
ALLOWED FOR <class>: <lane>, <lane>
BARRED FOR <class>: <lane>, <lane>
```

Review a provider's retention, training and access policy before approving a new lane for protected data. Never send protected information to an unapproved bulk, fan-out or shared-compute lane.

## Use the local lane for confinement

When data must remain on the machine, use a local runtime and verify that its tools and logging preserve that boundary. Check its task quality with the same acceptance checks used for any other lane.

## Check before dispatch

When a bulk call is ready, verify the data class, the selected tool and the permission that allows it. When classification or permission is unresolved, keep the data local and obtain the missing decision before dispatch.
