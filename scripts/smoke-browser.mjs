import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';

const executableCandidates = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
let executablePath;
for (const candidate of executableCandidates) {
  try {
    await access(candidate);
    executablePath = candidate;
    break;
  } catch {
    continue;
  }
}
if (!executablePath) throw new Error('Set CHROMIUM_PATH to run the extension browser smoke test');

const extensionDirectory = path.resolve('dist');
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'danzly-extension-smoke-'));
const browserProcess = spawn(
  executablePath,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-background-networking',
    '--disable-component-update',
    `--disable-extensions-except=${extensionDirectory}`,
    `--load-extension=${extensionDirectory}`,
    `--user-data-dir=${profileDirectory}`,
    '--remote-debugging-port=0',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);
let browserErrors = '';
browserProcess.stderr.on('data', (chunk) => {
  browserErrors += chunk.toString();
});

function withTimeout(promise, message, timeout = 5_000) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeout);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

async function waitForDebuggerAddress() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const debuggerAddress = await readFile(path.join(profileDirectory, 'DevToolsActivePort'), 'utf8').catch(() => null);
    if (debuggerAddress) {
      const [port, socketPath] = debuggerAddress.trim().split('\n');
      if (port && socketPath) return { port, socketPath };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Chromium did not start its debugger. ${browserErrors}`);
}

try {
  const { port } = await waitForDebuggerAddress();
  let extensionId;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const preferences = await readFile(path.join(profileDirectory, 'Default', 'Preferences'), 'utf8')
      .then((value) => JSON.parse(value))
      .catch(() => null);
    const extensionSettings = preferences?.extensions?.settings;
    if (extensionSettings) {
      extensionId = Object.entries(extensionSettings).find(([, settings]) => settings.path === extensionDirectory)?.[0];
    }
    if (extensionId) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!extensionId) throw new Error(`The extension did not load. ${browserErrors}`);
  const popupUrl = `chrome-extension://${extensionId}/src/popup/index.html`;
  const popupTarget = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(popupUrl)}`, {
    method: 'PUT',
  }).then((response) => response.json());
  const socket = new WebSocket(popupTarget.webSocketDebuggerUrl);
  await withTimeout(
    new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    }),
    'Could not connect to the popup debugger'
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: 'document.body.innerText' } }));
  const popupText = await new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error('Popup evaluation timed out')), 5_000);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      clearTimeout(timeoutId);
      resolve(message.result?.result?.value);
    });
  });
  socket.close();
  if (typeof popupText !== 'string' || !popupText.includes('Danzly') || !popupText.includes('Not connected')) {
    throw new Error('The extension popup did not render its disconnected state');
  }
  console.log(`Chromium loaded extension ${extensionId} and rendered the popup`);
} finally {
  if (browserProcess.exitCode === null) {
    browserProcess.kill('SIGKILL');
    await withTimeout(once(browserProcess, 'exit'), 'Chromium did not stop');
  }
  await rm(profileDirectory, { recursive: true, force: true });
}
