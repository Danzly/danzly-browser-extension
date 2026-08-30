import assert from 'node:assert/strict';
import test from 'node:test';
import { findFacebookEventUrls, isFacebookEventUrl, normalizeFacebookEventUrl, normalizeSubmissionUrl } from './facebook.ts';

test('recognizes supported Facebook event hosts', () => {
  assert.equal(isFacebookEventUrl('https://facebook.com/events/123'), true);
  assert.equal(isFacebookEventUrl('https://m.facebook.com/events/123'), true);
  assert.equal(isFacebookEventUrl('https://web.facebook.com/events/123'), true);
  assert.equal(isFacebookEventUrl('https://fb.me/e/example'), true);
  assert.equal(isFacebookEventUrl('https://example.com/events/123'), false);
  assert.equal(isFacebookEventUrl('javascript:alert(1)'), false);
});

test('canonicalizes Facebook hosts, query strings, fragments, and trailing punctuation', () => {
  assert.equal(
    normalizeFacebookEventUrl('https://m.facebook.com/events/123/?tracking=value#details'),
    'https://www.facebook.com/events/123'
  );
  assert.equal(normalizeFacebookEventUrl('https://facebook.com/events/123).'), 'https://www.facebook.com/events/123');
});

test('finds and deduplicates event links from all supported page sources', () => {
  assert.deepEqual(
    findFacebookEventUrls({
      pageUrl: 'https://www.facebook.com/events/123?source=page',
      links: ['https://m.facebook.com/events/123/', 'https://fb.me/e/short'],
      text: 'Shared: https://facebook.com/events/456).',
    }),
    [
      'https://www.facebook.com/events/123',
      'https://fb.me/e/short',
      'https://www.facebook.com/events/456',
    ]
  );
});

test('removes fragments but preserves meaningful query strings on non-Facebook submissions', () => {
  assert.equal(normalizeSubmissionUrl('https://example.com/event?id=123#private'), 'https://example.com/event?id=123');
});
