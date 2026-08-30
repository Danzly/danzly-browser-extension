import assert from 'node:assert/strict';
import test from 'node:test';
import { createSubmissionTracker } from './submission.ts';

test('coalesces concurrent submissions and records the URL after success', async () => {
  const submittedUrls = new Set<string>();
  let requestCount = 0;
  const tracker = createSubmissionTracker({
    hasSubmittedUrl: async (url) => submittedUrls.has(url),
    markSubmissionAttemptFinished: async () => undefined,
    markUrlSubmitted: async (url) => {
      submittedUrls.add(url);
    },
    submitPage: async () => {
      requestCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { eventSubmissionId: 'submission-id' };
    },
    waitForSubmissionSlot: async () => undefined,
  });

  const [first, second] = await Promise.all([
    tracker.submit('key', 'https://www.facebook.com/events/123'),
    tracker.submit('key', 'https://www.facebook.com/events/123'),
  ]);

  assert.equal(requestCount, 1);
  assert.equal(first.alreadySubmitted, false);
  assert.equal(second.alreadySubmitted, true);
  assert.equal(submittedUrls.has('https://www.facebook.com/events/123'), true);
});

test('does not record a failed submission and permits a later retry', async () => {
  const submittedUrls = new Set<string>();
  let requestCount = 0;
  const tracker = createSubmissionTracker({
    hasSubmittedUrl: async (url) => submittedUrls.has(url),
    markSubmissionAttemptFinished: async () => undefined,
    markUrlSubmitted: async (url) => {
      submittedUrls.add(url);
    },
    submitPage: async () => {
      requestCount += 1;
      if (requestCount === 1) throw new Error('Temporary failure');
      return { eventSubmissionId: 'submission-id' };
    },
    waitForSubmissionSlot: async () => undefined,
  });

  await assert.rejects(tracker.submit('key', 'https://www.facebook.com/events/123'), /Temporary failure/);
  assert.equal(submittedUrls.size, 0);
  await tracker.submit('key', 'https://www.facebook.com/events/123');
  assert.equal(requestCount, 2);
  assert.equal(submittedUrls.size, 1);
});

test('serializes different event submissions through the rate-limit slot', async () => {
  const starts: string[] = [];
  let releaseFirst: (() => void) | undefined;
  const firstRequest = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const tracker = createSubmissionTracker({
    hasSubmittedUrl: async () => false,
    markSubmissionAttemptFinished: async () => undefined,
    markUrlSubmitted: async () => undefined,
    submitPage: async (_apiKey, url) => {
      starts.push(url);
      if (starts.length === 1) await firstRequest;
      return { eventSubmissionId: url };
    },
    waitForSubmissionSlot: async () => undefined,
  });

  const first = tracker.submit('key', 'first');
  const second = tracker.submit('key', 'second');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(starts, ['first']);
  releaseFirst?.();
  await Promise.all([first, second]);
  assert.deepEqual(starts, ['first', 'second']);
});
