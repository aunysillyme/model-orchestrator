import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import GithubSlugger from 'github-slugger';
import path from 'node:path';
import {validVersion} from './assets/releases.js';

export const origin = 'https://model-orchestrator.aunysillyme.dev';
export const repository = 'https://github.com/aunysillyme/model-orchestrator';
export const pages = new Map([
  ['README.md', 'overview'], ['docs/README.md', 'guides'], ['bin/README.md', 'commands'],
  ['proof/README.md', 'proof'], ['CHANGELOG.md', 'changelog'],
  ...['install', 'how-it-routes', 'guarantees', 'companions', 'catalog', 'part-1-beginner',
    'part-2-intermediate', 'part-3-advanced', 'security-review-history'].map(name => [`docs/${name}.md`, name]),
]);
export const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[char]));
export const semver = validVersion;

export function populateLanding(template, version, releases) {
  return template.replace('{{VERSION}}', () => version).replace('{{RELEASES}}', () => releases);
}

export function releaseEntries(markdown) {
  const headings = [...markdown.matchAll(/^## \[([^\]]+)\](?:[ \t]+-[ \t]+(\d{4}-\d{2}-\d{2}))?[^\r\n]*$/gm)];
  return headings.flatMap((match, index) => semver(match[1]) ? [{
    version: match[1], date: match[2] || '',
    markdown: markdown.slice(match.index + match[0].length, headings[index + 1]?.index ?? markdown.length).replace(/^\[[^\]]+\]:.*$/gm, '').trim(),
  }] : []);
}

function rewriteUrl(href, source, image = false) {
  if (!href || href.startsWith('#') || /^[a-z][a-z\d+.-]*:/i.test(href) || href.startsWith('//')) return href;
  const [file, fragment] = href.split('#');
  const normalized = path.posix.normalize(path.posix.join(path.posix.dirname(source), file));
  const suffix = fragment ? `#${fragment}` : '';
  if (!image && pages.has(normalized)) return `/docs/${pages.get(normalized)}/${suffix}`;
  return `${image ? 'https://raw.githubusercontent.com/aunysillyme/model-orchestrator/main' : `${repository}/blob/main`}/${normalized}${suffix}`;
}

export function renderMarkdown(markdown, source) {
  const slugger = new GithubSlugger();
  const renderer = new marked.Renderer();
  renderer.html = ({text}) => escape(text);
  renderer.heading = function ({ tokens, depth }) {
    const text = this.parser.parseInline(tokens);
    const id = slugger.slug(sanitizeHtml(text, {allowedTags: [], allowedAttributes: {}}));
    return `<h${depth} id="${escape(id)}">${text}</h${depth}>\n`;
  };
  return sanitizeHtml(marked.parse(markdown, {renderer, gfm: true}), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'details', 'summary', 'del'],
    allowedAttributes: {
      a: ['href', 'target', 'rel', 'id'], img: ['src', 'alt', 'width', 'height', 'loading'],
      '*': ['id'], code: ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (_tag, attributes) => {
        const href = rewriteUrl(attributes.href, source);
        const external = /^https?:\/\//i.test(href || '');
        return {tagName: 'a', attribs: {...attributes, href, ...(external ? {target: '_blank', rel: 'noopener noreferrer'} : {target: '', rel: ''})}};
      },
      img: (_tag, attributes) => ({tagName: 'img', attribs: {...attributes, src: rewriteUrl(attributes.src, source, true), loading: 'lazy'}}),
    },
  });
}

export function documentHtml({title, description, route, body, discovery = true}) {
  const socialImage = `${origin}/assets/social-preview.png`;
  const socialAlt = 'Model-orchestrator: the right model for the right job. Dark green repository card with Auny’s avatar and a three-tone green border.';
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "Model Orchestrator",
    "description": "Model router for AI coding agents: installs routing rules, 8 subagents, hooks and a CLI runner so your AI picks model and effort per task and saves tokens",
    "applicationCategory": "DeveloperApplication",
    "operatingSystem": "macOS, Linux, Windows",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD"
    },
    "url": origin,
    "sameAs": [
      repository,
      "https://www.npmjs.com/package/model-orchestrator"
    ],
    "author": {
      "@type": "Organization",
      "name": "AunySillyMe",
      "url": "https://aunysillyme.com"
    }
  });
  return `<!doctype html><html lang="en"><head><!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-HK1CE993HY"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-HK1CE993HY');</script>
<script type="application/ld+json">\n${jsonLd}\n</script>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(title)}</title><meta name="description" content="${escape(description)}">
${discovery ? `<link rel="describedby" href="${origin}/llms.txt"><link rel="alternate" type="text/markdown" href="${origin}${route}index.md">` : '<meta name="robots" content="noindex">'}
<link rel="canonical" href="${origin}${route}"><meta property="og:type" content="website">
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}">
<meta property="og:url" content="${origin}${route}"><meta property="og:image" content="${socialImage}">
<meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escape(socialAlt)}">
<meta name="twitter:title" content="${escape(title)}"><meta name="twitter:description" content="${escape(description)}">
<meta name="twitter:image" content="${socialImage}"><meta name="twitter:image:alt" content="${escape(socialAlt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#050806">
<link rel="icon" href="/assets/avatar.png"><link rel="apple-touch-icon" href="/assets/avatar.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,500&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/site.css"><script type="module" src="/assets/site.js"></script></head><body>${body}</body></html>`;
}
