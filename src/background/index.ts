import browser from 'webextension-polyfill';
import { ApiRequestError, submitPage, validateApiKey } from '../lib/api';
import { DANZLY_URL, isDanzlyUrl, isExtensionConnectUrl } from '../lib/danzly';
import { isFacebookEventUrl, normalizeSubmissionUrl } from '../lib/facebook';
import { collectPageEventData, isUserProvidedEventData } from '../lib/page-event-data';
import { AUTO_SUBMIT_ORIGINS, getAutoSubmitPermissions } from '../lib/permissions';
import { createSubmissionTracker } from '../lib/submission';
import {
  clearSubmittedUrls,
  getSubmittedUrlCount,
  getSettings,
  hasSubmittedUrl,
  invalidateApiKey,
  markSubmissionAttemptFinished,
  markUrlSubmitted,
  setApiKey,
  setAutoSubmitEnabled,
  waitForSubmissionSlot,
} from '../lib/storage';
import type {
  AutoSubmitStateChangedMessage,
  BackgroundMessage,
  SaveApiKeyResponse,
  SetAutoSubmitResponse,
  SubmitCurrentTabResponse,
} from '../lib/messages';

const AUTO_SUBMIT_SCRIPT_ID = 'danzly-auto-submit';
const BADGE_BACKGROUND_COLOR = '#6b7280';
const MAX_URLS_PER_MESSAGE = 100;
let autoSubmitQueue = Promise.resolve();
const submissionTracker = createSubmissionTracker({
  hasSubmittedUrl,
  markSubmissionAttemptFinished,
  markUrlSubmitted,
  submitPage,
  waitForSubmissionSlot,
});

function getContentScriptFile() {
  const contentScriptFile = browser.runtime.getManifest().content_scripts?.[0]?.js?.[0];
  if (!contentScriptFile) throw new Error('Auto-submit content script is missing from the extension bundle');
  const extensionRoot = browser.runtime.getURL('');
  return contentScriptFile.startsWith(extensionRoot) ? contentScriptFile.slice(extensionRoot.length) : contentScriptFile;
}

async function hasAutoSubmitPermission() {
  return browser.permissions.contains(getAutoSubmitPermissions());
}

async function unregisterAutoSubmitScript() {
  const scripts = await browser.scripting.getRegisteredContentScripts({ ids: [AUTO_SUBMIT_SCRIPT_ID] });
  if (scripts.length) await browser.scripting.unregisterContentScripts({ ids: [AUTO_SUBMIT_SCRIPT_ID] });
}

async function syncAutoSubmitScript() {
  const [{ apiKeyVerified, autoSubmitEnabled }, permissionGranted] = await Promise.all([
    getSettings(),
    hasAutoSubmitPermission(),
  ]);
  const contentScriptFile = getContentScriptFile();
  const scripts = await browser.scripting.getRegisteredContentScripts({ ids: [AUTO_SUBMIT_SCRIPT_ID] });
  const registeredScript = scripts[0];
  if (!apiKeyVerified || !autoSubmitEnabled || !permissionGranted) {
    if (registeredScript) await unregisterAutoSubmitScript();
    return;
  }
  if (registeredScript?.js?.[0] === contentScriptFile) return;
  if (registeredScript) await unregisterAutoSubmitScript();
  await browser.scripting.registerContentScripts([
    {
      id: AUTO_SUBMIT_SCRIPT_ID,
      js: [contentScriptFile],
      matches: AUTO_SUBMIT_ORIGINS,
      excludeMatches: ['*://danz.ly/*', '*://*.danz.ly/*', ...(import.meta.env.DEV ? ['http://localhost:9042/*'] : [])],
      runAt: 'document_idle',
      ...(import.meta.env.VITE_TARGET_BROWSER === 'chrome' && { persistAcrossSessions: true }),
    },
  ]);
}

async function notifyOpenTabs(enabled: boolean, injectScript = false) {
  const message: AutoSubmitStateChangedMessage = { type: 'auto-submit-state-changed', enabled };
  const contentScriptFile = getContentScriptFile();
  const tabs = await browser.tabs.query({});
  await Promise.allSettled(
    tabs.map(async (tab) => {
      if (!tab.id || !tab.url || !/^https?:/.test(tab.url) || isDanzlyUrl(tab.url)) return;
      if (injectScript) {
        await browser.scripting.executeScript({ target: { tabId: tab.id }, files: [contentScriptFile] });
      } else {
        await browser.tabs.sendMessage(tab.id, message);
      }
    })
  );
}

async function syncSubmittedCountBadge() {
  const submittedUrlCount = await getSubmittedUrlCount();
  await Promise.all([
    browser.action.setBadgeText({ text: submittedUrlCount ? String(submittedUrlCount) : '' }),
    browser.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR }),
  ]);
}

async function processAutoSubmitUrls(urls: string[]) {
  const { apiKey, apiKeyVerified, autoSubmitEnabled } = await getSettings();
  if (!apiKey || !apiKeyVerified || !autoSubmitEnabled || !(await hasAutoSubmitPermission())) return;
  for (const rawUrl of urls.slice(0, MAX_URLS_PER_MESSAGE)) {
    if (!isFacebookEventUrl(rawUrl)) continue;
    const url = normalizeSubmissionUrl(rawUrl);
    try {
      const submission = await submissionTracker.submit(apiKey, url, true);
      if (!submission.alreadySubmitted) await syncSubmittedCountBadge();
    } catch (error) {
      console.error('Danzly: failed to auto-submit event', url, error);
      if (error instanceof ApiRequestError && error.status === 401) {
        await invalidateApiKey();
        await syncAutoSubmitScript();
        await notifyOpenTabs(false);
        break;
      }
      if (error instanceof ApiRequestError && error.status === 429) break;
      if (!(error instanceof ApiRequestError) || error.status !== 400) break;
    }
  }
}

function queueAutoSubmitUrls(urls: string[]) {
  autoSubmitQueue = autoSubmitQueue.catch(() => undefined).then(() => processAutoSubmitUrls(urls));
  return autoSubmitQueue;
}

async function submitCurrentTab(rawUrl: string, tabId: number): Promise<SubmitCurrentTabResponse> {
  const { apiKey, apiKeyVerified } = await getSettings();
  if (!apiKey || !apiKeyVerified) return { success: false, error: 'No verified API key is configured.' };
  try {
    const url = normalizeSubmissionUrl(rawUrl);
    const injectionResults = await browser.scripting
      .executeScript({ target: { tabId }, func: collectPageEventData })
      .catch(() => []);
    const injectionResult = injectionResults[0]?.result;
    const userProvidedData = isUserProvidedEventData(injectionResult) ? injectionResult : undefined;
    const submission = await submissionTracker.submit(apiKey, url, false, userProvidedData);
    if (!submission.alreadySubmitted) await syncSubmittedCountBadge();
    return { success: true, ...submission };
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) {
      await invalidateApiKey();
      await syncAutoSubmitScript();
      await notifyOpenTabs(false);
    }
    return { success: false, error: error instanceof Error ? error.message : 'Failed to submit page' };
  }
}

async function saveApiKey(apiKey: string | null): Promise<SaveApiKeyResponse> {
  if (!apiKey) {
    await setApiKey(null);
    await clearSubmittedUrls();
    await syncSubmittedCountBadge();
    await setAutoSubmitEnabled(false);
    await syncAutoSubmitScript();
    await notifyOpenTabs(false);
    return { success: true };
  }
  try {
    await validateApiKey(apiKey);
    const settings = await getSettings();
    if (settings.apiKey !== apiKey) {
      await clearSubmittedUrls();
      await syncSubmittedCountBadge();
    }
    await setApiKey(apiKey);
    await syncAutoSubmitScript();
    if (settings.autoSubmitEnabled) await notifyOpenTabs(true, true);
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Invalid API key' };
  }
}

async function updateAutoSubmit(enabled: boolean): Promise<SetAutoSubmitResponse> {
  if (enabled && !(await hasAutoSubmitPermission())) return { success: false, error: 'Website access was not granted.' };
  await setAutoSubmitEnabled(enabled);
  await syncAutoSubmitScript();
  await notifyOpenTabs(enabled, enabled);
  return { success: true };
}

function parseMessage(rawMessage: unknown): BackgroundMessage | null {
  if (typeof rawMessage !== 'object' || rawMessage === null || !('type' in rawMessage)) return null;
  if (rawMessage.type === 'facebook-event-urls-found' && 'urls' in rawMessage && Array.isArray(rawMessage.urls)) {
    const urls = rawMessage.urls.filter((url): url is string => typeof url === 'string').slice(0, MAX_URLS_PER_MESSAGE);
    return { type: rawMessage.type, urls };
  }
  if (
    rawMessage.type === 'submit-current-tab' &&
    'url' in rawMessage &&
    typeof rawMessage.url === 'string' &&
    'tabId' in rawMessage &&
    typeof rawMessage.tabId === 'number'
  ) {
    return { type: rawMessage.type, url: rawMessage.url, tabId: rawMessage.tabId };
  }
  if (
    rawMessage.type === 'save-api-key' &&
    'apiKey' in rawMessage &&
    (typeof rawMessage.apiKey === 'string' || rawMessage.apiKey === null)
  ) {
    return { type: rawMessage.type, apiKey: rawMessage.apiKey };
  }
  if (rawMessage.type === 'set-auto-submit' && 'enabled' in rawMessage && typeof rawMessage.enabled === 'boolean') {
    return { type: rawMessage.type, enabled: rawMessage.enabled };
  }
  if (rawMessage.type === 'connect-api-key' && 'apiKey' in rawMessage && typeof rawMessage.apiKey === 'string') {
    return { type: rawMessage.type, apiKey: rawMessage.apiKey };
  }
  if (rawMessage.type === 'get-connection-status') return { type: rawMessage.type };
  return null;
}

function isConnectPageSender(sender: browser.Runtime.MessageSender) {
  const senderUrl = sender.url || sender.tab?.url;
  return !!senderUrl && isExtensionConnectUrl(senderUrl);
}

function isExtensionPageSender(sender: browser.Runtime.MessageSender) {
  return sender.id === browser.runtime.id && !!sender.url && sender.url.startsWith(browser.runtime.getURL(''));
}

browser.runtime.onMessage.addListener((rawMessage: unknown, sender: browser.Runtime.MessageSender) => {
  const message = parseMessage(rawMessage);
  if (!message) return;
  switch (message.type) {
    case 'facebook-event-urls-found':
      if (!sender.tab) return;
      return queueAutoSubmitUrls(message.urls);
    case 'submit-current-tab':
      if (!isExtensionPageSender(sender)) return;
      return submitCurrentTab(message.url, message.tabId);
    case 'save-api-key':
      if (!isExtensionPageSender(sender)) return;
      return saveApiKey(message.apiKey);
    case 'set-auto-submit':
      if (!isExtensionPageSender(sender)) return;
      return updateAutoSubmit(message.enabled);
    case 'connect-api-key':
      if (!isConnectPageSender(sender)) return;
      return saveApiKey(message.apiKey);
    case 'get-connection-status':
      if (!isConnectPageSender(sender)) return;
      return getSettings().then((settings) => ({ connected: !!settings.apiKey && settings.apiKeyVerified }));
    default: {
      const exhaustiveCheck: never = message;
      throw new Error(`Unknown message: ${JSON.stringify(exhaustiveCheck)}`);
    }
  }
});

browser.permissions.onRemoved.addListener(() => syncAutoSubmitScript().then(() => notifyOpenTabs(false)).catch(console.error));
browser.runtime.onInstalled.addListener((details) => {
  Promise.all([syncAutoSubmitScript(), syncSubmittedCountBadge()])
    .then(async () => {
      if (details.reason === 'install') await browser.tabs.create({ url: `${DANZLY_URL}/extension/connect` });
    })
    .catch(console.error);
});
browser.runtime.onStartup.addListener(() =>
  Promise.all([syncAutoSubmitScript(), syncSubmittedCountBadge()]).catch(console.error)
);
chrome.storage.local.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(console.error);
syncAutoSubmitScript().catch(console.error);
syncSubmittedCountBadge().catch(console.error);
