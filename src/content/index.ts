import browser from 'webextension-polyfill';
import { initializeConnectionBridge } from '../connect';
import { findFacebookEventUrls } from '../lib/facebook';
import type { AutoSubmitStateChangedMessage, FacebookEventUrlsFoundMessage } from '../lib/messages';

const INITIAL_LINK_SCAN_DELAY_MS = 500;
const MUTATION_SCAN_DELAY_MS = 250;
const IDLE_SCAN_TIMEOUT_MS = 1_000;
const MAX_ELEMENTS_PER_SLICE = 200;
const MAX_SCAN_SLICE_MS = 4;
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

function collectFacebookEventLink(element: Element, links: Set<string>) {
  if (!(element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement)) return;
  const href = element.href;
  if (!href) return;
  const normalizedHref = href.toLowerCase();
  if (normalizedHref.includes('facebook.com/events/') || normalizedHref.includes('fb.me/e/')) links.add(href);
}

function sendCandidates(links: string[], includePageUrl: boolean, reportedUrls: Set<string>) {
  const urls = findFacebookEventUrls({
    pageUrl: includePageUrl ? location.href : '',
    links,
    text: '',
  }).filter((url) => !reportedUrls.has(url));
  for (let index = 0; index < urls.length; index += MAX_URLS_PER_SCAN) {
    const batch = urls.slice(index, index + MAX_URLS_PER_SCAN);
    for (const url of batch) reportedUrls.add(url);
    const message: FacebookEventUrlsFoundMessage = { type: 'facebook-event-urls-found', urls: batch };
    browser.runtime.sendMessage(message).catch(() => {
      for (const url of batch) reportedUrls.delete(url);
    });
  }
}

function createController() {
  let active = false;
  let fullScanNeeded = true;
  let lastPageUrl = location.href;
  let scanTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let idleCallbackId: number | null = null;
  const reportedUrls = new Set<string>();
  const pendingLinks = new Set<string>();
  let pendingRoots = new Set<Element>();
  let scanRoots = new Set<Element>();
  let scannedElements = new WeakSet<Element>();
  let walker: TreeWalker | null = null;
  const observer = new MutationObserver(handleMutations);

  function scanLinks(deadline?: IdleDeadline) {
    idleCallbackId = null;
    if (!active || document.visibilityState !== 'visible') return;
    if (fullScanNeeded) pendingRoots.add(document.documentElement);
    fullScanNeeded = false;
    const startedAt = performance.now();
    let processedElements = 0;
    while (
      processedElements < MAX_ELEMENTS_PER_SLICE &&
      performance.now() - startedAt < MAX_SCAN_SLICE_MS &&
      (processedElements === 0 || !deadline || deadline.timeRemaining() > 1)
    ) {
      if (!walker) {
        if (!scanRoots.size) {
          scanRoots = pendingRoots;
          pendingRoots = new Set();
          scannedElements = new WeakSet();
        }
        const root = scanRoots.values().next().value;
        if (!root) break;
        scanRoots.delete(root);
        processedElements += 1;
        if (scannedElements.has(root)) continue;
        scannedElements.add(root);
        collectFacebookEventLink(root, pendingLinks);
        walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
          acceptNode(node) {
            return node instanceof Element && scannedElements.has(node)
              ? NodeFilter.FILTER_REJECT
              : NodeFilter.FILTER_ACCEPT;
          },
        });
        continue;
      }
      const element = walker.nextNode();
      processedElements += 1;
      if (!(element instanceof Element)) {
        walker = null;
        continue;
      }
      scannedElements.add(element);
      collectFacebookEventLink(element, pendingLinks);
    }
    const links = [...pendingLinks];
    pendingLinks.clear();
    lastPageUrl = location.href;
    sendCandidates(links, true, reportedUrls);
    if (walker || scanRoots.size || pendingRoots.size) scheduleLinkScan(0);
  }

  function queueIdleScan() {
    scanTimeoutId = null;
    if (!active || document.visibilityState !== 'visible') return;
    if (typeof window.requestIdleCallback === 'function') {
      idleCallbackId = window.requestIdleCallback(scanLinks, { timeout: IDLE_SCAN_TIMEOUT_MS });
    } else {
      scanLinks();
    }
  }

  function scheduleLinkScan(delay: number) {
    if (!active || document.visibilityState !== 'visible' || scanTimeoutId !== null || idleCallbackId !== null) return;
    scanTimeoutId = setTimeout(queueIdleScan, delay);
  }

  function handleMutations(mutations: MutationRecord[]) {
    for (const mutation of mutations) {
      const roots = mutation.type === 'attributes' ? [mutation.target] : mutation.addedNodes;
      for (const root of roots) {
        if (!(root instanceof Element)) continue;
        collectFacebookEventLink(root, pendingLinks);
        if (mutation.type !== 'attributes') pendingRoots.add(root);
      }
    }
    if (pendingLinks.size || pendingRoots.size || lastPageUrl !== location.href)
      scheduleLinkScan(MUTATION_SCAN_DELAY_MS);
  }

  function cancelScheduledScan() {
    if (scanTimeoutId !== null) clearTimeout(scanTimeoutId);
    scanTimeoutId = null;
    if (idleCallbackId !== null) window.cancelIdleCallback(idleCallbackId);
    idleCallbackId = null;
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
      fullScanNeeded = true;
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href'],
      });
      scheduleLinkScan(MUTATION_SCAN_DELAY_MS);
    } else {
      observer.disconnect();
      cancelScheduledScan();
    }
  }

  function start() {
    if (active || isIgnoredHostname(location.hostname)) return;
    active = true;
    fullScanNeeded = true;
    sendCandidates([], true, reportedUrls);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (document.visibilityState === 'visible') {
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['href'],
      });
      scheduleLinkScan(INITIAL_LINK_SCAN_DELAY_MS);
    }
  }

  function stop() {
    active = false;
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    observer.disconnect();
    cancelScheduledScan();
    pendingRoots.clear();
    scanRoots.clear();
    pendingLinks.clear();
    walker = null;
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
