import test from 'node:test';
import assert from 'node:assert/strict';
import { isGoogleTagScript } from '../website/tag-url.mjs';

test('Google tag detection rejects a host or path that only contains the expected URL', () => {
  assert.equal(isGoogleTagScript('https://www.googletagmanager.com/gtag/js?id=example'), true);
  for (const src of ['https://www.googletagmanager.com.evil.test/gtag/js',
    'https://evil.test/www.googletagmanager.com/gtag/js', '/gtag/js', 'invalid']) {
    assert.equal(isGoogleTagScript(src), false);
  }
});
