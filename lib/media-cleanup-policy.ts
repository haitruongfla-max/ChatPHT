import { MEDIA_RETENTION_DAYS, STORAGE_CLEANUP_TARGET_PERCENT, STORAGE_WARNING_PERCENT } from "./storage-usage";

export type MediaCleanupCandidate = { id: number; mediaKey?: string | null; mediaSize: number | null; createdAt: Date };

export function selectMediaForCleanup({
  media,
  quotaBytes,
  now = new Date(),
}: {
  media: MediaCleanupCandidate[];
  quotaBytes: number | null;
  now?: Date;
}) {
  const sorted = [...media].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const retentionBoundary = new Date(now.getTime() - MEDIA_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const selected = sorted.filter((item) => item.createdAt < retentionBoundary);
  let usedBytes = sorted.reduce((total, item) => total + Math.max(0, item.mediaSize ?? 0), 0);
  for (const item of selected) usedBytes -= Math.max(0, item.mediaSize ?? 0);

  if (quotaBytes !== null && usedBytes > quotaBytes * (STORAGE_WARNING_PERCENT / 100)) {
    const targetBytes = quotaBytes * (STORAGE_CLEANUP_TARGET_PERCENT / 100);
    const selectedIds = new Set(selected.map((item) => item.id));
    for (const item of sorted) {
      if (usedBytes <= targetBytes) break;
      if (selectedIds.has(item.id)) continue;
      selected.push(item);
      usedBytes -= Math.max(0, item.mediaSize ?? 0);
    }
  }
  return selected;
}
