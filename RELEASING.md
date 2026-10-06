# Releasing

Maintainer checklist for a versioned release through the existing trusted-publishing workflow.

1. Every change in the release has a line under `[Unreleased]` in `CHANGELOG.md`, in one of the Keep a Changelog categories (Added, Changed, Deprecated, Removed, Fixed, Security).
2. Move `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, add the compare link at the bottom of the file, and set the same version in `package.json`. Then `npm run gen:plugin`, so `plugin/.claude-plugin/plugin.json` carries the same version (`test/plugin.test.js` fails until it does), and `claude plugin validate --strict plugin` to confirm the bundle still passes Claude Code's own check.
3. `npm test` green locally; CI green on the last push to `main`.
4. `git tag -a vX.Y.Z -m "X.Y.Z: <one line>"` and `git push origin main --tags`.
5. `gh release create vX.Y.Z --notes-from-tag` or paste the changelog section as the notes.
6. Nothing in `README.md` carries the version: the install line is `npx model-orchestrator` and the GitHub one-liner points at main, with a test that fails on any `#vX.Y.Z` in the README that is not `package.json`'s version. If a vendor pin changed, `npm run gen:catalog` first, so the compatibility table and `docs/catalog.md` follow the catalog.

## Refresh the release evidence

- Run the reproducible measurement scripts under `proof/scripts/` and regenerate the page from `proof/results.json` in release week.
- Verify every published figure has its date, method, sample size, script and unexpired data entry. Author-setup figures need their own sources and local remeasurement.
- Replay acceptance checks and run `npm test` against the final tree. Confirm `npm pack --dry-run` excludes development scripts and private review material.
- Confirm the GitHub description matches `package.json` exactly. The npm description and README update through publication.
- Packaging skill packs with `npm run pack:agensi` requires the `zip` command on PATH. Install it with `brew install zip` on macOS or `apt install zip` on Debian/Ubuntu.
- Refresh `docs/demo.gif` from the published version using `scripts/record-demo.sh`; verify the rendered recording. Update any dated trailer proof figures from the same results data before launch.
- Write release notes around what readers get and the 0.1.x upgrade path.

## npm

Published since 0.1.4 (first publish manual: `npm login`, `npm whoami`, `npm publish --access public`; `--provenance` cannot be used outside a CI runner).

From the next tag on, `.github/workflows/release.yml` publishes: pushing `vX.Y.Z` runs the tests, checks the tag against `package.json`, and runs `npm publish --provenance --access public` through npm trusted publishing (OIDC, no stored token). One-time setup on npmjs.com, package settings, Trusted publisher: GitHub Actions, owner `aunysillyme`, repository `model-orchestrator`, workflow `release.yml`, environment `release`. Configured 2026-09-05 with direct publish allowed, and the environment added on 2026-09-30; 0.1.5 was the first workflow-published release. The publish job runs in the GitHub environment `release`, which only `v*` tags can deploy to, so a pushed tag publishes on its own once the tests pass. The environment's approval step was removed on 2026-10-05.

The `files` allow-list in `package.json` is what ships; check `npm pack --dry-run` before a publish. From 1.0, preserve the documented installer flags and runner exit-code contract within the major version.
