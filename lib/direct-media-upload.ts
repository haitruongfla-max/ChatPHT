import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";

type DirectUploadInput = { uri: string; uploadUrl: string; mimeType: string };

export async function uploadMediaDirectly({ uri, uploadUrl, mimeType }: DirectUploadInput) {
  if (Platform.OS === "web") {
    const source = await fetch(uri);
    const blob = await source.blob();
    const response = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: blob });
    if (!response.ok) throw new Error("Không thể tải video lên kho riêng tư.");
    return;
  }

  const response = await FileSystem.uploadAsync(uploadUrl, uri, {
    httpMethod: "PUT",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { "Content-Type": mimeType },
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error("Không thể tải video lên kho riêng tư.");
  }
}
