import type browser from 'webextension-polyfill';

export const AUTO_SUBMIT_ORIGINS = ['http://*/*', 'https://*/*'];

export function getAutoSubmitPermissions() {
  const permissions: browser.Permissions.Permissions = { origins: AUTO_SUBMIT_ORIGINS };
  return permissions;
}
