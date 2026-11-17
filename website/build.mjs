import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { documentHtml, renderMarkdown, releaseEntries, pages, origin, repository, escape, populateLanding } from './content.mjs';
import { validRelease } from './assets/releases.js';
import {marked} from 'marked';
import {sourceDocument, discoveryFiles, publicRoutes, relativeTargets} from './discovery.mjs';
import {renderProjectsPopup} from '../scripts/lib/projects-popup-render.mjs';

export const routeMeta = new Map([
  ['/', {
    title: 'Model Orchestrator: AI Coding Agent Router (Claude & Codex)',
    description: 'Open-source model router for Claude Code, Codex and Gemini CLI: routing rules, 8 subagents, hooks and an aunx CLI runner. Install via npx (MIT).',
  }],
  ['/docs/overview/', {
    title: 'Overview & Architecture | Model Orchestrator',
    description: 'How model-orchestrator routes planning, coding, review and bulk tasks across Claude Code, Codex, Gemini CLI and local models with verifiable checks.',
  }],
  ['/docs/guides/', {
    title: 'Documentation & Setup Guides | Model Orchestrator',
    description: 'Browse all model-orchestrator guides: fresh installation, routing rules, CLI delegation, Level 1 to Level 3 setups, companion tools and measured proof.',
  }],
  ['/docs/commands/', {
    title: 'CLI Commands & aunx Runner Reference | Model Orchestrator',
    description: 'Reference for aunx CLI commands: scoped cli-run task execution, task briefs, acceptance check gates, routing metrics and multi-agent lane flags.',
  }],
  ['/docs/proof/', {
    title: 'Measured Token & Gate Proof | Model Orchestrator',
    description: 'Inspect dated token measurements, sample sizes, empty-result fixture catches, acceptance gate blocks and scripts to reproduce results locally.',
  }],
  ['/docs/changelog/', {
    title: 'Release Notes & Changelog | Model Orchestrator',
    description: 'Version history and release notes for the model-orchestrator npm package, covering routing rules, subagent templates, CLI flags and security fixes.',
  }],
  ['/docs/install/', {
    title: 'Install & Upgrade Guide | Model Orchestrator',
    description: 'Install model-orchestrator with npx or npm: fresh setup walkthrough, --dry plan preview, backed-up config files, activation check and upgrade steps.',
  }],
  ['/docs/how-it-routes/', {
    title: 'How Task & Model Routing Works | Model Orchestrator',
    description: 'See how model-orchestrator maps research, planning, implementation, review and bulk jobs to model tiers and effort levels in your installed AI stack.',
  }],
  ['/docs/guarantees/', {
    title: 'Verification Guarantees & Limits | Model Orchestrator',
    description: 'What model-orchestrator enforces in executable code versus prompt instructions: acceptance gates, backup safety, CLI exit codes and review boundaries.',
  }],
  ['/docs/companions/', {
    title: 'Companion Tools & Integrations | Model Orchestrator',
    description: 'Optional open-source tools that pair with model-orchestrator: agent-personalizer, decompose, lean-browser-use, lean-computer-use and skill packs.',
  }],
  ['/docs/catalog/', {
    title: 'Supported AI CLIs & Model Catalog | Model Orchestrator',
    description: 'Detection, authentication and capability details for supported AI coding CLIs and providers in model-orchestrator, including Claude, Codex and Gemini.',
  }],
  ['/docs/part-1-beginner/', {
    title: 'Part 1: Route Work in One Agent | Model Orchestrator',
    description: 'Level 1 setup guide: route planning, coding and routine subagent tasks inside a single AI coding tool using editable project rules and subagents.',
  }],
  ['/docs/part-2-intermediate/', {
    title: 'Part 2: Delegate Across AI CLIs | Model Orchestrator',
    description: 'Level 2 setup guide: delegate scoped tasks across multiple installed AI CLIs on your machine with aunx cli-run, task briefs and cross-family review.',
  }],
  ['/docs/part-3-advanced/', {
    title: 'Part 3: Always-On Linux VM Setup | Model Orchestrator',
    description: 'Level 3 setup templates for an always-on Linux box: LiteLLM API gateway keys, subscription CLI separation, model aliases and scheduled audit jobs.',
  }],
  ['/docs/security-review-history/', {
    title: 'Security Review History & Audits | Model Orchestrator',
    description: 'Public security review log for model-orchestrator: threat boundaries, shell argument handling, secrets isolation and resolved audit findings by release.',
  }],
]);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const out = path.join(here, 'dist');
let commit = process.env.VERCEL_GIT_COMMIT_SHA;
if (!commit) commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full source commit SHA');
const built = new Date().toISOString();
const fallback = JSON.parse(await readFile(path.join(here, 'release-fallback.json'), 'utf8'));
let published = fallback;
let registryVerified = false;
try {
  const response = await fetch('https://registry.npmjs.org/model-orchestrator/latest', {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error(`npm returned ${response.status}`);
  const metadata = await response.json();
  if (!validRelease(metadata)) throw new Error('Unexpected npm metadata');
  published = {name: metadata.name, version: metadata.version, verifiedAt: built};
  registryVerified = true;
} catch (error) {
  if (!validRelease(fallback) || !fallback.verifiedAt) throw error;
  console.warn(`npm lookup unavailable; using verified fallback ${fallback.version} (${fallback.verifiedAt})`);
}

const changelog = await readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
const releases = releaseEntries(changelog);
const latest = releases.find(entry => entry.version === published.version);
function releaseSummary(markdown) {
  const tokens = marked.lexer(markdown);
  const list = tokens.find(token => token.type === 'list');
  return list ? list.items.slice(0, 2).map(item => item.raw).join('\n') : tokens.filter(token => token.type === 'paragraph').slice(0, 1).map(token => token.raw).join('\n');
}
const releasePanels = releases.map(entry => `<article class="release" data-release="${entry.version}"${entry === latest ? '' : ' hidden'}><div><strong>v${entry.version}</strong><small>${escape(entry.date)}</small></div><div class="release-copy">${renderMarkdown(releaseSummary(entry.markdown), 'CHANGELOG.md')}</div></article>`).join('\n');
const releaseArea = `<p class="note" data-release-status>${registryVerified ? 'Latest published version, checked with npm at build time.' : `Published version last verified ${escape(published.verifiedAt)}. Checking npm for an update.`}</p>${releasePanels}<p><a class="primary" href="/docs/changelog/">Full changelog ↗</a></p>`;
// Proof figures come from proof/results.json, the same data the test suite
// expires; an entry past its expiry date is left off the page.
const proofData = JSON.parse(await readFile(path.join(root, 'proof', 'results.json'), 'utf8'));
const today = built.slice(0, 10);
const current = new Map(proofData.entries.filter(entry => entry.expiresAt >= today).map(entry => [entry.id, entry]));
const n = value => Number(value).toLocaleString('en-US');
const card = (value, label, detail) => `<div class="proof-figure"><strong>${escape(value)}</strong><span>${escape(label)}</span><small>${escape(detail)}</small></div>`;
const usable = entry => entry && Number.isFinite(entry.value) && entry.value > 0;
const figures = [];
const main = current.get('author-main-browser-tokens'), sub = current.get('author-subagent-browser-tokens');
if (usable(main) && usable(sub)) figures.push(card(`${Math.floor(main.value / sub.value)}x`,
  `at least that many fewer tokens per browser step: ${n(main.value)} (main conversation, median) vs ${n(sub.value)} (small subagent, highest run)`,
  `Author's setup. Main: ${n(main.sampleSize)} steps, ${main.measuredAt}, Expires ${main.expiresAt}. Subagent: ${n(sub.sampleSize)} runs, ${sub.measuredAt}, Expires ${sub.expiresAt}.`));
const routingAb = current.get('routing-ab-cost-pct');
if (routingAb && Number.isFinite(routingAb.value)) {
  const passInfo = routingAb.deltas?.passRateRouted && routingAb.deltas?.passRateControl
    ? `, ${routingAb.deltas.passRateRouted} vs ${routingAb.deltas.passRateControl} pass`
    : '';
  figures.push(card(`${routingAb.value.toFixed(1)}%`,
    `single-turn A/B list-price USD change across ${n(routingAb.sampleSize)} tasks${passInfo} (tokens +${routingAb.deltas?.totalTokenChangePct ?? ''}% from route-table overhead)`,
    `Measured ${routingAb.measuredAt} · Expires ${routingAb.expiresAt} · sample ${n(routingAb.sampleSize)}`));
}
const empty = current.get('missing-results-caught');
if (empty) figures.push(card(`${empty.value} of ${empty.sampleSize}`, 'empty-result fixtures flagged', `Measured ${empty.measuredAt} · Expires ${empty.expiresAt} · sample ${n(empty.sampleSize)}`));
const gate = current.get('acceptance-failures-blocked');
if (gate) figures.push(card(`${gate.value} of ${gate.sampleSize}`, 'failing acceptance-check fixtures blocked by the gate', `Measured ${gate.measuredAt} · Expires ${gate.expiresAt} · sample ${n(gate.sampleSize)}`));
const proofFigures = figures.length ? `<div class="proof-figures">${figures.join('')}</div>` : '';

const {rows: setRows} = JSON.parse(await readFile(path.join(root, '.repo-build', 'set.json'), 'utf8'));
const projectsPopup = renderProjectsPopup({rows: setRows, current: 'model-orchestrator', id: 'projects-popup', fallbackHref: 'https://aunysillyme.dev/#projects'})
  .replaceAll('<a class="projects-popup__', '<a target="_blank" rel="noopener noreferrer" class="projects-popup__');
const siblings = setRows.filter(row => row.name !== 'model-orchestrator')
  .map(row => `<a href="${escape(row.url)}" target="_blank" rel="noopener noreferrer">${escape(row.name)} ↗</a>`).join('');
let landing = await readFile(path.join(here, 'landing.html'), 'utf8');
landing = populateLanding(landing, `v${published.version}`, releaseArea);
if (!landing.includes('{{PROJECTS_POPUP}}') || !landing.includes('{{SIBLINGS}}')) throw new Error('Missing landing placeholders');
landing = landing.replace('{{PROJECTS_POPUP}}', () => projectsPopup).replace('{{SIBLINGS}}', () => siblings);
if (landing.includes('{{PROJECTS_POPUP}}') || landing.includes('{{SIBLINGS}}')) throw new Error('Landing placeholders left unfilled');
landing = landing.replace('{{PROOF}}', () => proofFigures);
landing = landing.replace('</footer>', `<span>Source <a href="${repository}/tree/${commit}" target="_blank" rel="noopener noreferrer">${commit.slice(0, 7)}</a></span></footer>`);

await rm(out, {recursive: true, force: true});
await mkdir(out, {recursive: true});
await cp(path.join(here, 'assets'), path.join(out, 'assets'), {recursive: true});
await cp(path.join(here, 'assets', 'favicon.ico'), path.join(out, 'favicon.ico'));
const homeMeta = routeMeta.get('/');
await writeFile(path.join(out, 'index.html'), documentHtml({title: homeMeta.title, description: homeMeta.description, route: '/', body: landing}));

const navItems = [...pages].map(([source, slug]) => `<a href="/docs/${slug}/">${escape(({overview: 'Overview', guides: 'All guides', commands: 'Commands', proof: 'Measured proof', changelog: 'Changelog'})[slug] || slug.replaceAll('-', ' '))}</a>`).join('');
const publicDocuments = new Map();
for (const [source, slug] of pages) {
  const markdown = await readFile(path.join(root, source), 'utf8');
  const title = markdown.match(/^# (.+)$/m)?.[1].replace(/[`*_]/g, '') || slug;
  const route = `/docs/${slug}/`;
  const meta = routeMeta.get(route);
  if (!meta) throw new Error(`Missing SEO metadata for ${route}`);
  const body = `<header class="top"><a class="skip" href="#document">Skip to content</a><a class="brand" href="/"><img src="/assets/avatar.png" alt="AunySillyMe"><span>model-orchestrator</span></a><nav class="topnav" aria-label="Project links"><a href="/">Home</a>${projectsPopup}<a href="${repository}" target="_blank" rel="noopener noreferrer">GitHub ↗</a><a href="https://www.npmjs.com/package/model-orchestrator" target="_blank" rel="noopener noreferrer">npm ↗</a></nav></header>
<div class="layout"><aside><p class="side-label">DOCUMENTATION</p><nav class="side-links" aria-label="Documentation">${navItems}</nav><div class="side-bottom">Questions or feedback?<a class="issue-button" href="${repository}/issues/new/choose" target="_blank" rel="noopener noreferrer">File an issue ↗</a></div></aside>
<main class="main document" id="document"><details class="mobile-nav"><summary>Documentation</summary><nav aria-label="Mobile documentation">${navItems}</nav></details><div class="crumb"><a href="/">model-orchestrator</a><span>/</span><span>Documentation</span></div>
<p class="source-note">From <a href="${repository}/blob/${commit}/${source}" target="_blank" rel="noopener noreferrer">${escape(source)}</a> · <a href="${repository}/tree/${commit}" target="_blank" rel="noopener noreferrer">${commit.slice(0, 7)}</a> · Built ${built.slice(0, 10)}</p>
<article class="markdown">${renderMarkdown(markdown, source)}</article><footer class="bottom"><a href="/">← Back to model-orchestrator</a><a href="${repository}/issues/new/choose" target="_blank" rel="noopener noreferrer">File an issue ↗</a></footer></main></div>`;
  const directory = path.join(out, 'docs', slug);
  await mkdir(directory, {recursive: true});
  const plain = sourceDocument(markdown, source, slug, commit);
  publicDocuments.set(slug, {title, markdown: plain});
  await writeFile(path.join(directory, 'index.md'), plain);
  await writeFile(path.join(directory, 'index.html'), documentHtml({title: meta.title, description: meta.description, route, body}));
}
for (const [name, content] of discoveryFiles(publicDocuments)) await writeFile(path.join(out, name), content);
for (const route of publicRoutes) {
  const targets = relativeTargets(await readFile(path.join(out, route, 'index.md'), 'utf8'));
  if (targets.length) throw new Error(`${route} has ${targets.length} relative Markdown targets: ${targets.join(', ')}`);
}

await writeFile(path.join(out, '404.html'), documentHtml({title: 'Page not found | Model Orchestrator', description: 'Return to model-orchestrator and its documentation.', route: '/', discovery: false, body: '<main class="main document"><h1>Page not found</h1><p>The page may have moved.</p><p><a class="primary" href="/">Return to model-orchestrator →</a></p></main>'}));
await writeFile(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(path.join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicRoutes.map(route => `<url><loc>${origin}${route}</loc><lastmod>${built}</lastmod></url>`).join('')}</urlset>\n`);
await writeFile(path.join(out, 'build-info.json'), JSON.stringify({commit, built, published, registryVerified, pages: pages.size + 1}, null, 2) + '\n');
console.log(`Built landing page and ${pages.size} source-derived docs pages, npm v${published.version}, commit ${commit.slice(0, 7)}.`);
