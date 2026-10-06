import test from 'node:test';
import './content-checks.mjs';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {Parser, parseDocument, DomUtils} from 'htmlparser2';
import {renderMarkdown, releaseEntries, documentHtml, pages, origin, populateLanding} from './content.mjs';
import {setupTrailer} from './assets/trailer.js';
import {validRelease, refreshRelease} from './assets/releases.js';
import {sourceDocument, discoveryFiles, publicRoutes} from './discovery.mjs';

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
  assert.ok(!html.includes('DESIGN PREVIEW'));
  if (route !== '/404.html') assert.ok(!html.includes('noindex'));
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

test('documentation routes avoid the index segment canonicalized away by Vercel', () => {
  assert.ok(![...pages.values()].includes('index'), 'Vercel redirects /docs/index/ to /docs/');
  const config = JSON.parse(readFileSync(path.join(here, '..', 'vercel.json'), 'utf8'));
  assert.ok(config.redirects.some(rule => rule.source === '/docs/' && rule.destination === '/docs/guides/' && rule.permanent));
});

test('all generated pages have one early Google tag, working local links and safe external links', () => {
  for (const route of routes) verifyHtml(readFileSync(path.join(out, route, 'index.html'), 'utf8'), route, documents);
  const notFound = readFileSync(path.join(out, '404.html'), 'utf8');
  verifyHtml(notFound, '/404.html', documents);
  assert.match(notFound, /<meta name="robots" content="noindex">/);
});
test('every generated page advertises the bundled social thumbnail with its real dimensions', () => {
  const image = readFileSync(path.join(out, 'assets/social-preview.png'));
  assert.deepEqual(image.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  const files = [...routes.map(route => path.join(out, route, 'index.html')), path.join(out, '404.html')];
  for (const file of files) {
    const {tags} = inventory(readFileSync(file, 'utf8'));
    for (const [key, expected] of Object.entries({
      'og:image': `${origin}/assets/social-preview.png`,
      'og:image:type': 'image/png', 'og:image:width': '1200', 'og:image:height': '630',
      'twitter:image': `${origin}/assets/social-preview.png`, 'twitter:card': 'summary_large_image',
    })) {
      const matches = tags.filter(({name, attrs}) => name === 'meta' && (attrs.property === key || attrs.name === key));
      assert.equal(matches.length, 1, `${file}: exactly one ${key}`);
      assert.equal(matches[0].attrs.content, expected, `${file}: ${key}`);
    }
  }
});
test('link and Google tag checks reject deliberately broken HTML', () => {
  const clean = documentHtml({title: 'Fixture', description: 'Fixture', route: '/', body: '<a href="#missing">Broken</a>'});
  assert.throws(() => verifyHtml(clean, '/', documents), /Missing anchor/);
  assert.throws(() => verifyHtml(clean.replace('</head>', '<script src="https://www.googletagmanager.com/gtag/js?id=G-HK1CE993HY"></script></head>'), '/', documents), /Exactly one Google tag/);
});
test('Markdown removes scripts, event handlers and unsafe protocols', () => {
  const output = renderMarkdown('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n<img src=x onerror=alert(1)>\n\n<iframe src="https://evil.example"></iframe>', 'README.md');
  assert.doesNotMatch(output, /<script|<iframe|<img|href="javascript:/i);
  assert.ok(output.includes('&lt;img'));
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

test('the built website renders a release panel for every changelog version', () => {
  const entries = releaseEntries(readFileSync(path.join(here, '..', 'CHANGELOG.md'), 'utf8'));
  const html = readFileSync(path.join(out, 'index.html'), 'utf8');
  const rendered = inventory(html).tags.filter(({name, attrs}) => name === 'article' && attrs['data-release']).map(({attrs}) => attrs['data-release']);
  assert.deepEqual(rendered, entries.map(entry => entry.version));
  const notes = readFileSync(path.join(out, 'docs/changelog/index.html'), 'utf8');
  assert.ok(notes.includes('&lt;dir&gt;'));
  assert.ok(notes.includes('&lt;project&gt;'));
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
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]), routes.map(route => origin + route));
  const info = JSON.parse(readFileSync(path.join(out, 'build-info.json'), 'utf8'));
  assert.match(info.commit, /^[a-f0-9]{40}$/); assert.ok(validRelease(info.published));
});

test('crawler policy allows all public pages and advertises the canonical sitemap', () => {
  assert.equal(readFileSync(path.join(out, 'robots.txt'), 'utf8'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
  assert.deepEqual(publicRoutes, routes);
  const config = JSON.parse(readFileSync(path.join(here, '..', 'vercel.json'), 'utf8'));
  assert.ok(config.headers.some(rule => rule.source === '/(.*\\.md)' && rule.headers.some(header => header.key === 'Content-Type' && header.value === 'text/markdown; charset=utf-8')));
});

test('every public HTML page has a real Markdown alternate and discovery link', () => {
  for (const route of routes) {
    const {tags} = inventory(readFileSync(path.join(out, route, 'index.html'), 'utf8'));
    const alternates = tags.filter(({name, attrs}) => name === 'link' && attrs.rel === 'alternate' && attrs.type === 'text/markdown');
    assert.equal(alternates.length, 1);
    assert.equal(alternates[0].attrs.href, `${origin}${route}index.md`);
    assert.ok(existsSync(path.join(out, route, 'index.md')));
    assert.ok(tags.some(({name, attrs}) => name === 'link' && attrs.rel === 'describedby' && attrs.href === `${origin}/llms.txt`));
  }
});

test('discovery publishes exactly the public allowlist and preserves source Markdown', () => {
  const full = readFileSync(path.join(out, 'llms-full.txt'), 'utf8');
  const index = readFileSync(path.join(out, 'llms.txt'), 'utf8');
  for (const [source, slug] of pages) {
    const original = readFileSync(path.join(here, '..', source), 'utf8');
    const mirror = readFileSync(path.join(out, 'docs', slug, 'index.md'), 'utf8');
    assert.ok(mirror.endsWith(original));
    assert.ok(mirror.includes(`Canonical page: ${origin}/docs/${slug}/`));
    assert.ok(full.includes(mirror));
    assert.ok(index.includes(`${origin}/docs/${slug}/index.md`));
  }
  assert.deepEqual(readdirSync(path.join(out, 'docs')).sort(), [...pages.values()].sort());
  assert.equal(readFileSync(path.join(out, 'AGENTS.md'), 'utf8'), readFileSync(path.join(out, 'agents.md'), 'utf8'));
  assert.doesNotMatch(readFileSync(path.join(out, 'AGENTS.md'), 'utf8'), /## Change this repository|\/Users\/|calendar\.app\.google/);
  for (const file of ['README.md', 'CLAUDE.md', '.env', 'website/README.md', 'docs/private.md']) assert.ok(!existsSync(path.join(out, file)));
  assert.doesNotMatch(index, /404\.html|build-info\.json|website\/README/);
});

test('discovery rejects unlisted sources, incomplete sets, extra files and noindex content pages', () => {
  const sha = 'a'.repeat(40);
  assert.throws(() => sourceDocument('PRIVATE_FIXTURE', 'website/README.md', 'internal', sha), /not a public/);
  assert.throws(() => sourceDocument('PRIVATE_FIXTURE', 'AGENTS.md', 'overview', sha), /not a public/);
  assert.throws(() => discoveryFiles(new Map()), /allowlist/);
  const docs = new Map([...pages.values()].map(slug => [slug, {title: slug, markdown: ''}]));
  docs.set('private', {title: 'Private', markdown: 'PRIVATE_FIXTURE'});
  assert.throws(() => discoveryFiles(docs), /allowlist/);
  const noindex = documentHtml({title: 'Fixture', description: 'Fixture', route: '/', body: '', discovery: false});
  assert.throws(() => verifyHtml(noindex, '/', documents));
});

// Navigation regression: scroll position, not the last clicked link, owns the active tab.
import {currentSection, setupNavigation} from './assets/navigation.js';
test('navigation chooses each section in both directions and the last section at page end', () => {
  const ids = ['overview','routing','trailer','quickstart','reference','proof','releases'];
  for (const i of [0,1,2,3,4,5,6,5,4,3,2,1,0]) {
    const sections = ids.map((id,j) => ({id,top:116+(j-i)*300}));
    assert.equal(currentSection(sections,116,false),ids[i]);
  }
  assert.equal(currentSection(ids.map((id,i)=>({id,top:i*300})),116,true),'releases');
});
function navigationFixture() {
  const ids=['overview','routing','trailer','quickstart','reference','proof','releases'];
  const events={}, frames=[], observed=[];
  const nav={clientHeight:80,scrollHeight:280,scrollTop:0,getBoundingClientRect:()=>({top:150,bottom:230})};
  const link=(id,i,parent=nav)=>({hash:`#${id}`,parentElement:parent,attributes:{},classList:{toggle(_name,value){this.active=value;}},setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];},getBoundingClientRect:()=>({top:150+i*40-nav.scrollTop,bottom:190+i*40-nav.scrollTop})});
  const desktop=ids.map((id,i)=>link(id,i)), mobile=ids.map((id,i)=>link(id,i));
  const root={scrollHeight:3000}, main={}, header={getBoundingClientRect:()=>({bottom:74})};
  const env={scrollY:0,innerHeight:600,getComputedStyle:()=>({scrollPaddingTop:'115px'}),requestAnimationFrame(fn){frames.push(fn);return frames.length;},addEventListener(name,fn){events[name]=fn;},ResizeObserver:class{constructor(fn){this.fn=fn;}observe(node){observed.push(node);}}};
  const sections=ids.map((id,i)=>({id,getBoundingClientRect:()=>({top:i*350+120-env.scrollY})}));
  const doc={documentElement:root,querySelectorAll:selector=>selector.startsWith('.side-links')?desktop:mobile,querySelector:selector=>selector==='main'?main:header,getElementById:id=>sections.find(s=>s.id===id)};
  setupNavigation(doc,env);
  const flush=()=>{while(frames.length)frames.shift()();};
  return {ids,desktop,mobile,root,nav,env,events,frames,observed,flush};
}
test('manual scroll updates both menus and aria-current without clicks or document scrolling', () => {
  const f=navigationFixture();
  assert.equal(f.desktop[0].attributes['aria-current'],'location');
  for(const index of [2,4,1,0]) {
    f.env.scrollY=index*350+10; f.events.scroll(); f.flush();
    for(const menu of [f.desktop,f.mobile]) {
      assert.deepEqual(menu.filter(x=>x.classList.active).map(x=>x.hash),[`#${f.ids[index]}`]);
      assert.deepEqual(menu.filter(x=>x.attributes['aria-current']).map(x=>x.hash),[`#${f.ids[index]}`]);
    }
    assert.equal(f.env.scrollY,index*350+10);
  }
});
test('navigation batches events, follows deep-link/restore/resize positions and reveals clipped tabs', () => {
  const f=navigationFixture(); f.env.scrollY=1410;
  f.events.hashchange(); f.events.pageshow(); f.events.resize();
  assert.equal(f.frames.length,1); f.flush();
  assert.equal(f.desktop[4].attributes['aria-current'],'location');
  assert.ok(f.nav.scrollTop>0); assert.equal(f.env.scrollY,1410);
  f.env.scrollY=2400; f.events.scroll(); f.flush();
  assert.equal(f.desktop[6].attributes['aria-current'],'location');
  f.env.scrollY=0; f.events.scroll(); f.flush();
  assert.equal(f.nav.scrollTop,0); assert.equal(f.desktop[0].attributes['aria-current'],'location');
  assert.equal(f.observed.length,2);
});
test('landing breadcrumb is Home with the same portfolio destination', () => {
  const html=readFileSync(path.join(out,'index.html'),'utf8');
  assert.match(html,/<div class="crumb"><a href="https:\/\/aunysillyme.dev\/"[^>]*>Home<\/a>/);
  assert.ok(existsSync(path.join(out,'assets/navigation.js')));
  assert.match(readFileSync(path.join(out,'assets/site.js'),'utf8'),/setupNavigation\(\)/);
});
