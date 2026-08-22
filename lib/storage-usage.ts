export const STORAGE_QUOTA_BYTES = 20 * 1024 * 1024 * 1024;

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
