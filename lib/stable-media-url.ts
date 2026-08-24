export type CacheableMediaUrl = {
  mediaCacheKey: string | null;
  mediaUrl: string | null;
};

/**
 * Signed media URLs are intentionally renewed by the server. Keep the first
 * still-valid URL for a cache key while a chat screen is mounted so polling
 * cannot remount an image and replay its transition on every refresh.
 */
export function preserveStableMediaUrl<T extends CacheableMediaUrl>(
  cache: Map<string, string>,
  item: T,
): T {
  if (!item.mediaCacheKey || !item.mediaUrl) return item;
  const previousUrl = cache.get(item.mediaCacheKey);
  if (previousUrl) {
    return previousUrl === item.mediaUrl ? item : { ...item, mediaUrl: previousUrl };
  }
  cache.set(item.mediaCacheKey, item.mediaUrl);
  return item;
}
