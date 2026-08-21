export type MediaSaveItem = {
  uri: string;
  type: "image" | "video";
  name?: string | null;
};

export type MediaSaveDependencies = {
  isWeb: boolean;
  cacheDirectory: string | null;
  documentDirectory: string | null;
  requestPermission: () => Promise<{ granted: boolean }>;
  download: (uri: string, destination: string) => Promise<{ uri: string }>;
  saveToLibrary: (uri: string) => Promise<void>;
  now?: () => number;
};

function extensionFor(item: MediaSaveItem) {
  const extension = item.name?.split(".").pop()?.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return extension || (item.type === "video" ? "mp4" : "jpg");
}

export async function saveChatMediaToDevice(item: MediaSaveItem, dependencies: MediaSaveDependencies) {
  if (dependencies.isWeb) return "unsupported" as const;
  const permission = await dependencies.requestPermission();
  if (!permission.granted) return "permission-denied" as const;
  const directory = dependencies.cacheDirectory ?? dependencies.documentDirectory;
  if (!directory) throw new Error("Không tìm thấy bộ nhớ tạm của thiết bị.");
  const destination = `${directory}swiftchat-${(dependencies.now ?? Date.now)()}.${extensionFor(item)}`;
  const file = await dependencies.download(item.uri, destination);
  await dependencies.saveToLibrary(file.uri);
  return "saved" as const;
}
