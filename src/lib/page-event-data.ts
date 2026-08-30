export interface UserProvidedEventData {
  jsonLd: unknown[];
  textContent: string;
  images: string[];
  metadata: {
    title?: string;
    description?: string;
    imageUrl?: string;
    startTime?: string;
    endTime?: string;
    location?: string;
  };
}

export function isUserProvidedEventData(value: unknown): value is UserProvidedEventData {
  return (
    typeof value === 'object' &&
    value !== null &&
    'jsonLd' in value &&
    Array.isArray(value.jsonLd) &&
    'textContent' in value &&
    typeof value.textContent === 'string' &&
    'images' in value &&
    Array.isArray(value.images) &&
    'metadata' in value &&
    typeof value.metadata === 'object' &&
    value.metadata !== null
  );
}

export function collectPageEventData(): UserProvidedEventData | null {
  const MAX_JSON_LD_LENGTH = 40_000;
  const MAX_TEXT_LENGTH = 10_000;
  const MAX_IMAGES = 10;

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  function isEventType(value: unknown) {
    const types = Array.isArray(value) ? value : [value];
    return types.some(
      (type) => typeof type === 'string' && (type === 'Event' || type.endsWith('Event') || type.endsWith('/Event'))
    );
  }

  function findEventValues(value: unknown, events: unknown[], depth = 0) {
    if (depth > 5 || events.length >= 10) return;
    if (Array.isArray(value)) {
      for (const item of value) findEventValues(item, events, depth + 1);
      return;
    }
    if (!isRecord(value)) return;
    if (isEventType(value['@type'])) {
      events.push(value);
      return;
    }
    for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
      if (key in value) findEventValues(value[key], events, depth + 1);
    }
  }

  function getMetaContent(names: string[]) {
    for (const name of names) {
      const element = document.querySelector<HTMLMetaElement>(`meta[property="${name}"], meta[name="${name}"]`);
      const content = element?.content.trim();
      if (content) return content;
    }
    return undefined;
  }

  const eventValues: unknown[] = [];
  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    try {
      findEventValues(JSON.parse(script.textContent || ''), eventValues);
    } catch {
      continue;
    }
  }

  const jsonLd: unknown[] = [];
  let jsonLdLength = 0;
  for (const eventValue of eventValues) {
    const serializedValue = JSON.stringify(eventValue);
    if (jsonLdLength + serializedValue.length > MAX_JSON_LD_LENGTH) continue;
    jsonLd.push(eventValue);
    jsonLdLength += serializedValue.length;
  }

  const title = getMetaContent(['og:title']) || document.title.trim() || undefined;
  const description = getMetaContent(['og:description', 'description'])?.slice(0, 10_000);
  const imageUrlValue = getMetaContent(['og:image']);
  const imageUrl = imageUrlValue && /^https?:\/\//.test(imageUrlValue) ? imageUrlValue : undefined;
  const startTime = getMetaContent(['event:start_time']);
  const endTime = getMetaContent(['event:end_time']);
  const location = getMetaContent(['event:location', 'place:location']);
  const metadata = {
    ...(title && { title: title.slice(0, 500) }),
    ...(description && { description }),
    ...(imageUrl && { imageUrl }),
    ...(startTime && { startTime: startTime.slice(0, 100) }),
    ...(endTime && { endTime: endTime.slice(0, 100) }),
    ...(location && { location: location.slice(0, 2_000) }),
  };

  const textContent = (document.body?.innerText || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
  const imageCandidates = [
    ...(imageUrl ? [imageUrl] : []),
    ...Array.from(document.images)
      .filter((image) => image.naturalWidth >= 300 || image.naturalHeight >= 300)
      .map((image) => image.currentSrc || image.src)
      .filter((url) => /^https?:\/\//.test(url)),
  ];
  const images = [...new Set(imageCandidates)].slice(0, MAX_IMAGES);

  return jsonLd.length || textContent || images.length || Object.keys(metadata).length
    ? { jsonLd, textContent, images, metadata }
    : null;
}
