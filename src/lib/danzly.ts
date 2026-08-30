export const DANZLY_URL = import.meta.env.DEV ? 'http://localhost:9042' : 'https://danz.ly';

export function isDanzlyUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === 'danz.ly' ||
      parsedUrl.hostname.endsWith('.danz.ly') ||
      parsedUrl.origin === 'http://localhost:9042'
    );
  } catch {
    return false;
  }
}

export function isExtensionConnectUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return (
      (parsedUrl.origin === 'https://danz.ly' || parsedUrl.origin === 'http://localhost:9042') &&
      parsedUrl.pathname === '/extension/connect'
    );
  } catch {
    return false;
  }
}
