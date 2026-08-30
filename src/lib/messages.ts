import type { SubmitPageResult } from './api';

export interface FacebookEventUrlsFoundMessage {
  type: 'facebook-event-urls-found';
  urls: string[];
}

export interface SubmitCurrentTabMessage {
  type: 'submit-current-tab';
  url: string;
  tabId: number;
}

export interface SaveApiKeyMessage {
  type: 'save-api-key';
  apiKey: string | null;
}

export interface SetAutoSubmitMessage {
  type: 'set-auto-submit';
  enabled: boolean;
}

export interface ConnectApiKeyMessage {
  type: 'connect-api-key';
  apiKey: string;
}

export interface GetConnectionStatusMessage {
  type: 'get-connection-status';
}

export interface AutoSubmitStateChangedMessage {
  type: 'auto-submit-state-changed';
  enabled: boolean;
}

export type BackgroundMessage =
  | ConnectApiKeyMessage
  | FacebookEventUrlsFoundMessage
  | GetConnectionStatusMessage
  | SubmitCurrentTabMessage
  | SaveApiKeyMessage
  | SetAutoSubmitMessage;

export type SubmitCurrentTabResponse =
  | { success: true; result?: SubmitPageResult; alreadySubmitted: boolean }
  | { success: false; error: string };
export type SaveApiKeyResponse = { success: true } | { success: false; error: string };
export type SetAutoSubmitResponse = { success: true } | { success: false; error: string };
export type GetConnectionStatusResponse = { connected: boolean };
