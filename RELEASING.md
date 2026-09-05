# Releasing

Maintainer notes. A release is one file edit and four commands until release automation is switched on.

1. Every change in the release has a line under `[Unreleased]` in `CHANGELOG.md`, in one of the Keep a Changelog categories (Added, Changed, Deprecated, Removed, Fixed, Security).
2. Move `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, add the compare link at the bottom of the file, and set the same version in `package.json`.
3. `npm test` green locally; CI green on the last push to `main`.
4. `git tag -a vX.Y.Z -m "X.Y.Z: <one line>"` and `git push origin main --tags`.
5. `gh release create vX.Y.Z --notes-from-tag` or paste the changelog section as the notes.
6. Update the pinned `npx github:...#vX.Y.Z` lines in `README.md`; they are the install route until the package is on npm.

## npm

Not published at the time of writing. When it is, publish with provenance from a workflow that has `id-token: write` and a trusted-publishing configuration on the package, so no long-lived token exists:

```bash
npm publish --provenance --access public
```

The `files` allow-list in `package.json` is what ships; check `npm pack --dry-run` before the first publish. Versions stay on `0.y.z` until the installer's flags and `cli-run`'s exit codes stop changing (SemVer clause 4).
