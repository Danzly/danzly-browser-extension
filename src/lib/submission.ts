import type { SubmitPageResult } from './api';
import type { UserProvidedEventData } from './page-event-data';

export const SUBMISSION_INTERVAL_MS = 3000;

interface SubmissionDependencies {
  hasSubmittedUrl: (url: string) => Promise<boolean>;
  markSubmissionAttemptFinished: () => Promise<void>;
  markUrlSubmitted: (url: string) => Promise<void>;
  submitPage: (apiKey: string, url: string, userProvidedData?: UserProvidedEventData) => Promise<SubmitPageResult>;
  waitForSubmissionSlot: () => Promise<void>;
}

export function createSubmissionTracker(dependencies: SubmissionDependencies) {
  const inFlightSubmissions = new Map<string, Promise<SubmitPageResult>>();
  let submissionQueue = Promise.resolve();

  async function submit(apiKey: string, url: string, userProvidedData?: UserProvidedEventData) {
    if (await dependencies.hasSubmittedUrl(url)) return { alreadySubmitted: true };
    const existingSubmission = inFlightSubmissions.get(url);
    if (existingSubmission) {
      await existingSubmission;
      return { alreadySubmitted: true };
    }
    const submission = submissionQueue.then(async () => {
      await dependencies.waitForSubmissionSlot();
      let result: SubmitPageResult;
      try {
        result = await dependencies.submitPage(apiKey, url, userProvidedData);
      } finally {
        await dependencies.markSubmissionAttemptFinished();
      }
      await dependencies.markUrlSubmitted(url);
      return result;
    });
    submissionQueue = submission.then(() => undefined, () => undefined);
    inFlightSubmissions.set(url, submission);
    try {
      const result = await submission;
      return { alreadySubmitted: false, result };
    } finally {
      inFlightSubmissions.delete(url);
    }
  }

  return { submit };
}
