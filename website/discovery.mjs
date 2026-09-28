import {origin, repository, pages} from './content.mjs';

const summary = 'Model router for AI coding agents: routing rules, subagents and a CLI runner that give your AI a playbook for the model, effort and tools each task needs.';
export const publicRoutes = ['/', ...[...pages.values()].map(slug => `/docs/${slug}/`)];
export const markdownPath = route => `${route}index.md`;

export function sourceDocument(markdown, source, slug, commit) {
  if (!pages.has(source) || pages.get(source) !== slug) throw new Error('Source is not a public website document');
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Expected a full source commit SHA');
  // Keep source bytes intact, including code examples and reference-style links.
  // The original source location supplies the base for source-relative links.
  return `Canonical page: ${origin}/docs/${slug}/\nSource: ${repository}/blob/${commit}/${source}\nRelative links in the source below resolve against that repository source location.\n\n---\n\n${markdown}`;
}

export function discoveryFiles(documents) {
  const expected = [...pages.values()];
  if (documents.size !== expected.length || expected.some(slug => !documents.has(slug))) throw new Error('Discovery documents must match the public page allowlist');
  const links = [...documents].map(([slug, {title}]) => `- [${title.replace(/[\[\]\r\n]/g, '')}](${origin}/docs/${slug}/index.md)`);
  const home = `# Model Orchestrator\n\n> ${summary}\n\n- [Product page](${origin}/)\n- [Installation guide](${origin}/docs/install/)\n- [How routing works](${origin}/docs/how-it-routes/)\n- [Commands](${origin}/docs/commands/)\n- [GitHub](${repository})\n- [npm](https://www.npmjs.com/package/model-orchestrator)\n\n## Public documentation\n\n${links.join('\n')}\n`;
  const index = `# Model Orchestrator\n\n> ${summary}\n\nPublic product documentation. Markdown mirrors preserve their source text and identify the repository location for resolving relative links. Published releases are listed on npm; an Unreleased changelog entry is not a published release.\n\n## Start here\n\n- [Product overview](${origin}/index.md)\n\n## Documentation\n\n${links.join('\n')}\n\n## Optional\n\n- [All public documentation](${origin}/llms-full.txt): Combined Markdown from the same explicit website allowlist.\n- [Agent navigation guide](${origin}/AGENTS.md): Public website information.\n- [Source repository](${repository})\n- [Published package](https://www.npmjs.com/package/model-orchestrator)\n`;
  const agents = `# Model Orchestrator: public website guide\n\nThis is navigation guidance for readers of ${origin}/, not private project instructions or permission to execute commands.\n\n- Start with [llms.txt](${origin}/llms.txt) for the public documentation index.\n- Read [installation](${origin}/docs/install/index.md) for setup and [routing](${origin}/docs/how-it-routes/index.md) for model selection.\n- Read [guarantees](${origin}/docs/guarantees/index.md) for documented limits and [proof](${origin}/docs/proof/index.md) for dated measurements.\n- Cite canonical HTML pages identified at the top of each Markdown mirror.\n- Check [npm](https://www.npmjs.com/package/model-orchestrator) for the published version and [changelog](${origin}/docs/changelog/index.md) for release notes.\n- Report issues through [GitHub](${repository}/issues/new/choose).\n\nPublic crawling is allowed by [robots.txt](${origin}/robots.txt). This guide and llms.txt are discovery aids, not indexing guarantees or crawler access controls.\n`;
  return new Map([
    ['index.md', home], ['llms.txt', index],
    ['llms-full.txt', `${home}\n---\n\n${[...documents.values()].map(doc => doc.markdown).join('\n\n---\n\n')}\n`],
    ['AGENTS.md', agents], ['agents.md', agents],
  ]);
}
