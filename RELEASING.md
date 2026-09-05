# Releasing

Maintainer notes. A release is one file edit and four commands until release automation is switched on.

1. Every change in the release has a line under `[Unreleased]` in `CHANGELOG.md`, in one of the Keep a Changelog categories (Added, Changed, Deprecated, Removed, Fixed, Security).
2. Move `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, add the compare link at the bottom of the file, and set the same version in `package.json`.
3. `npm test` green locally; CI green on the last push to `main`.
4. `git tag -a vX.Y.Z -m "X.Y.Z: <one line>"` and `git push origin main --tags`.
5. `gh release create vX.Y.Z --notes-from-tag` or paste the changelog section as the notes.
6. Update the `npx github:...#vX.Y.Z` example in `README.md` (the primary install line is `npx model-orchestrator` and needs no edit).

## npm

Published since 0.1.4 (first publish manual: `npm login`, `npm whoami`, `npm publish --access public`; `--provenance` cannot be used outside a CI runner).

From the next tag on, `.github/workflows/release.yml` publishes: pushing `vX.Y.Z` runs the tests, checks the tag against `package.json`, and runs `npm publish --provenance --access public` through npm trusted publishing (OIDC, no stored token). One-time setup on npmjs.com, package settings, Trusted publisher: GitHub Actions, owner `aunysillyme`, repository `model-orchestrator`, workflow `release.yml`, environment empty. Configured 2026-09-05 with direct publish allowed; 0.1.5 was the first workflow-published release.

The `files` allow-list in `package.json` is what ships; check `npm pack --dry-run` before a publish. Versions stay on `0.y.z` until the installer's flags and `cli-run`'s exit codes stop changing (SemVer clause 4).
