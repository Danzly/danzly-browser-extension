import type { UserProvidedEventData } from './page-event-data';

const DEFAULT_API_BASE_URL = import.meta.env?.DEV ? 'http://localhost:3001' : 'https://danz.ly/api';
const API_BASE_URL = import.meta.env?.VITE_API_URL?.replace(/\/$/, '') || DEFAULT_API_BASE_URL;
const REQUEST_TIMEOUT_MS = 15_000;
const RETRY_DELAYS_MS = [250, 750];
const API_REQUEST_INTERVAL_MS = 2500;
let requestQueue = Promise.resolve();
let lastRequestStartedAt = 0;

export interface SubmitPageResult {
  eventSubmissionId: string;
}

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getErrorMessage(body: unknown) {
  if (!isRecord(body) || !isRecord(body.error) || typeof body.error.message !== 'string') return null;
  return body.error.message;
}

function getResult(body: unknown) {
  if (!isRecord(body) || !isRecord(body.result) || !isRecord(body.result.data)) return null;
  return body.result.data.json;
}

function wait(delay: number) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function waitForRequestSlot() {
  const slot = requestQueue.then(async () => {
    const delay = Math.max(0, lastRequestStartedAt + API_REQUEST_INTERVAL_MS - Date.now());
    if (delay) await wait(delay);
    lastRequestStartedAt = Date.now();
  });
  requestQueue = slot.then(() => undefined, () => undefined);
  return slot;
}

async function request(apiKey: string, procedure: string, input: Record<string, unknown>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    await waitForRequestSlot();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE_URL}/trpc/${procedure}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
        body: JSON.stringify({ json: input }),
        signal: controller.signal,
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new ApiRequestError(getErrorMessage(body) || `Request failed (status ${response.status})`, response.status);
        if (response.status < 500 || attempt === RETRY_DELAYS_MS.length) throw error;
        lastError = error;
      } else {
        return getResult(body);
      }
    } catch (error) {
      if (error instanceof ApiRequestError && error.status < 500) throw error;
      lastError = error;
      if (attempt === RETRY_DELAYS_MS.length) break;
    } finally {
      clearTimeout(timeoutId);
    }
    await wait(RETRY_DELAYS_MS[attempt] || 0);
  }
  throw new Error('Danzly could not be reached. Please try again.', { cause: lastError });
}

export async function submitPage(apiKey: string, eventLink: string, userProvidedData?: UserProvidedEventData) {
  const result = await request(apiKey, 'extension.submitPage', { eventLink, ...(userProvidedData && { userProvidedData }) });
  if (!isRecord(result) || typeof result.eventSubmissionId !== 'string') throw new Error('Danzly returned an invalid response');
  return { eventSubmissionId: result.eventSubmissionId };
}

export async function validateApiKey(apiKey: string) {
  const result = await request(apiKey, 'extension.validateKey', {});
  if (!isRecord(result) || result.valid !== true) throw new Error('Danzly returned an invalid response');
}
