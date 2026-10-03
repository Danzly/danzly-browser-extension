export interface FacebookGroupData {
  name: string;
  url: string;
  memberCount: number | null;
}

export function isFacebookGroupSearchUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const isFacebookHostname = ['facebook.com', 'www.facebook.com', 'web.facebook.com'].includes(parsedUrl.hostname);
    return isFacebookHostname && /^\/(groups\/search|search\/groups)(\/|$)/.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

export function isFacebookGroupData(value: unknown): value is FacebookGroupData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    typeof value.name === 'string' &&
    'url' in value &&
    typeof value.url === 'string' &&
    'memberCount' in value &&
    (value.memberCount === null || (typeof value.memberCount === 'number' && Number.isInteger(value.memberCount)))
  );
}

export function collectFacebookGroups(): FacebookGroupData[] {
  const MAX_GROUPS = 500;
  const GROUP_PATH_REGEX = /^\/groups\/([A-Za-z0-9._-]+)\/?$/;
  const MEMBER_COUNT_REGEX = /(\d[\d.,]*)\s*([KM])?\s+members?\b/i;
  const EXCLUDED_GROUP_SLUGS = new Set(['search', 'feed', 'discover', 'joins', 'create', 'notifications', 'categories', 'category']);

  function getGroupUrl(link: HTMLAnchorElement) {
    try {
      const url = new URL(link.href);
      const slug = GROUP_PATH_REGEX.exec(url.pathname)?.[1];
      if (!url.hostname.endsWith('facebook.com') || !slug || EXCLUDED_GROUP_SLUGS.has(slug)) return null;
      return `https://www.facebook.com/groups/${slug}`;
    } catch {
      return null;
    }
  }

  function countGroupUrls(element: Element) {
    const urls = new Set<string>();
    for (const link of element.querySelectorAll<HTMLAnchorElement>('a[href*="/groups/"]')) {
      const url = getGroupUrl(link);
      if (url) urls.add(url);
    }
    return urls.size;
  }

  function parseMemberCount(text: string) {
    const match = MEMBER_COUNT_REGEX.exec(text);
    if (!match?.[1]) return null;
    const suffix = match[2]?.toUpperCase();
    const value = suffix
      ? Number(match[1].replace(',', '.')) * (suffix === 'M' ? 1_000_000 : 1_000)
      : Number(match[1].replace(/[.,]/g, ''));
    return Number.isFinite(value) ? Math.round(value) : null;
  }

  const root = document.querySelector('[role="main"]') || document.body;
  const groups = new Map<string, FacebookGroupData>();
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href*="/groups/"]')) {
    const url = getGroupUrl(link);
    const name = link.innerText.trim();
    if (!url || !name || groups.has(url)) continue;
    let container: Element = link;
    while (container.parentElement && container.parentElement !== root && countGroupUrls(container.parentElement) <= 1) {
      container = container.parentElement;
    }
    const containerText = container instanceof HTMLElement ? container.innerText : container.textContent || '';
    groups.set(url, { name: name.slice(0, 500), url, memberCount: parseMemberCount(containerText) });
  }
  return [...groups.values()].slice(0, MAX_GROUPS);
}
