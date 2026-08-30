import browser from 'webextension-polyfill';
import type { GetConnectionStatusResponse, SaveApiKeyResponse } from '../lib/messages';

const WEB_SOURCE = 'danzly-web';
const EXTENSION_SOURCE = 'danzly-extension';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSaveApiKeyResponse(value: unknown): value is SaveApiKeyResponse {
  return isRecord(value) && typeof value.success === 'boolean' && (value.success || typeof value.error === 'string');
}

function isConnectionStatusResponse(value: unknown): value is GetConnectionStatusResponse {
  return isRecord(value) && typeof value.connected === 'boolean';
}

function postResponse(type: string, requestId: string, response: Record<string, unknown>) {
  window.postMessage({ source: EXTENSION_SOURCE, type, requestId, ...response }, window.location.origin);
}

export function initializeConnectionBridge() {
  window.addEventListener('message', async (event: MessageEvent<unknown>) => {
    if (event.source !== window || event.origin !== window.location.origin || !isRecord(event.data)) return;
    const { source, type, requestId } = event.data;
    if (source !== WEB_SOURCE || typeof type !== 'string' || typeof requestId !== 'string') return;

    if (type === 'connection-status-request') {
      const response = await browser.runtime.sendMessage({ type: 'get-connection-status' });
      if (isConnectionStatusResponse(response)) postResponse('connection-status-response', requestId, response);
      return;
    }

    if (type !== 'connect-api-key-request' || typeof event.data.apiKey !== 'string') return;
    const response = await browser.runtime.sendMessage({ type: 'connect-api-key', apiKey: event.data.apiKey });
    if (isSaveApiKeyResponse(response)) postResponse('connect-api-key-response', requestId, response);
  });
}
