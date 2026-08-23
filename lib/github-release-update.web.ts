export type ChatPHTRelease = {
  version: string;
  tagName: string;
  title: string;
  downloadUrl: string;
  assetName: string;
  assetBytes: number | null;
  buildCode: number | null;
  pageUrl: string;
};

export type ApkDownloadProgress = { receivedBytes: number; totalBytes: number | null };

export function getInstalledAppVersion() {
  return "0.0.0";
}

export function getInstalledBuildCode() {
  return null;
}

export function isReleaseNewer(_releaseVersion?: string, _releaseBuildCode?: number | null) {
  return false;
}

export async function getLatestChatPHTRelease(): Promise<ChatPHTRelease> {
  throw new Error("Cập nhật APK trực tiếp chỉ hỗ trợ trên Android.");
}

export async function downloadReleaseApk(_release: ChatPHTRelease, _onProgress: (progress: ApkDownloadProgress) => void) {
  throw new Error("Cập nhật APK trực tiếp chỉ hỗ trợ trên Android.");
}

export async function openAndroidPackageInstaller(_apkUri: string) {
  throw new Error("Cập nhật APK trực tiếp chỉ hỗ trợ trên Android.");
}
