import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { Platform } from "react-native";

type DirectUploadInput = {
  uri: string;
  uploadUrl: string;
  mimeType: string;
  onProgress?: (percent: number) => void;
};

/**
 * Converts library-provider URIs into files that Expo FileSystem can upload.
 * iOS may provide a ph:// URI and Android may provide a content:// URI; neither
 * is reliable as a direct PUT body across all device/library combinations.
 */
export async function resolveMediaUploadUri(uri: string, assetId?: string | null): Promise<string> {
  if (Platform.OS === "web") return uri;

  let uploadUri = uri;
  if (Platform.OS === "ios" && uri.startsWith("ph://") && assetId) {
    try {
      const assetInfo = await MediaLibrary.getAssetInfoAsync(assetId);
      uploadUri = assetInfo.localUri ?? assetInfo.uri;
    } catch {
      // Preserve the picker URI as a fallback for environments that already expose it as a file.
    }
  }

  if (!uploadUri.startsWith("content://")) return uploadUri;

  const cacheDirectory = FileSystem.cacheDirectory;
  if (!cacheDirectory) throw new Error("Thiết bị không cung cấp vùng tạm để chuẩn bị tệp tải lên.");
  const destination = `${cacheDirectory}chatpht-upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await FileSystem.copyAsync({ from: uploadUri, to: destination });
  return destination;
}

export async function uploadMediaDirectly({ uri, uploadUrl, mimeType, onProgress }: DirectUploadInput) {
  if (Platform.OS === "web") {
    onProgress?.(0);
    const source = await fetch(uri);
    const blob = await source.blob();
    const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
    if (!response.ok) throw new Error(`Không thể tải tệp lên kho riêng tư (mã ${response.status}).`);
    onProgress?.(100);
    return;
  }

  const task = FileSystem.createUploadTask(uploadUrl, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": mimeType },
  }, (progress) => {
    if (!progress.totalBytesExpectedToSend) return;
    onProgress?.(Math.min(100, Math.round((progress.totalBytesSent / progress.totalBytesExpectedToSend) * 100)));
  });
  const response = await task.uploadAsync();
  if (!response) throw new Error("Không nhận được phản hồi khi tải tệp lên kho riêng tư.");
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Không thể tải tệp lên kho riêng tư (mã ${response.status}).`);
  }
  onProgress?.(100);
}
