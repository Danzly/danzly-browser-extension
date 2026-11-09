import browser from 'webextension-polyfill';
import { SUBMISSION_INTERVAL_MS } from './submission';

export interface ExtensionSettings {
  apiKey: string | null;
  apiKeyVerified: boolean;
  autoSubmitEnabled: boolean;
}

const SUBMITTED_URLS_LIMIT = 1000;
const PENDING_AUTO_SUBMIT_URLS_LIMIT = 1000;
let pendingAutoSubmitUrlsUpdate = Promise.resolve();

function wait(delay: number) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get(['apiKey', 'apiKeyVerified', 'autoSubmitEnabled']);
  return {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : null,
    apiKeyVerified: stored.apiKeyVerified === true,
    autoSubmitEnabled: stored.autoSubmitEnabled !== false,
  };
}

export async function setApiKey(apiKey: string | null) {
  await browser.storage.local.set({ apiKey, apiKeyVerified: !!apiKey });
}

export async function invalidateApiKey() {
  await browser.storage.local.set({ apiKeyVerified: false, autoSubmitEnabled: false });
}

export async function setAutoSubmitEnabled(autoSubmitEnabled: boolean) {
  await browser.storage.local.set({ autoSubmitEnabled });
}

export async function hasSubmittedUrl(url: string) {
  const { submittedUrls } = await browser.storage.local.get('submittedUrls');
  return Array.isArray(submittedUrls) && submittedUrls.includes(url);
}

export async function markUrlSubmitted(url: string) {
  const { submittedUrls } = await browser.storage.local.get('submittedUrls');
  const urls: string[] = Array.isArray(submittedUrls) ? submittedUrls : [];
  if (urls.includes(url)) return;
  urls.push(url);
  while (urls.length > SUBMITTED_URLS_LIMIT) urls.shift();
  await browser.storage.local.set({ submittedUrls: urls });
}

export async function getSubmittedUrlCount() {
  const { submittedUrls } = await browser.storage.local.get('submittedUrls');
  return Array.isArray(submittedUrls) ? submittedUrls.length : 0;
}

export async function waitForSubmissionSlot() {
  const { lastSubmissionAttemptFinishedAt } = await browser.storage.local.get('lastSubmissionAttemptFinishedAt');
  const previousFinish = typeof lastSubmissionAttemptFinishedAt === 'number' ? lastSubmissionAttemptFinishedAt : 0;
  const delay = Math.max(0, previousFinish + SUBMISSION_INTERVAL_MS - Date.now());
  if (delay) await wait(delay);
}

export async function markSubmissionAttemptFinished() {
  await browser.storage.local.set({ lastSubmissionAttemptFinishedAt: Date.now() });
}

function toStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function updatePendingAutoSubmitUrls(update: (urls: string[], submittedUrls: string[]) => string[]) {
  pendingAutoSubmitUrlsUpdate = pendingAutoSubmitUrlsUpdate
    .catch(() => undefined)
    .then(async () => {
      const stored = await browser.storage.local.get(['pendingAutoSubmitUrls', 'submittedUrls']);
      const urls = toStringList(stored.pendingAutoSubmitUrls);
      const submittedUrls = toStringList(stored.submittedUrls);
      await browser.storage.local.set({ pendingAutoSubmitUrls: update(urls, submittedUrls) });
    });
  return pendingAutoSubmitUrlsUpdate;
}

export async function getNextPendingAutoSubmitUrl() {
  await pendingAutoSubmitUrlsUpdate.catch(() => undefined);
  const { pendingAutoSubmitUrls } = await browser.storage.local.get('pendingAutoSubmitUrls');
  return toStringList(pendingAutoSubmitUrls)[0];
}

export function addPendingAutoSubmitUrls(newUrls: string[]) {
  return updatePendingAutoSubmitUrls((urls, submittedUrls) =>
    [...new Set([...urls, ...newUrls])]
      .filter((url) => !submittedUrls.includes(url))
      .slice(0, PENDING_AUTO_SUBMIT_URLS_LIMIT)
  );
}

export function removePendingAutoSubmitUrl(url: string) {
  return updatePendingAutoSubmitUrls((urls) => urls.filter((pendingUrl) => pendingUrl !== url));
}

export function clearPendingAutoSubmitUrls() {
  return updatePendingAutoSubmitUrls(() => []);
}

export async function clearSubmittedUrls() {
  await browser.storage.local.remove('submittedUrls');
}
