# Model-orchestrator website

## What and why

The product page and documentation live in this repository so a change to a guide travels with the code it explains. The site preserves the approved dark green design and renders public Markdown through `marked`, `github-slugger` and `sanitize-html`. These are isolated website dependencies, excluded from the published npm package by its existing `files` allowlist.

Production URL: https://model-orchestrator.aunysillyme.dev.

## Trigger

The Vercel Git integration builds pushes to this repository's `main` branch for production. Other eligible branches and pull requests receive preview deployments. A merged README, guide or changelog update therefore rebuilds the site without copying that content into another repository.

Publishing an npm version is a separate event. The landing page asks the public npm registry for its current `latest` version on each visit, with a five-second timeout. It displays only the already-rendered changelog excerpt matching that version. It never treats an `Unreleased` entry or the repository's package version alone as proof of an npm release.

## Invocation chain

1. GitHub push reaches the Vercel project `model-orchestrator`, connected to `aunysillyme/model-orchestrator`.
2. Vercel runs `npm --prefix website ci` using the committed website lockfile.
3. The configured build runs `npm test && npm --prefix website run build && npm --prefix website run check`.
4. `website/build.mjs` reads the public source files and writes only `website/dist`.
5. The website checks validate generated pages and behavior. A failed build leaves the previous successful production deployment in place.
6. Vercel serves `website/dist` at the custom domain. Cloudflare provides DNS for the subdomain.

The documentation hub uses `/docs/guides/`; `/docs/` redirects there. Avoid an `index` route segment: Vercel normalizes it away before looking up the page.

The root `vercel.json` is the source of the install, build and output settings. The project uses Node 24; local website development requires Node 22 or later. The package's Node 18 support remains separate.

## Dependencies

- Vercel project and GitHub integration: project ID `prj_HWCUc01VxliaCToJBeQbqg8pjgo0`, team `aunysillymes-projects`.
- Cloudflare DNS: the `model-orchestrator` record under `aunysillyme.dev`. DNS-only CNAME to `bb9493e20ea5c81c.vercel-dns-016.com`, TTL 300, record ID `6028469f5b74ecc19db52364830cbd40`. Vercel reported the domain correctly configured and HTTPS served the site publicly on 2026-09-28.
- npm registry: public, credential-free metadata for `model-orchestrator/latest`.
- Cloudinary: the approved silent v2 trailer, public ID `aunysillyme.dev/model-orchestrator-trailer`, version `1790569976`.
- Google Fonts: Cormorant Garamond and JetBrains Mono, with local serif and monospace fallbacks.
- Google Analytics: the existing `G-HK1CE993HY` measurement ID, once per HTML page.
- Website packages: exact versions in `website/package-lock.json`; `marked` and `sanitize-html` use MIT licenses, `github-slugger` uses ISC, and `htmlparser2` uses MIT. npm metadata and installed package source were checked during implementation. No dependency is copied into the installer.

## Reads

`website/content.mjs` explicitly lists the public Markdown sources: the repository README, public guides in `docs`, command README, proof README and changelog. The build does not recursively publish repository files or operational instructions.

`website/landing.html` owns the editorial introduction. `website/assets` owns the approved avatar, CSS and browser behavior. Changes to marketing copy or the trailer URL still require a source edit and push. The automation updates existing content; it does not invent new feature explanations or generate a new video.

The source commit comes from `VERCEL_GIT_COMMIT_SHA`, or the local Git HEAD. npm metadata is fetched at build time with a ten-second timeout. `website/release-fallback.json` is a previously verified public release, used only when that lookup fails.

## Writes

`website/dist` contains the landing page, documentation pages, 404 page, static assets, robots file, sitemap and `build-info.json`. The latter records the source commit, build time and published-version verification state. It contains no credentials.

The builder deletes and recreates only that generated output directory. Generated output and installed website dependencies are Git-ignored.

## The closed loop

Vercel build logs and the deployment status report build failures. The build executes the package suite and website checks before publication. The website checks are demonstrated capable of rejecting broken anchors and duplicate Analytics tags; sanitizer and playback checks exercise unsafe input and reduced-motion conditions.

`build-info.json` lets the deployment owner compare the live source commit with the expected Git commit. Confirm a successful Git-triggered deployment and fetch this file after a push to verify the full update path.

There is no separately configured uptime monitor or paging service. Someone must inspect Vercel/GitHub deployment status when a push fails. Auny owns the project; share its failed deployment URL with her when intervention is needed.

## Failure modes

- Package test, site build or check fails: the current production deployment stays available; fix the failed check and push again.
- npm is unavailable at build time: the build uses the explicitly dated fallback. On a visitor's failed refresh, a visible status explains that the last built version is being shown.
- A published version has no matching repository changelog entry: its badge can update, but older notes are hidden. The page directs the visitor to GitHub while the site updates.
- Registry caching: npm's HTTP cache can delay visible release metadata for several minutes. A forced site redeploy is not required just to refresh the version badge.
- Autoplay is blocked or reduced motion is requested: the poster and native play controls remain usable. Playback is never looped automatically.
- Cloudinary or Google Fonts is unavailable: the rest of the page remains available; the video has a direct link and fonts have local fallbacks.
- A Markdown link points to a source file outside the public page list: it opens the corresponding GitHub source file. Included guides resolve to local pages and their anchors are checked.

## Run and verify by hand

From the repository root:

```sh
npm --prefix website ci
npm test
npm --prefix website run build
npm --prefix website run check
python3 -m http.server 8773 --directory website/dist
```

Open the local URL, check the desktop and mobile layouts, follow a documentation link, use the install copy button, and scroll the trailer at least halfway into view. It should play once, silently. With reduced motion enabled, use the native play button instead.

For production, open the custom domain and `/build-info.json`. Match its commit to the intended Git push and inspect the corresponding Vercel build's successful test output. Launch verified on 2026-09-28: Git push `ff74138b02c8ada3acf449ef95cdfae920bea2ec` automatically created production deployment `dpl_Esua8ytjsTdo8EBK9U6xYNuU28an` (source `git`, state `READY`). The public HTTPS `/build-info.json` returned that exact commit, npm version `1.0.1`, and 15 content pages. Vercel ran the package and website checks before promotion. GitHub website run `36380117546` also passed.

Rollback uses Vercel's previous successful production deployment. Record its deployment identifier before promoting a replacement. The initial launch deployment was `dpl_Esua8ytjsTdo8EBK9U6xYNuU28an` at commit `ff74138b02c8ada3acf449ef95cdfae920bea2ec`. That initial deployment predates the documentation-hub route correction. Select a later verified deployment when rolling back, and check `/docs/guides/` returns HTTP 200. The first launch had no prior product-site deployment to restore; its rollback is removal of the new subdomain assignment/DNS record without changing the portfolio's apex or www records.

The shared Open Graph and Twitter thumbnail is `/assets/social-preview.png` (1200 × 630). Its editable source is `website/design/social-preview.svg`, adapted from the portfolio’s original template with its avatar, data background and three-tone green border. After editing the SVG, render locally with `rsvg-convert website/design/social-preview.svg -o website/assets/social-preview.png` (librsvg and the template’s Monaco/Helvetica Neue fonts are needed locally). Commit both files. Production uses the committed PNG and needs no image-rendering dependency. `website/content.mjs` assigns it to every generated page; it is separate from the trailer poster. Website checks verify the image size and metadata, and Vercel’s existing Git build publishes it. After deployment, verify the public image URL returns `image/png` and matches the committed bytes.

## Source of truth

- Product behavior and documentation: this repository's README, public guides and CHANGELOG.
- Published version: npm registry, not the package version in an unshipped checkout.
- Layout and presentation: `website/landing.html`, `website/content.mjs` and `website/assets`.
- Build and checks: `website/build.mjs`, `website/checks.mjs`, website lockfile and root `vercel.json`.
- Live deployment and DNS: Vercel project and Cloudflare zone configuration, verified by the deployment owner.

Do not manually edit generated HTML. Change its source and push through the same checked build.
