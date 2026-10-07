import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownCell } from '../src/markdown.js';

test('Markdown table cells preserve ordinary text and literal backslashes before pipes', () => {
  for (const [input, expected] of [
    ['plain `code`', 'plain `code`'],
    ['left|right', String.raw`left\|right`],
    [String.raw`left\|right`, String.raw`left\\\|right`],
    [String.raw`left\\|right`, String.raw`left\\\\\|right`],
    ['one\ntwo\r\nthree', 'one two three'],
    [false, 'false'],
    [null, 'null']
  ]) assert.equal(markdownCell(input), expected);
});
