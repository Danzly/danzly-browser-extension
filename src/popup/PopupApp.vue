<template>
  <div class="popup">
    <header class="popup__header">
      <span class="popup__title">Danzly</span>
      <span class="popup__status" :class="{ 'popup__status--connected': isConnected }">
        {{ isConnected ? 'Connected' : '⚠ Not connected' }}
      </span>
    </header>

    <section class="popup__section">
      <div class="popup__label">Danzly account</div>
      <template v-if="!isConnected">
        <button class="popup__secondary-button" @click="openConnectPage">Connect extension</button>
        <button class="popup__link-button" @click="manualSetupVisible = !manualSetupVisible">
          {{ manualSetupVisible ? 'Hide manual setup' : 'Enter API key manually' }}
        </button>
        <form v-if="manualSetupVisible" class="popup__manual-form" @submit.prevent="onSaveApiKey">
          <label class="popup__label" for="api-key">Danzly API key</label>
          <input
            id="api-key"
            v-model="apiKeyInput"
            class="popup__input"
            type="password"
            autocomplete="off"
            placeholder="Paste your API key"
          />
          <button class="popup__button" :disabled="!apiKeyInput.trim() || apiKeySavingLoading" type="submit">
            {{ apiKeySavingLoading ? 'Saving…' : 'Save API key' }}
          </button>
        </form>
      </template>
      <button v-else class="popup__secondary-button" :disabled="disconnectLoading" @click="onDisconnect">
        {{ disconnectLoading ? 'Disconnecting…' : 'Disconnect' }}
      </button>
      <p class="popup__hint">
        {{ isConnected ? 'Your extension is ready to submit events.' : 'Connect securely with your Danzly account.' }}
      </p>
    </section>

    <section class="popup__section popup__section--row">
      <div>
        <label class="popup__label popup__label--inline" for="auto-submit">Submit events automatically</label>
        <div class="popup__hint">When enabled, Danzly scans pages locally for Facebook event links.</div>
      </div>
      <input
        id="auto-submit"
        v-model="autoSubmitEnabled"
        type="checkbox"
        :disabled="!isConnected || autoSubmitLoading"
        @change="onToggleAutoSubmit"
      />
    </section>

    <section class="popup__section">
      <div v-if="currentTabUrl" class="popup__current-url" :title="currentTabUrl">{{ currentTabUrl }}</div>
      <button class="popup__button" :disabled="!canSubmitCurrentTab || submissionLoading" @click="onSubmitCurrentTab">
        {{ submissionLoading ? 'Submitting…' : 'Submit this page' }}
      </button>
      <p v-if="statusMessage" class="popup__status-message" :class="{ 'popup__status-message--error': statusIsError }">
        {{ statusMessage }}
      </p>
    </section>

    <footer class="popup__footer"><a href="#" @click.prevent="openPrivacyPolicy">Privacy policy</a></footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import browser from 'webextension-polyfill';
import { DANZLY_URL } from '../lib/danzly';
import { getSettings } from '../lib/storage';
import type { SaveApiKeyResponse, SetAutoSubmitResponse, SubmitCurrentTabResponse } from '../lib/messages';

const isConnected = ref(false);
const autoSubmitEnabled = ref(false);
const disconnectLoading = ref(false);
const apiKeySavingLoading = ref(false);
const autoSubmitLoading = ref(false);
const submissionLoading = ref(false);
const manualSetupVisible = ref(false);
const apiKeyInput = ref('');
const currentTabUrl = ref('');
const currentTabId = ref<number | null>(null);
const statusMessage = ref('');
const statusIsError = ref(false);

const canSubmitCurrentTab = computed(
  () =>
    isConnected.value &&
    currentTabId.value !== null &&
    /^https?:\/\//.test(currentTabUrl.value) &&
    !submissionLoading.value
);

function setStatus(message: string, isError = false) {
  statusMessage.value = message;
  statusIsError.value = isError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isActionResponse(value: unknown): value is SaveApiKeyResponse | SetAutoSubmitResponse {
  return isRecord(value) && typeof value.success === 'boolean' && (value.success || typeof value.error === 'string');
}

function isSubmitResponse(value: unknown): value is SubmitCurrentTabResponse {
  return (
    isRecord(value) &&
    typeof value.success === 'boolean' &&
    (value.success ? typeof value.alreadySubmitted === 'boolean' : typeof value.error === 'string')
  );
}

onMounted(async () => {
  const [settings, activeTabs] = await Promise.all([
    getSettings(),
    browser.tabs.query({ active: true, currentWindow: true }),
  ]);
  isConnected.value = !!settings.apiKey && settings.apiKeyVerified;
  autoSubmitEnabled.value = settings.autoSubmitEnabled;
  currentTabUrl.value = activeTabs[0]?.url || '';
  currentTabId.value = activeTabs[0]?.id ?? null;
});

async function onDisconnect() {
  disconnectLoading.value = true;
  setStatus('');
  try {
    const result = await browser.runtime.sendMessage({ type: 'save-api-key', apiKey: null });
    if (!isActionResponse(result)) throw new Error('The extension returned an invalid response');
    if (!result.success) {
      setStatus(result.error, true);
      return;
    }
    isConnected.value = false;
    autoSubmitEnabled.value = false;
    setStatus('Disconnected.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to disconnect', true);
  } finally {
    disconnectLoading.value = false;
  }
}

async function onSaveApiKey() {
  apiKeySavingLoading.value = true;
  setStatus('');
  try {
    const result = await browser.runtime.sendMessage({ type: 'save-api-key', apiKey: apiKeyInput.value.trim() });
    if (!isActionResponse(result)) throw new Error('The extension returned an invalid response');
    if (!result.success) {
      setStatus(result.error, true);
      return;
    }
    isConnected.value = true;
    apiKeyInput.value = '';
    manualSetupVisible.value = false;
    setStatus('Connected.');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to save API key', true);
  } finally {
    apiKeySavingLoading.value = false;
  }
}

async function onToggleAutoSubmit() {
  autoSubmitLoading.value = true;
  setStatus('');
  const requestedState = autoSubmitEnabled.value;
  try {
    const result = await browser.runtime.sendMessage({ type: 'set-auto-submit', enabled: requestedState });
    if (!isActionResponse(result)) throw new Error('The extension returned an invalid response');
    if (!result.success) {
      autoSubmitEnabled.value = !requestedState;
      setStatus(result.error, true);
      return;
    }
    setStatus(requestedState ? 'Automatic submission enabled.' : 'Automatic submission disabled.');
  } catch (error) {
    autoSubmitEnabled.value = !requestedState;
    setStatus(error instanceof Error ? error.message : 'Failed to update automatic submission', true);
  } finally {
    autoSubmitLoading.value = false;
  }
}

function openConnectPage() {
  browser.tabs.create({ url: `${DANZLY_URL}/extension/connect` });
}

function openPrivacyPolicy() {
  browser.tabs.create({ url: `${DANZLY_URL}/extension/privacy` });
}

async function onSubmitCurrentTab() {
  if (currentTabId.value === null) return;
  setStatus('');
  submissionLoading.value = true;
  try {
    const result = await browser.runtime.sendMessage({
      type: 'submit-current-tab',
      url: currentTabUrl.value,
      tabId: currentTabId.value,
    });
    if (!isSubmitResponse(result)) throw new Error('The extension returned an invalid response');
    if (result.success) {
      setStatus(result.alreadySubmitted ? 'This page was already submitted.' : 'Submitted! Danzly will process it shortly.');
    } else {
      setStatus(result.error, true);
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : 'Failed to submit page', true);
  } finally {
    submissionLoading.value = false;
  }
}
</script>

<style scoped>
.popup {
  width: 320px;
  padding: 16px;
  background: #000;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

.popup__header,
.popup__section--row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.popup__header {
  border-bottom: 1px solid #fff;
  padding-bottom: 12px;
  margin-bottom: 16px;
}

.popup__title {
  font-weight: 700;
  font-size: 18px;
  letter-spacing: 0.02em;
}

.popup__status,
.popup__hint {
  color: #999;
}

.popup__status {
  font-size: 12px;
  color: #ff6b6b;
}

.popup__status--connected {
  color: #fff;
}

.popup__section {
  margin-bottom: 16px;
}

.popup__section--row {
  gap: 12px;
}

.popup__label {
  display: block;
  font-size: 12px;
  color: #ccc;
  margin-bottom: 6px;
}

.popup__label--inline {
  margin-bottom: 2px;
}

.popup__hint {
  font-size: 11px;
  margin: 6px 0 0;
}

.popup a {
  color: #fff;
}

.popup__button,
.popup__secondary-button {
  background: #fff;
  color: #000;
  border: 1px solid #fff;
  padding: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.popup__link-button {
  display: block;
  border: 0;
  padding: 0;
  margin-top: 10px;
  background: transparent;
  color: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  text-decoration: underline;
}

.popup__manual-form {
  margin-top: 12px;
}

.popup__input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #fff;
  padding: 9px;
  margin-bottom: 8px;
  background: #000;
  color: #fff;
  font: inherit;
  font-size: 12px;
}

.popup__button {
  width: 100%;
}

.popup__secondary-button {
  padding: 6px 8px;
}

.popup__button:disabled,
.popup__secondary-button:disabled {
  background: #000;
  color: #555;
  border-color: #555;
  cursor: not-allowed;
}

.popup__current-url {
  margin-bottom: 8px;
  overflow: hidden;
  color: #ccc;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.popup__status-message {
  font-size: 12px;
  color: #fff;
  margin: 8px 0 0;
}

.popup__status-message--error {
  color: #ff6b6b;
}

.popup__footer {
  border-top: 1px solid #555;
  padding-top: 10px;
  font-size: 11px;
  text-align: right;
}
</style>
