import { selectMediaForCleanup } from "../lib/media-cleanup-policy";
import * as db from "./db";
import { storageDelete } from "./storage";

export async function runMediaCleanup() {
  const settings = await db.getStorageQuotaSettings();
  const media = await db.listActiveMediaForCleanup();
  const quotaBytes = settings.unlimited ? null : settings.quotaGb * 1024 * 1024 * 1024;
  const selected = selectMediaForCleanup({ media, quotaBytes });
  let cleanedBytes = 0;
  let cleanedCount = 0;

  for (const item of selected) {
    if (!item.mediaKey) continue;
    await storageDelete(item.mediaKey);
    await db.markMessageMediaCleaned(item.id);
    cleanedBytes += Math.max(0, item.mediaSize ?? 0);
    cleanedCount += 1;
  }

  await db.markStorageCleanupRan();
  return { cleanedCount, cleanedBytes, quotaBytes, unlimited: settings.unlimited };
}
