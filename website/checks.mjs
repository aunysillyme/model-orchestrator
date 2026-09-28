import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Parser, parseDocument, DomUtils} from 'htmlparser2';
import {renderMarkdown, releaseEntries, documentHtml, pages, origin, populateLanding} from './content.mjs';
import {setupTrailer} from './assets/trailer.js';
import {validRelease, refreshRelease} from './assets/releases.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist');
function inventory(html) {
  const result = {ids: new Set(), links: [], assets: [], google: 0, config: 0, tags: []};
  const parser = new Parser({onopentag(name, attrs) {
    result.tags.push({name, attrs});
    if (attrs.id) { assert.ok(!result.ids.has(attrs.id), `Duplicate id ${attrs.id}`); result.ids.add(attrs.id); }
    if (name === 'a' && attrs.href) result.links.push(attrs);
    if (['script', 'img', 'source'].includes(name) && attrs.src) result.assets.push(attrs.src);
    if (name === 'link' && attrs.href?.startsWith('/assets/')) result.assets.push(attrs.href);
    if (attrs.src?.includes('googletagmanager.com/gtag/js')) result.google++;
  }, ontext(text) {result.config += (text.match(/gtag\('config','G-HK1CE993HY'\)/g) || []).length;}});
  parser.write(html); parser.end(); return result;
}
function verifyHtml(html, route, documents) {
  const info = inventory(html);
  assert.equal(info.google, 1, 'Exactly one Google tag');
  assert.equal(info.config, 1, 'Exactly one Google config');
  assert.match(html, /<head><!-- Google tag/);
  assert.ok(!html.includes('DESIGN PREVIEW') && !html.includes('noindex'));
  for (const link of info.links) {
    if (/^https?:/i.test(link.href)) {
      assert.equal(link.target, '_blank', `External target: ${link.href}`);
      assert.ok(link.rel?.includes('noopener') && link.rel?.includes('noreferrer'));
    } else if (link.href.startsWith('/') || link.href.startsWith('#')) {
      const url = new URL(link.href, origin + route);
      const target = documents.get(url.pathname);
      assert.ok(target, `Missing page ${url.pathname} linked from ${route}`);
      if (url.hash) assert.ok(target.ids.has(decodeURIComponent(url.hash.slice(1))), `Missing anchor ${link.href} linked from ${route}`);
    }
  }
  for (const asset of info.assets.filter(value => value.startsWith('/'))) assert.ok(existsSync(path.join(out, asset)), `Missing asset ${asset}`);
  return info;
}
const routes = ['/', ...[...pages.values()].map(slug => `/docs/${slug}/`)];
const documents = new Map(routes.map(route => [route, inventory(readFileSync(path.join(out, route, 'index.html'), 'utf8'))]));

test('all generated pages have one early Google tag, working local links and safe external links', () => {
  for (const route of routes) verifyHtml(readFileSync(path.join(out, route, 'index.html'), 'utf8'), route, documents);
  const notFound = readFileSync(path.join(out, '404.html'), 'utf8');
  verifyHtml(notFound, '/', documents);
});
test('link and Google tag checks reject deliberately broken HTML', () => {
  const clean = documentHtml({title: 'Fixture', description: 'Fixture', route: '/', body: '<a href="#missing">Broken</a>'});
  assert.throws(() => verifyHtml(clean, '/', documents), /Missing anchor/);
  assert.throws(() => verifyHtml(clean.replace('</head>', '<script src="https://www.googletagmanager.com/gtag/js?id=G-HK1CE993HY"></script></head>'), '/', documents), /Exactly one Google tag/);
});
test('Markdown removes scripts, event handlers and unsafe protocols', () => {
  const output = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://evil.example"></iframe>', 'README.md');
  assert.doesNotMatch(output, /<script|<iframe|onerror|javascript:/i);
  assert.ok(output.includes('<img'));
});
test('Markdown source-relative paths resolve locally and unknown files resolve to GitHub', () => {
  const output = renderMarkdown('[Install](install.md#setup) [Runner](../bin/README.md) [Source](../src/index.js)', 'docs/README.md');
  assert.ok(output.includes('href="/docs/install/#setup"'));
  assert.ok(output.includes('href="/docs/commands/"'));
  assert.ok(output.includes('https://github.com/aunysillyme/model-orchestrator/blob/main/src/index.js'));
  assert.ok(output.includes('rel="noopener noreferrer"'));
});
test('release parsing excludes Unreleased and keeps each version paired with its own notes', () => {
  assert.deepEqual(releaseEntries('## [Unreleased]\nNot published\n## [2.0.0] - 2026-09-28\nNew notes\n## [1.0.0] - 2026-09-20\nOld notes\n[1.0.0]: https://example.com'), [
    {version: '2.0.0', date: '2026-09-28', markdown: 'New notes'}, {version: '1.0.0', date: '2026-09-20', markdown: 'Old notes'},
  ]);
  assert.ok(validRelease({name: 'model-orchestrator', version: '1.0.1'}));
  for (const value of ['<script>', '01.0.0', '1.0', '1.0.0-01', null]) assert.ok(!validRelease({name: 'model-orchestrator', version: value}));
  assert.ok(!validRelease({name: 'other-package', version: '1.0.0'}));
});
function releaseFixture() {
  const status = {textContent: ''}, badge = {textContent: 'v1.0.0'};
  const releases = [{dataset: {release: '1.0.0'}, hidden: false}, {dataset: {release: '1.0.1'}, hidden: true}];
  return {status, badge, releases, document: {querySelector: () => status, querySelectorAll: selector => selector === '[data-version]' ? [badge] : releases}};
}
test('npm refresh selects only matching pre-rendered release and never inserts remote HTML', async () => {
  const f = releaseFixture();
  await refreshRelease(f.document, async () => ({ok: true, json: async () => ({name:'model-orchestrator', version:'1.0.1', description:'<script>bad</script>'})}));
  assert.equal(f.badge.textContent, 'v1.0.1'); assert.equal(f.releases[0].hidden, true); assert.equal(f.releases[1].hidden, false);
  await refreshRelease(f.document, async () => ({ok: true, json: async () => ({name:'model-orchestrator', version:'2.0.0'})}));
  assert.ok(f.releases.every(entry => entry.hidden)); assert.match(f.status.textContent, /while this page updates/);
});
test('npm refresh failures preserve the last built release with a visible fallback explanation', async () => {
  const f = releaseFixture();
  await refreshRelease(f.document, async () => {throw new Error('offline');});
  assert.equal(f.badge.textContent, 'v1.0.0'); assert.equal(f.releases[0].hidden, false); assert.match(f.status.textContent, /could not be reached/);
});
test('release text preserves JavaScript replacement symbols literally', () => {
  const notes = '<p>$& $` $\' $$</p>';
  assert.equal(populateLanding('<main>{{VERSION}}{{RELEASES}}</main>', 'v1.0.1', notes), `<main>v1.0.1${notes}</main>`);
});
test('the live version update target has no decorative child nodes to erase', () => {
  const tree = parseDocument(readFileSync(path.join(here, 'landing.html'), 'utf8'));
  const targets = DomUtils.findAll(node => node.attribs && 'data-version' in node.attribs, tree.children);
  assert.ok(targets.length);
  for (const target of targets) assert.ok(target.children.every(child => child.type === 'text'), 'Version updates must preserve decorative siblings');
});
test('uppercase HTTPS links also open safely in a new tab', () => {
  const output = renderMarkdown('[Source](HTTPS://example.com/source)', 'README.md');
  const link = inventory(output).links[0];
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
});
function trailerFixture({reduced = false, hidden = false, rejected = false} = {}) {
  const handlers = {}, preference = {matches: reduced, addEventListener: (_event, fn) => {handlers.preference = fn;}};
  const video = {plays: 0, pauses: 0, muted: false, addEventListener: (_event, fn) => {handlers.play = fn;}, play() {this.plays++; return rejected ? Promise.reject(new Error('blocked')) : Promise.resolve();}, pause() {this.pauses++;}};
  const doc = {hidden, addEventListener: (_event, fn) => {handlers.visibility = fn;}};
  const env = {matchMedia: () => preference, IntersectionObserver: class {constructor(fn) {handlers.intersection = fn;} observe() {}}};
  setupTrailer(video, env, doc);
  const visible = ratio => handlers.intersection([{isIntersecting: ratio > 0, intersectionRatio: ratio}]);
  return {video, doc, preference, handlers, visible};
}
test('trailer waits for half-visible foreground then plays once, muted, without restarting', () => {
  const f = trailerFixture({hidden: true});
  f.visible(0.49); assert.equal(f.video.plays, 0);
  f.visible(0.5); assert.equal(f.video.plays, 0);
  f.doc.hidden = false; f.handlers.visibility(); assert.equal(f.video.plays, 1); assert.equal(f.video.muted, true);
  f.visible(0); f.visible(1); f.handlers.visibility(); assert.equal(f.video.plays, 1);
});
test('reduced motion blocks autoplay and switching it on pauses automatic playback', () => {
  const f = trailerFixture({reduced: true}); f.visible(1); assert.equal(f.video.plays, 0);
  f.preference.matches = false; f.handlers.preference(); assert.equal(f.video.plays, 1);
  f.preference.matches = true; f.handlers.preference(); assert.equal(f.video.pauses, 1);
});
test('manual playback and browser rejection never trigger another automatic attempt', async () => {
  const manual = trailerFixture(); manual.handlers.play(); manual.visible(1); assert.equal(manual.video.plays, 0);
  const rejected = trailerFixture({rejected: true}); rejected.visible(1); await Promise.resolve(); rejected.visible(1); assert.equal(rejected.video.plays, 1);
});
test('landing navigation is in section order and approved trailer is correct', () => {
  const html = readFileSync(path.join(out, 'index.html'), 'utf8');
  const positions = ['overview', 'routing', 'trailer', 'quickstart', 'reference', 'proof', 'releases'].map(id => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position, index) => position >= 0 && (!index || position > positions[index - 1])));
  const video = inventory(html).tags.find(tag => tag.name === 'video').attrs;
  assert.ok('controls' in video && 'muted' in video && 'playsinline' in video);
  assert.ok(!('loop' in video) && !('autoplay' in video));
  assert.match(video.poster, /v1790569976/); assert.ok(html.includes('What this does'));
});
test('sitemap includes every generated content page and build metadata identifies source', () => {
  const sitemap = readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  for (const route of routes) assert.ok(sitemap.includes(`<loc>${origin}${route}</loc>`));
  const info = JSON.parse(readFileSync(path.join(out, 'build-info.json'), 'utf8'));
  assert.match(info.commit, /^[a-f0-9]{40}$/); assert.ok(validRelease(info.published));
});
