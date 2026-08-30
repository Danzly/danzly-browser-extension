import browser from 'webextension-polyfill';
import { initializeConnectionBridge } from '../connect';
import { findFacebookEventUrls } from '../lib/facebook';
import type { AutoSubmitStateChangedMessage, FacebookEventUrlsFoundMessage } from '../lib/messages';

const INITIAL_LINK_SCAN_DELAY_MS = 500;
const MUTATION_SCAN_INTERVAL_MS = 10_000;
const MAX_LINKS_PER_SCAN = 5_000;
const MAX_URLS_PER_SCAN = 100;

interface AutoSubmitController {
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    __danzlyAutoSubmitController?: AutoSubmitController;
  }
}

function isIgnoredHostname(hostname: string) {
  return (
    hostname === 'danz.ly' ||
    hostname.endsWith('.danz.ly') ||
    (import.meta.env.DEV && (hostname === 'localhost' || hostname === '127.0.0.1'))
  );
}

if (location.pathname === '/extension/connect' && isIgnoredHostname(location.hostname)) initializeConnectionBridge();

function collectFacebookEventLinks() {
  const foundLinks: string[] = [];
  for (let index = 0; index < MAX_LINKS_PER_SCAN; index += 1) {
    const link = document.links.item(index);
    if (!link) break;
    const href = link.getAttribute('href');
    if (!href) continue;
    const normalizedHref = href.toLowerCase();
    if (normalizedHref.includes('facebook.com/events/') || normalizedHref.includes('fb.me/e/')) foundLinks.push(link.href);
  }
  return foundLinks;
}

function sendCandidates(links: string[], includePageUrl: boolean, reportedUrls: Set<string>) {
  const urls = findFacebookEventUrls({
    pageUrl: includePageUrl ? location.href : '',
    links,
    text: '',
  })
    .filter((url) => !reportedUrls.has(url))
    .slice(0, MAX_URLS_PER_SCAN);
  if (!urls.length) return;
  for (const url of urls) reportedUrls.add(url);
  const message: FacebookEventUrlsFoundMessage = { type: 'facebook-event-urls-found', urls };
  browser.runtime.sendMessage(message).catch(() => undefined);
}

function createController() {
  let active = false;
  let lastLinkScanAt = 0;
  let scanTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let idleCallbackId: number | null = null;
  const reportedUrls = new Set<string>();
  const observer = new MutationObserver(handleMutations);

  function scanLinks() {
    idleCallbackId = null;
    if (!active || document.visibilityState !== 'visible') return;
    lastLinkScanAt = Date.now();
    sendCandidates(collectFacebookEventLinks(), false, reportedUrls);
  }

  function queueIdleScan() {
    scanTimeoutId = null;
    if (!active || document.visibilityState !== 'visible') return;
    idleCallbackId = window.requestIdleCallback(scanLinks);
  }

  function scheduleLinkScan(delay: number) {
    if (!active || document.visibilityState !== 'visible' || scanTimeoutId !== null || idleCallbackId !== null) return;
    scanTimeoutId = setTimeout(queueIdleScan, delay);
  }

  function scheduleMutationScan() {
    scheduleLinkScan(Math.max(0, lastLinkScanAt + MUTATION_SCAN_INTERVAL_MS - Date.now()));
  }

  function handleMutations() {
    if (scanTimeoutId !== null || idleCallbackId !== null) return;
    scheduleMutationScan();
  }

  function cancelScheduledScan() {
    if (scanTimeoutId !== null) clearTimeout(scanTimeoutId);
    scanTimeoutId = null;
    if (idleCallbackId !== null) window.cancelIdleCallback(idleCallbackId);
    idleCallbackId = null;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      scheduleMutationScan();
    } else {
      observer.disconnect();
      cancelScheduledScan();
    }
  }

  function start() {
    if (active || isIgnoredHostname(location.hostname)) return;
    active = true;
    sendCandidates([], true, reportedUrls);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (document.visibilityState === 'visible') {
      observer.observe(document.documentElement, { childList: true, subtree: true });
      scheduleLinkScan(INITIAL_LINK_SCAN_DELAY_MS);
    }
  }

  function stop() {
    active = false;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    observer.disconnect();
    cancelScheduledScan();
  }

  return { start, stop };
}

const existingController = window.__danzlyAutoSubmitController;
if (existingController) {
  existingController.start();
} else {
  const controller = createController();
  window.__danzlyAutoSubmitController = controller;
  browser.runtime.onMessage.addListener((rawMessage: unknown) => {
    if (
      typeof rawMessage !== 'object' ||
      rawMessage === null ||
      !('type' in rawMessage) ||
      rawMessage.type !== 'auto-submit-state-changed' ||
      !('enabled' in rawMessage) ||
      typeof rawMessage.enabled !== 'boolean'
    )
      return;
    const message: AutoSubmitStateChangedMessage = { type: rawMessage.type, enabled: rawMessage.enabled };
    if (message.enabled) controller.start();
    else controller.stop();
  });
  controller.start();
}
