import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";

import { getBuildCodeFromAssetName, isReleaseNewerThanInstalled, parseSemanticVersion } from "@/lib/github-release-version";

const RELEASES_URL = "https://api.github.com/repos/haitruongfla-max/ChatPHT/releases/latest";
const APK_MIME_TYPE = "application/vnd.android.package-archive";

type GithubReleaseApiResponse = {
  tag_name?: unknown;
  name?: unknown;
  html_url?: unknown;
  prerelease?: unknown;
  draft?: unknown;
  assets?: Array<{
    name?: unknown;
    browser_download_url?: unknown;
    content_type?: unknown;
    size?: unknown;
  }>;
};

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

export type ApkDownloadProgress = {
  receivedBytes: number;
  totalBytes: number | null;
};

/** True only when the release semver is strictly newer than the installed app version. */
export function isReleaseNewer(releaseVersion: string, releaseBuildCode?: number | null) {
  return isReleaseNewerThanInstalled({
    releaseVersion,
    releaseBuildCode,
    installedVersion: getInstalledAppVersion(),
    installedBuildCode: getInstalledBuildCode(),
  });
}

export function getInstalledAppVersion() {
  return Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? "0.0.0";
}

export function getInstalledBuildCode() {
  return Constants.nativeBuildVersion ?? null;
}

export async function getLatestChatPHTRelease(): Promise<ChatPHTRelease> {
  const response = await fetch(RELEASES_URL, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`Không thể kiểm tra GitHub Release (HTTP ${response.status}).`);
  const payload = await response.json() as GithubReleaseApiResponse;
  if (payload.draft || payload.prerelease) throw new Error("Bản phát hành mới nhất chưa sẵn sàng để cài đặt.");
  const tagName = typeof payload.tag_name === "string" ? payload.tag_name : "";
  const version = parseSemanticVersion(tagName)?.join(".") ?? "";
  const asset = payload.assets?.find((candidate) => {
    const name = typeof candidate.name === "string" ? candidate.name.toLowerCase() : "";
    const url = typeof candidate.browser_download_url === "string" ? candidate.browser_download_url : "";
    return name.startsWith("chatpht-")
      && name.endsWith(".apk")
      && /^https:\/\/github\.com\/haitruongfla-max\/ChatPHT\/releases\/download\//i.test(url);
  });
  if (!version || !asset || typeof asset.name !== "string" || typeof asset.browser_download_url !== "string") {
    throw new Error("GitHub Release chưa có tệp APK ChatPHT hợp lệ.");
  }
  return {
    version,
    tagName,
    title: typeof payload.name === "string" && payload.name.trim() ? payload.name : tagName,
    downloadUrl: asset.browser_download_url,
    assetName: asset.name,
    assetBytes: typeof asset.size === "number" && asset.size >= 0 ? asset.size : null,
    buildCode: getBuildCodeFromAssetName(asset.name),
    pageUrl: typeof payload.html_url === "string" ? payload.html_url : RELEASES_URL,
  };
}

export async function downloadReleaseApk(release: ChatPHTRelease, onProgress: (progress: ApkDownloadProgress) => void) {
  const directory = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}updates/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}${release.assetName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const task = FileSystem.createDownloadResumable(release.downloadUrl, destination, {}, (event) => {
    onProgress({
      receivedBytes: event.totalBytesWritten,
      totalBytes: event.totalBytesExpectedToWrite > 0 ? event.totalBytesExpectedToWrite : release.assetBytes,
    });
  });
  const result = await task.downloadAsync();
  if (!result?.uri) throw new Error("Tải APK không hoàn tất.");
  const info = await FileSystem.getInfoAsync(result.uri);
  const byteSize = info.exists && "size" in info ? info.size : 0;
  if (!byteSize || byteSize < 1024 * 1024) throw new Error("Tệp APK tải về không hợp lệ. Vui lòng thử lại qua Wi‑Fi hoặc 4G ổn định.");
  return result.uri;
}

/** Opens Android's package installer. Android still requires the user's explicit confirmation. */
export async function openAndroidPackageInstaller(apkUri: string) {
  const contentUri = await FileSystem.getContentUriAsync(apkUri);
  await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
    data: contentUri,
    type: APK_MIME_TYPE,
    flags: 1,
  });
}
