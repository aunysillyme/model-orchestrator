// Run the workflow's exact script so checkbox and environment handling stay in sync with CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/cla.yml', import.meta.url), 'utf8');
const agreement = 'I agree to the Contributor License Agreement in CLA.md';
const checked = `- [x] ${agreement}`;

function workflowScript() {
  const match = workflow.match(/^        run: \|\n((?:          .*\n)+)$/m);
  assert.ok(match, 'the workflow must contain one literal run script');
  const script = match[1].replace(/^          /gm, '');
  assert.ok(script.startsWith("node <<'NODE'\n"));
  assert.ok(script.endsWith('NODE\n'));
  return script.slice("node <<'NODE'\n".length, -'NODE\n'.length);
}

function check(body) {
  return spawnSync(process.execPath, ['-e', workflowScript()], {
    env: { ...process.env, PR_BODY: body }, encoding: 'utf8'
  });
}

test('CLA template and workflow use the exact agreement line', () => {
  assert.ok(template.split('\n').includes(`- [ ] ${agreement}`));
  assert.ok(workflow.includes(`const checkedLine = '${checked}';`));
  assert.match(workflow, /^name: cla$/m);
  assert.match(workflow, /^on:\n  pull_request:\n    types: \[opened, edited, reopened, synchronize\]$/m);
  assert.doesNotMatch(workflow, /pull_request_target/);
});

test('CLA workflow reads the PR body only through env with no token scopes or actions', () => {
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(workflow, /^    runs-on: ubuntu-latest$/m);
  assert.equal((workflow.match(/^  cla:$/gm) || []).length, 1);
  assert.equal((workflow.match(/^        run: /gm) || []).length, 1);
  assert.match(workflow, /^        env:\n          PR_BODY: \$\{\{ github.event.pull_request.body \}\}$/m);
  assert.doesNotMatch(workflow, /^\s*-?\s*uses:/m);
  assert.doesNotMatch(workflowScript(), /\$\{\{/);
  assert.equal((workflow.match(/github\.event\.pull_request\.body/g) || []).length, 1);
  assert.ok(workflow.includes("if: ${{ !contains(fromJSON('[\"OWNER\", \"MEMBER\", \"COLLABORATOR\"]'), github.event.pull_request.author_association) && github.event.pull_request.user.type != 'Bot' }}"));
});

for (const [label, body] of [
  ['unticked box', `- [ ] ${agreement}`],
  ['empty body', ''],
  ['text without a checkbox', agreement],
  ['wrong agreement text', '- [x] I agree to the Contributor License Agreement'],
  ['tick hidden in an HTML comment', `<!--\n- [x] ${agreement}\n-->`],
  ['tick hidden in an unclosed HTML comment', `<!--\n- [x] ${agreement}`]
]) {
  test(`CLA rejects ${label}`, () => {
    const result = check(body);
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /::error::.*tick the Contributor License Agreement box in the PR description.*\[CLA\.md\]\(CLA\.md\)/);
  });
}

for (const [label, body] of [
  ['lowercase x', checked],
  ['uppercase X', `- [X] ${agreement}`],
  ['star bullet', `* [x] ${agreement}`],
  ['a checked line within a CRLF description', `Description\r\n${checked}\r\nMore text`]
]) {
  test(`CLA accepts ${label}`, () => {
    const result = check(body);
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  });
}

test('CLA treats shell substitutions in the body as plain text', () => {
  const path = process.platform === 'win32' ? `${process.env.TEMP}/cla-pwned-${process.pid}` : `/tmp/cla-pwned-${process.pid}`;
  assert.equal(existsSync(path), false);
  const result = check(`$(touch /tmp/pwned)\n$(touch "${path}")\n${checked}`);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(path), false);
});

test('CLA passes for an indented checked line with trailing spaces after a closed comment', () => {
  const result = check(`<!-- note -->\n  - [x] ${agreement}  `);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
});
