import type { SubmitPageResult } from './api';

export interface FacebookEventUrlsFoundMessage {
  type: 'facebook-event-urls-found';
  urls: string[];
}

export interface SubmitFacebookGroupsMessage {
  type: 'submit-facebook-groups';
  tabId: number;
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

export interface RescanTabMessage {
  type: 'rescan-tab';
  tabId: number;
}

export interface RescanPageMessage {
  type: 'rescan-page';
}

export interface AutoSubmitStateChangedMessage {
  type: 'auto-submit-state-changed';
  enabled: boolean;
}

export type BackgroundMessage =
  | ConnectApiKeyMessage
  | FacebookEventUrlsFoundMessage
  | SubmitFacebookGroupsMessage
  | GetConnectionStatusMessage
  | RescanTabMessage
  | SubmitCurrentTabMessage
  | SaveApiKeyMessage
  | SetAutoSubmitMessage;

export type SubmitCurrentTabResponse =
  | { success: true; result?: SubmitPageResult; alreadySubmitted: boolean }
  | { success: false; error: string };
export type SubmitFacebookGroupsResponse = { success: true; foundCount: number; submittedCount: number } | { success: false; error: string };export type SaveApiKeyResponse = { success: true } | { success: false; error: string };
export type SetAutoSubmitResponse = { success: true } | { success: false; error: string };
export type GetConnectionStatusResponse = { connected: boolean };
