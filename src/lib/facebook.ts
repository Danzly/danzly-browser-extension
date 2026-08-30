const FACEBOOK_EVENT_URL_REGEX =
  /https?:\/\/(?:www\.|m\.|web\.)?facebook\.com\/events\/[^\s"'<>]+|https?:\/\/fb\.me\/e\/[^\s"'<>]+/gi;
const TRAILING_TEXT_PUNCTUATION_REGEX = /[),.;!?\]}]+$/;

export function isFacebookEventUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    const isFacebookHostname = ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com'].includes(hostname);
    if (isFacebookHostname && parsedUrl.pathname.startsWith('/events/')) return true;
    if (hostname === 'fb.me' && parsedUrl.pathname.startsWith('/e/')) return true;
    return false;
  } catch {
    return false;
  }
}

export function normalizeFacebookEventUrl(url: string) {
  const parsedUrl = new URL(url.replace(TRAILING_TEXT_PUNCTUATION_REGEX, ''));
  parsedUrl.hash = '';
  parsedUrl.search = '';
  if (parsedUrl.hostname !== 'fb.me') parsedUrl.hostname = 'www.facebook.com';
  parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');
  return parsedUrl.toString();
}

export function normalizeSubmissionUrl(url: string) {
  if (isFacebookEventUrl(url)) return normalizeFacebookEventUrl(url);
  const parsedUrl = new URL(url);
  parsedUrl.hash = '';
  return parsedUrl.toString();
}

export function findFacebookEventUrls(source: { pageUrl: string; links: string[]; text: string }) {
  const foundUrls = new Set<string>();

  if (isFacebookEventUrl(source.pageUrl)) foundUrls.add(normalizeFacebookEventUrl(source.pageUrl));

  for (const link of source.links) {
    if (isFacebookEventUrl(link)) foundUrls.add(normalizeFacebookEventUrl(link));
  }

  for (const match of source.text.matchAll(FACEBOOK_EVENT_URL_REGEX)) {
    const matchedUrl = match[0].replace(TRAILING_TEXT_PUNCTUATION_REGEX, '');
    if (isFacebookEventUrl(matchedUrl)) foundUrls.add(normalizeFacebookEventUrl(matchedUrl));
  }

  return [...foundUrls];
}
