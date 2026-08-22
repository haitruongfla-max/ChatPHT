export const STORAGE_QUOTA_OPTIONS_GB = [20, 50, 100, 200] as const;
export type StorageQuotaGb = (typeof STORAGE_QUOTA_OPTIONS_GB)[number];
export const DEFAULT_STORAGE_QUOTA_GB: StorageQuotaGb = 200;
export const STORAGE_QUOTA_BYTES = DEFAULT_STORAGE_QUOTA_GB * 1024 * 1024 * 1024;
export const STORAGE_WARNING_PERCENT = 90;
export const STORAGE_CLEANUP_TARGET_PERCENT = 70;
export const MEDIA_RETENTION_DAYS = 30;

export function quotaGbToBytes(quotaGb: number) {
  return Math.max(0, quotaGb) * 1024 * 1024 * 1024;
}

export function formatStorageGb(bytes: number, fractionDigits = 4) {
  const safeBytes = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  return (safeBytes / (1024 * 1024 * 1024)).toLocaleString("vi-VN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

export function storageUsagePercent(usedBytes: number, quotaBytes = STORAGE_QUOTA_BYTES) {
  if (!Number.isFinite(quotaBytes) || quotaBytes <= 0) return 0;
  return Math.min(100, Math.max(0, (Math.max(0, usedBytes) / quotaBytes) * 100));
}
