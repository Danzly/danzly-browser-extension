import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { findFacebookEventUrls } from '../lib/facebook.ts';

const source = ts.transpileModule(
  readFileSync(new URL('./index.ts', import.meta.url), 'utf8').replaceAll('import.meta.env.DEV', 'false'),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }
).outputText;

function createPage() {
  class Element {
    links: Element[] = [];
  }
  class HTMLAnchorElement extends Element {
    href: string;
    constructor(href: string) {
      super();
      this.href = href;
    }
    getAttribute() {
      return this.href;
    }
  }
  class HTMLAreaElement extends HTMLAnchorElement {}
  let traversedElements = 0;
  let clockTime = 0;
  let clockStep = 0;
  function collectAnchors(element: Element): Element[] {
    return element.links.flatMap((child) => [...(child instanceof HTMLAnchorElement ? [child] : []), ...collectAnchors(child)]);
  }

  const document = {
    visibilityState: 'visible',
    documentElement: new Element(),
    get links() {
      return collectAnchors(this.documentElement);
    },
    createTreeWalker(root: Element, _whatToShow: number, filter: { acceptNode: (node: Element) => number }) {
      function* walk(element: Element): Generator<Element> {
        for (const child of element.links) {
          traversedElements += 1;
          if (filter.acceptNode(child) === 2) continue;
          yield child;
          yield* walk(child);
        }
      }
      const elements = walk(root);
      return { nextNode: () => elements.next().value ?? null };
    },
    addEventListener() {},
    removeEventListener() {},
  };
  const messages: { urls: string[] }[] = [];
  const timers: { callback: () => void; delay: number }[] = [];
  const idleCallbacks: { callback: (deadline: { timeRemaining: () => number }) => void; timeout: number }[] = [];
  const messageListeners: ((message: unknown) => unknown)[] = [];
  let onMutations = (_mutations: { type: string; target?: Element; addedNodes?: Element[] }[]) => {};
  const window = {
    requestIdleCallback(callback: (deadline: { timeRemaining: () => number }) => void, options: { timeout: number }) {
      idleCallbacks.push({ callback, timeout: options.timeout });
      return idleCallbacks.length;
    },
    cancelIdleCallback() {},
  };
  const browser = {
    runtime: {
      onMessage: {
        addListener(listener: (message: unknown) => unknown) {
          messageListeners.push(listener);
        },
      },
      sendMessage(message: { urls: string[] }) {
        messages.push(message);
        return Promise.resolve();
      },
    },
  };
  const location = {
    href: 'https://www.facebook.com/example/events',
    hostname: 'www.facebook.com',
    pathname: '/example/events',
  };
  runInNewContext(source, {
    exports: {},
    require(name: string) {
      if (name === 'webextension-polyfill') return { __esModule: true, default: browser };
      if (name === '../lib/facebook') return { findFacebookEventUrls };
      if (name === '../connect') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
    document,
    window,
    location,
    Element,
    HTMLAnchorElement,
    HTMLAreaElement,
    NodeFilter: { SHOW_ELEMENT: 1, FILTER_REJECT: 2, FILTER_ACCEPT: 1 },
    performance: { now: () => (clockTime += clockStep) },
    MutationObserver: class {
      constructor(callback: typeof onMutations) {
        onMutations = callback;
      }
      observe() {}
      disconnect() {}
    },
    setTimeout(callback: () => void, delay: number) {
      timers.push({ callback, delay });
      return timers.length;
    },
    clearTimeout() {},
  });
  function flushScan(timeRemaining = 50) {
    const timer = timers.shift();
    assert.ok(timer);
    timer.callback();
    const idleCallback = idleCallbacks.shift();
    assert.ok(idleCallback);
    assert.equal(idleCallback.timeout, 1_000);
    idleCallback.callback({ timeRemaining: () => timeRemaining });
  }
  function flushAllScans() {
    for (let index = 0; timers.length && index < 1_000; index += 1) flushScan();
    assert.equal(timers.length, 0);
  }
  return {
    document,
    messages,
    timers,
    location,
    Element,
    HTMLAnchorElement,
    flushScan,
    flushAllScans,
    mutate: onMutations,
    sendMessage: (message: unknown) => {
      for (const listener of messageListeners) listener(message);
    },
    getTraversedElements: () => traversedElements,
    setClockStep(step: number) {
      clockStep = step;
    },
  };
}

test('captures dynamically added links before Facebook removes them, including additions while a scan is pending', () => {
  const page = createPage();
  page.flushScan();
  const container = new page.Element();
  container.links = [new page.HTMLAnchorElement('https://www.facebook.com/events/123/')];
  page.mutate([{ type: 'childList', addedNodes: [container] }]);
  page.mutate([
    { type: 'childList', addedNodes: [new page.HTMLAnchorElement('https://www.facebook.com/events/456/')] },
  ]);
  assert.equal(page.timers.length, 1);
  assert.equal(page.timers[0]?.delay, 250);
  page.flushScan();
  assert.deepEqual(Array.from(page.messages.flatMap((message) => message.urls)).sort(), [
    'https://www.facebook.com/events/123',
    'https://www.facebook.com/events/456',
  ]);
  page.mutate([{ type: 'childList', addedNodes: [container] }]);
  page.flushScan();
  assert.equal(page.messages.length, 1);
});

test('detects href updates and event page navigation', () => {
  const page = createPage();
  page.flushScan();
  page.mutate([{ type: 'childList', addedNodes: [new page.Element()] }]);
  page.flushScan();
  const link = new page.HTMLAnchorElement('https://www.facebook.com/events/789/');
  page.mutate([{ type: 'attributes', target: link }]);
  page.flushScan();
  page.location.href = 'https://www.facebook.com/events/987/';
  page.mutate([{ type: 'childList', addedNodes: [new page.Element()] }]);
  page.flushScan();
  assert.deepEqual(Array.from(page.messages.flatMap((message) => message.urls)), [
    'https://www.facebook.com/events/789',
    'https://www.facebook.com/events/987',
  ]);
});

test('reports all initial events beyond the old link and message limits', () => {
  const page = createPage();
  page.document.documentElement.links = [
    ...Array.from({ length: 5_001 }, () => new page.HTMLAnchorElement('https://www.facebook.com/example')),
    ...Array.from(
      { length: 145 },
      (_, index) => new page.HTMLAnchorElement(`https://www.facebook.com/events/${index}/`)
    ),
  ];
  page.flushScan();
  assert.ok(page.getTraversedElements() <= 200);
  assert.equal(page.messages.length, 0);
  assert.equal(page.timers.length, 1);
  page.flushAllScans();
  assert.ok(page.messages.every((message) => message.urls.length <= 100));
  assert.equal(new Set(page.messages.flatMap((message) => message.urls)).size, 145);
});

test('defers subtree traversal and deduplicates overlapping mutation roots', () => {
  const page = createPage();
  page.flushScan();
  const parent = new page.Element();
  const child = new page.Element();
  const link = new page.HTMLAnchorElement('https://www.facebook.com/events/123/');
  parent.links = [child];
  child.links = [link];
  page.mutate([{ type: 'childList', addedNodes: [parent, child, parent] }]);
  assert.equal(page.getTraversedElements(), 0);
  page.flushAllScans();
  assert.equal(page.getTraversedElements(), 2);
  assert.equal(page.messages.length, 1);
});

test('yields when idle time runs out and still makes bounded progress on a busy page', () => {
  const page = createPage();
  page.document.documentElement.links = Array.from(
    { length: 500 },
    (_, index) => new page.HTMLAnchorElement(`https://www.facebook.com/events/${index}/`)
  );
  page.flushScan(0);
  assert.equal(page.getTraversedElements(), 0);
  page.flushScan(0);
  assert.equal(page.getTraversedElements(), 1);
  page.flushAllScans();
  assert.equal(new Set(page.messages.flatMap((message) => message.urls)).size, 500);
});

test('retains new additions arriving while a large subtree is being scanned', () => {
  const page = createPage();
  const parent = page.document.documentElement;
  parent.links = Array.from({ length: 500 }, () => new page.Element());
  page.flushScan();
  const newContainer = new page.Element();
  newContainer.links = [new page.HTMLAnchorElement('https://www.facebook.com/events/999/')];
  parent.links.unshift(newContainer);
  page.mutate([{ type: 'childList', addedNodes: [newContainer] }]);
  page.flushAllScans();
  assert.deepEqual(Array.from(page.messages.flatMap((message) => message.urls)), [
    'https://www.facebook.com/events/999',
  ]);
});

test('yields after the time budget even when the browser reports plenty of idle time', () => {
  const page = createPage();
  page.document.documentElement.links = Array.from(
    { length: 500 },
    (_, index) => new page.HTMLAnchorElement(`https://www.facebook.com/events/${index}/`)
  );
  page.setClockStep(1);
  page.flushScan();
  assert.equal(page.getTraversedElements(), 2);
  assert.equal(page.timers.length, 1);
  page.setClockStep(0);
  page.flushAllScans();
  assert.equal(new Set(page.messages.flatMap((message) => message.urls)).size, 500);
});

test('reports already found links again when asked to rescan', () => {
  const page = createPage();
  page.document.documentElement.links = [new page.HTMLAnchorElement('https://www.facebook.com/events/654/')];
  page.flushAllScans();
  page.sendMessage({ type: 'rescan-page' });
  page.flushAllScans();
  assert.deepEqual(Array.from(page.messages.flatMap((message) => message.urls)), [
    'https://www.facebook.com/events/654',
    'https://www.facebook.com/events/654',
  ]);
});
