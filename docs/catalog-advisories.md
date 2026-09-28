# Catalog advisory checks

## What and why

The repository checks exact executable package and container pins in `src/catalog.js`. OSV API v1 answers direct npm and PyPI package/version queries. Trivy examines OS and language packages in the selected container image. This check gives dated advisory evidence for its stated coverage. A clean result does not prove safety.

The owning files are `scripts/catalog-advisory-inventory.mjs`, `scripts/check-catalog-advisories.mjs`, `scripts/catalog-advisory-http.mjs`, `scripts/catalog-advisory-containers.mjs`, `docs/catalog-advisory-exceptions.json` and `.github/workflows/catalog-advisories.yml`. This document describes the complete operating procedure.

## Trigger

The `catalog advisories` workflow runs on every push to main, on pull requests changing the catalog, checker, exceptions, tests or workflow, and by manual dispatch. It has read-only repository permissions. There is no periodic schedule; a maintainer can dispatch a fresh check when advisory data changes. Existing Dependabot automation continues to update GitHub Actions separately.

## Invocation chain

1. The workflow checks out the source and selects Node 22.
2. The inventory imports `AIS`, `TOOLS`, `IMAGES` and `PROVIDERS` directly from the catalog. npm names come from `install.npm`; companion ecosystem, package and extras come from their `advisory` metadata. Every version comes from the existing pin field.
3. The package adapter posts exact package/version queries to `https://api.osv.dev/v1/querybatch`, then retrieves each returned advisory from `/v1/vulns/<id>` to retain ranges and fixed versions.
4. The container adapter resolves target tags to a platform-specific SHA-256 manifest digest, checks the manifest and image configuration, and records the platform. Docker Hub and GHCR public images are supported; another registry is unknown until its adapter is implemented.
5. The adapter resolves the Trivy scanner image to a digest too, asserts its reported version, and runs that scanner against the target digest. It starts no target image or vendor service. Scanning uses registry access, with no host mounts or Docker socket passed into the scanner.
6. Exact, unexpired exceptions are applied. The checker writes `report.json` and `summary.md`, then exits with its result code. The workflow appends the summary to the job and uploads both files even if the scan step fails.

## Dependencies

A repository checkout, Node 18+ with built-in fetch, Docker with a running Linux-container daemon, public HTTPS registry access, OSV, and the Trivy vulnerability databases are needed for a complete local check. CI supplies Node 22 and Docker. Package checks need only Node and OSV. A missing scanner, daemon or database produces unknown container results while retaining available package results.

Trivy is version-pinned in `scripts/catalog-advisory-containers.mjs`. Each run resolves that scanner tag to an immutable digest and records it in each container result. Runtime version verification rejects a binary that reports a different version. The version probe has a 60-second deadline; image scans have Trivy's 10-minute deadline and a 12-minute client deadline, followed by bounded container cleanup. The scanner tag itself can move between runs; the recorded digest is the reproducible scanner identity for that run. For exact reproduction, fetch the scanner and target digests from the report before investigating.

Pin provenance, checked 2026-09-28 against upstream: `actions/checkout` `3d3c42e` is tag v7.0.1, `actions/setup-node` `8207627` is tag v7.0.0, and `actions/upload-artifact` `043fb46` is tag v7.0.1 in each action owner's repository. Trivy 0.74.0 is the latest release in Aqua Security's official repository (2026-08-14) and its public image tag resolves to `sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`. The first successful main-branch artifact is the check that the JSON parser matches this Trivy version.

To update the scanner, verify the desired release in Aqua Security's official Trivy repository, resolve its public registry tag to a digest, and inspect the pinned version's `image --help`, JSON report schema and database requirements. Change `TRIVY` in `scripts/catalog-advisory-containers.mjs`, run the offline fixtures, then run the real checker and inspect its recorded scanner digest and version. This builder could not compare the JSON parser with current official Trivy source; that compatibility is **UNVERIFIED** until a real scan passes. To update an action, compare its full commit SHA against the release tag in the action owner's repository and update the SHA and version comment together. Run the workflow and download the artifact before accepting either upgrade.

## Reads

- `src/catalog.js`: package names, ecosystems, extras, exact versions, image references and excluded inputs. A new companion without advisory metadata becomes unknown.
- `docs/catalog-advisory-exceptions.json`: the reviewed exception array, initially empty.
- OSV: current direct-package advisory matches and their details. No project files are sent.
- Public container registries: manifests, configurations, layers and anonymous pull authorization. Anonymous registry tokens stay in memory. User sign-ins are not read by the resolver; the Docker client receives an empty temporary configuration directory.
- Trivy databases: current OS and language advisories. All severities and unfixed findings are retained.

Direct package checks do not resolve dependency trees. Each such input has an explicit transitive-dependency exclusion. `codecalc[full]` also has an optional-extras exclusion: querying the base distribution does not cover dependencies selected by `full`. Vendor installer scripts, unpinned downloads/package-manager inputs, chat apps and hosted model services are named exclusions. Compatibility snapshots such as `builtAgainst` are not installation pins. Image coverage is the OS and language packages Trivy recognizes; unsupported OS images and empty package results are unknown.

## Writes

The default output directory is `.release-work/catalog-advisories/`. The checker writes:

- `report.json`: source commit, timestamp, scanner versions, catalog input, ecosystem, exact version, image/scanner digest, platform, coverage, status, advisory IDs, ranges, fixed versions and matched exception expiry.
- `summary.md`: the same result in a concise human-readable form, with explicit exclusions.

CI retains these as `catalog-advisories-<commit>-<attempt>` for 30 days and shows the summary in the job. An early workflow failure creates an unknown fallback report instead of presenting a missing report as success. The checker creates and removes an empty temporary Docker configuration directory. Scanner cache data lives under `/tmp/trivy` in its disposable writable container layer; `--rm` removes that layer. A disk-backed layer accommodates large image scans without a small RAM-backed cache cap. The scanner runs as a nonroot user with capabilities dropped, no new privileges, and no host filesystem or socket mounts. Live disk usage is **UNVERIFIED** here. Catalog pins and installed dependencies are never changed.

## The closed loop

GitHub Actions is the watcher. A maintainer reviews every affected or unknown result before merging or releasing. No automatic issue, upgrade, exception or release is created by this workflow. Branch-protection configuration is repository administration: **UNVERIFIED** here. To make a green check mandatory, require the `catalog advisories / scan` check in the repository's branch rules.

| Status | Meaning | Exit behavior |
|---|---|---|
| clean | Complete adapter response with no advisory match in stated coverage | 0 if every result is clean or excepted |
| affected | At least one advisory match lacks a valid exception | 1 unless another result is unknown |
| unknown | Missing, unavailable, unsupported or malformed evidence, or an invalid exception policy | 2 |
| excepted | Every advisory match has an exact, reviewed, unexpired exception | 0 if every result is clean or excepted |

A Go binary built without module version stamping lists its own main module with no version (Trivy marks it `Relationship: root` in a language-package result). Its dependencies are still listed and scanned, so that one entry is recorded by name in `unversionedRoots` and does not make the image unknown. Any other package without a version keeps the image unknown.

Any unknown takes precedence over affected for the exit code. Known advisory IDs are still retained when a detail lookup fails. Empty results never pass. Read the exclusions alongside the status; exclusions are never counted as clean pins.

## Failure modes

- **OSV timeout, HTTP error or malformed response:** package results become unknown. A valid empty query result (`{}`) means no returned match; a missing result array or missing position is unknown.
- **Registry failure, bad image reference, missing platform or digest mismatch:** the image is unknown. The checker retains the other results.
- **Docker, scanner or database failure:** the image is unknown. No exception suppresses unknown status. Check network access and the daemon, then rerun the same source.
- **Incomplete scanner JSON, mismatched digest/platform or unsupported image OS:** the image is unknown even if the process exited successfully.
- **Advisory outage:** keep the failing result, retry after recovery, and inspect the provider's status through its normal support channel. An outage is not an exception for a package.
- **Expired or malformed exception:** expired entries stop matching at 00:00 UTC on their expiry date; malformed policy blocks success. Expired entries are retained in `expiredExceptions` for review.
- **Interrupted job:** `always()` upload and summary steps preserve available evidence. A runner outage can still prevent artifact upload; verify artifact presence in the run itself.

## Exception review

The exception file is a JSON array. Every entry requires `ecosystem`, `package`, `version`, `advisory`, `rationale` and `expires` (`YYYY-MM-DD`). Wildcards and unknown fields are rejected. Match the exact advisory ID emitted by the adapter, not an alias. A package exception optionally names its exact catalog `source` in `target`. A container exception requires `target` equal to the exact catalog image reference and identifies the vulnerable component package and installed version, not every component in the image.

For example, a metadata-only example is:

```json
[
  {
    "ecosystem": "npm",
    "package": "fixture-package",
    "version": "1.0.0",
    "advisory": "TEST-2026-0001",
    "rationale": "Example only: replace with a reviewed reason and tracking reference.",
    "expires": "2026-10-01"
  }
]
```

A maintainer reviews the affected range, fixed versions, applicability, expiry and rationale in a normal pull request. Use a short explicit expiry and a tracking reference in the rationale. Never add an exception merely because the database or scanner is unavailable. Review expired entries and remove those whose pin or advisory is no longer relevant. A matched exception remains visible as excepted with its expiry; it is never relabeled clean. Fixing a package requires a separate deliberate catalog-pin change and the usual installer validation.

## Run and verify by hand

From the repository checkout:

```bash
node --test test/catalog-advisories.test.js
node scripts/check-catalog-advisories.mjs --report-dir .release-work/catalog-advisories
```

The fixture tests use metadata only and make no network request. The second command makes real advisory and registry requests and may start the pinned scanner container. Use `--platform linux/arm64` to inspect another declared image platform; the default is `linux/amd64`. Use `--exceptions <path>` for a reviewed alternate policy and retain that file with the evidence.

1. Read both output files and check `sourceCommit`, `generatedAt`, every catalog source, scanner identity, platform and exclusions.
2. For a package finding, retrieve its recorded OSV detail URL and compare the affected package, ranges and fixed versions. The fixture's affected result must exit 1; an unavailable-data result must exit 2.
3. For an image finding, pull the recorded scanner digest and run its `image --scanners vuln --list-all-pkgs --format json --platform <platform> --image-src remote <image>@<digest>` command. Compare the component name, installed version, advisory ID and database evidence. A later database can change matches while the image stays identical.
4. Inspect the GitHub run on main and download its report artifact. A local report is not proof of main-branch retention. Re-run the workflow after an outage and confirm a new timestamp.
5. Run `npm test` before releasing. Existing OIDC publication and installer flags are unchanged by this check.

## Source of truth

Catalog pins and companion metadata: `src/catalog.js`. Exception decisions: `docs/catalog-advisory-exceptions.json` and its reviewed change. Operational behavior: this document and the checker modules. Dated evidence: the uploaded GitHub run artifact. Upstream evidence: each report's OSV URL and Trivy data-source URL. A report describes the source commit, selected platform and database responses at its recorded time; it is not a permanent certificate.
