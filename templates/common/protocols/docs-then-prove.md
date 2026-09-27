# Docs, then prove: verify interfaces on the runtime

When coding against a changing library, SDK, API or CLI, read current documentation for the version in use, then run a check against the actual runtime.

Optional companions: **Context7** (Upstash), {{CONTEXT7_STATUS}}, for documentation; **codecalc**, {{CODECALC_STATUS}}, for execution checks.

## Check an interface

1. Identify the library and installed or requested version.
2. Read its current official documentation or source. With Context7, resolve the library ID before querying its docs unless a verified ID is already available.
3. Write the smallest representative call and run it through the local runtime, test suite or codecalc.
4. When docs and runtime disagree, inspect the implementation and version, record the difference, and base the build on verified behavior.
5. Name the source, version, runtime check and result in the task evidence.

## Official-source and local-runtime workflow

When Context7 is absent, use the vendor's documentation, README, changelog or installed source. When codecalc is absent, use the project's own interpreter or tests. When neither path can verify the needed behavior, mark that assumption UNVERIFIED and route the probe to a lane with authorized access.

When reporting a documentation-only claim, label it as such. When a run verifies it, cite the check separately. Keep consequential arithmetic under `numbers-and-logic.md`.

Companion source: https://github.com/upstash/context7
