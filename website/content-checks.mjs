import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderMarkdown, releaseEntries} from './content.mjs';

test('each changelog version with any heading suffix has separate release notes', () => {
  const markdown = '## [Unreleased]\nDraft\n## [2.0.0] - 2026-09-28\nNew\n## [1.0.0] - 2026-09-20 (follow-up)\nOld';
  assert.deepEqual(releaseEntries(markdown), [
    {version: '2.0.0', date: '2026-09-28', markdown: 'New'},
    {version: '1.0.0', date: '2026-09-20', markdown: 'Old'},
  ]);
  const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const versions = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm)].map(match => match[1]);
  assert.deepEqual(releaseEntries(changelog).map(entry => entry.version), versions);
  assert.ok(versions.includes('0.1.14'));
});

test('Markdown keeps literal angle bracket placeholders and comment examples visible', () => {
  const html = renderMarkdown('Use --dir <dir> --project <project>.\n\n<!-- route: <lane> | <why> -->\n\nRun npm install -g <pkg>.\n\n<details>\n<summary>Example</summary>\nText\n</details>', 'CHANGELOG.md');
  for (const text of ['&lt;dir&gt;', '&lt;project&gt;', '&lt;!-- route:', '&lt;lane&gt;', '&lt;why&gt;', '&lt;pkg&gt;', '&lt;details&gt;']) assert.ok(html.includes(text), text + ': ' + html);
  assert.doesNotMatch(html, /<details>/);
  assert.match(renderMarkdown('[Install](docs/install.md)\n\n```sh\necho "<dir>"\n```', 'README.md'), /href="\/docs\/install\/"/);
});
