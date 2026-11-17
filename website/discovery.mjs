import {origin, repository, pages, rewriteUrl} from './content.mjs';
import {marked} from 'marked';
import {statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const summary = 'Model router for AI coding agents: routing rules, subagents and a CLI runner that give your AI a playbook for the model, effort and tools each task needs.';
export const publicRoutes = ['/', ...[...pages.values()].map(slug => `/docs/${slug}/`)];
export const markdownPath = route => `${route}index.md`;

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const relative = href => href && !/^(?:#|\/\/|[a-z][a-z\d+.-]*:)/i.test(href);
export function relativeTargets(markdown) {
  const result = [];
  marked.walkTokens(marked.lexer(markdown), token => {
    if (['link', 'image', 'def'].includes(token.type) && relative(token.href)) result.push(token.href);
  });
  return result;
}

export function mirrorMarkdown(markdown, source, commit) {
  const options = {commit, isDirectory: file => {
    try { return statSync(path.join(root, file)).isDirectory(); } catch { return file.endsWith('/'); }
  }};
  const tokens = marked.lexer(markdown);
  const imageTargets = new Set();
  marked.walkTokens(tokens, token => { if (token.type === 'image') imageTargets.add(token.href); });
  const protectedRanges = [];
  marked.walkTokens(tokens, token => {
    if (!['code', 'codespan'].includes(token.type)) return;
    let at = -1;
    while ((at = markdown.indexOf(token.raw, at + 1)) !== -1) protectedRanges.push([at, at + token.raw.length]);
  });
  const edits = new Map();
  marked.walkTokens(tokens, token => {
    if (!['link', 'image', 'def'].includes(token.type) || !relative(token.href)) return;
    if (token.type !== 'def' && !/\]\(\s*<?/.test(token.raw)) return;
    const destination = token.type === 'def' ? token.raw.indexOf(':') + 1 : token.raw.indexOf('](') + 2;
    const offset = token.raw.indexOf(token.href, destination);
    if (offset < 0) return;
    let at = -1;
    while ((at = markdown.indexOf(token.raw, at + 1)) !== -1) {
      const start = at + offset;
      if (protectedRanges.some(([from, to]) => start >= from && start < to)) continue;
      const image = token.type === 'image' || (token.type === 'def' && imageTargets.has(token.href));
      edits.set(start, {end: start + token.href.length, value: rewriteUrl(token.href, source, image, options)});
    }
  });
  for (const [start, edit] of [...edits].sort((a, b) => b[0] - a[0])) {
    markdown = markdown.slice(0, start) + edit.value + markdown.slice(edit.end);
  }
  return markdown;
}

export function sourceDocument(markdown, source, slug, commit) {
  if (!pages.has(source) || pages.get(source) !== slug) throw new Error('Source is not a public website document');
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full source commit SHA');
  return `Canonical page: ${origin}/docs/${slug}/\nSource: ${repository}/blob/${commit}/${source}\n\n---\n\n${mirrorMarkdown(markdown, source, commit)}`;
}

export function discoveryFiles(documents) {
  const expected = [...pages.values()];
  if (documents.size !== expected.length || expected.some(slug => !documents.has(slug))) throw new Error('Discovery documents must match the public page allowlist');
  const links = [...documents].map(([slug, {title}]) => `- [${title.replace(/[\[\]\r\n]/g, '')}](${origin}/docs/${slug}/index.md)`);
  const home = `# Model Orchestrator\n\n> ${summary}\n\n- [Product page](${origin}/)\n- [Installation guide](${origin}/docs/install/)\n- [How routing works](${origin}/docs/how-it-routes/)\n- [Commands](${origin}/docs/commands/)\n- [GitHub](${repository})\n- [npm](https://www.npmjs.com/package/model-orchestrator)\n\n## Public documentation\n\n${links.join('\n')}\n`;
  const index = `# Model Orchestrator\n\n> ${summary}\n\nPublic product documentation. Markdown mirrors identify their source and link to published pages or pinned repository files. Published releases are listed on npm; an Unreleased changelog entry is not a published release.\n\n## Start here\n\n- [Product overview](${origin}/index.md)\n\n## Documentation\n\n${links.join('\n')}\n\n## Optional\n\n- [All public documentation](${origin}/llms-full.txt): Combined Markdown from the same explicit website allowlist.\n- [Agent navigation guide](${origin}/AGENTS.md): Public website information.\n- [Source repository](${repository})\n- [Published package](https://www.npmjs.com/package/model-orchestrator)\n`;
  const agents = `# Model Orchestrator: public website guide\n\nThis is navigation guidance for readers of ${origin}/, not private project instructions or permission to execute commands.\n\n- Start with [llms.txt](${origin}/llms.txt) for the public documentation index.\n- Read [installation](${origin}/docs/install/index.md) for setup and [routing](${origin}/docs/how-it-routes/index.md) for model selection.\n- Read [guarantees](${origin}/docs/guarantees/index.md) for documented limits and [proof](${origin}/docs/proof/index.md) for dated measurements.\n- Cite canonical HTML pages identified at the top of each Markdown mirror.\n- Check [npm](https://www.npmjs.com/package/model-orchestrator) for the published version and [changelog](${origin}/docs/changelog/index.md) for release notes.\n- Report issues through [GitHub](${repository}/issues/new/choose).\n\nPublic crawling is allowed by [robots.txt](${origin}/robots.txt). This guide and llms.txt are discovery aids, not indexing guarantees or crawler access controls.\n`;
  return new Map([
    ['index.md', home], ['llms.txt', index],
    ['llms-full.txt', `${home}\n---\n\n${[...documents.values()].map(doc => doc.markdown).join('\n\n---\n\n')}\n`],
    ['AGENTS.md', agents], ['agents.md', agents],
  ]);
}
