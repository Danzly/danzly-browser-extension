import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiRequestError, submitPage } from './api.ts';

test('retries server failures and returns a valid submission response', async (testContext) => {
  const originalFetch = globalThis.fetch;
  testContext.after(() => {
    globalThis.fetch = originalFetch;
  });
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) return Response.json({ error: { message: 'Temporary failure' } }, { status: 503 });
    return Response.json({ result: { data: { json: { alreadySubmitted: false, eventSubmissionId: 'submission-id' } } } });
  };

  assert.deepEqual(await submitPage('key', 'https://example.com/event', true), {
    alreadySubmitted: false,
    eventSubmissionId: 'submission-id',
  });
  assert.equal(requestCount, 2);
});

test('does not retry rate-limit responses', async (testContext) => {
  const originalFetch = globalThis.fetch;
  testContext.after(() => {
    globalThis.fetch = originalFetch;
  });
  let requestCount = 0;
  globalThis.fetch = async () => {
    requestCount += 1;
    return Response.json({ error: { message: 'Rate limited' } }, { status: 429 });
  };

  await assert.rejects(
    submitPage('key', 'https://example.com/event', true),
    (error) => error instanceof ApiRequestError && error.status === 429
  );
  assert.equal(requestCount, 1);
});

test('includes user-provided event data in a manual submission', async (testContext) => {
  const originalFetch = globalThis.fetch;
  testContext.after(() => {
    globalThis.fetch = originalFetch;
  });
  let requestBody: unknown;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ result: { data: { json: { alreadySubmitted: false, eventSubmissionId: 'submission-id' } } } });
  };
  const userProvidedData = {
    jsonLd: [{ '@type': 'Event', name: 'Restricted event' }],
    textContent: 'Restricted event details',
    images: ['https://example.com/event.jpg'],
    metadata: { title: 'Restricted event' },
  };

  await submitPage('key', 'https://www.facebook.com/events/123', false, userProvidedData);

  assert.deepEqual(requestBody, {
    json: { eventLink: 'https://www.facebook.com/events/123', isAutomated: false, userProvidedData },
  });
});

test('returns an already-submitted response without requiring a submission id', async (testContext) => {
  const originalFetch = globalThis.fetch;
  testContext.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async () => Response.json({ result: { data: { json: { alreadySubmitted: true } } } });

  assert.deepEqual(await submitPage('key', 'https://www.facebook.com/events/123', true), {
    alreadySubmitted: true,
  });
});
