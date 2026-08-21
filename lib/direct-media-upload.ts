import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

type DirectUploadInput = {
  uri: string;
  uploadUrl: string;
  mimeType: string;
  onProgress?: (percent: number) => void;
};

export async function uploadMediaDirectly({ uri, uploadUrl, mimeType, onProgress }: DirectUploadInput) {
  if (Platform.OS === "web") {
    onProgress?.(0);
    const source = await fetch(uri);
    const blob = await source.blob();
    const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
    if (!response.ok) throw new Error("Không thể tải video lên kho riêng tư.");
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
  if (!response) throw new Error("Không thể tải video lên kho riêng tư.");
  if (response.status < 200 || response.status >= 300) {
    throw new Error("Không thể tải video lên kho riêng tư.");
  }
  onProgress?.(100);
}
