export type ChatMediaMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "video/mp4"
  | "video/quicktime";

export type ChatMediaAssetLike = {
  uri: string;
  assetId?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  type?: string | null;
};

export type ChatMediaUploadCandidate = {
  id: string;
  uri: string;
  assetId?: string | null;
  fileName: string;
  size: number;
  mimeType: ChatMediaMimeType;
};

type CandidateBuildResult =
  | { ok: true; candidate: ChatMediaUploadCandidate }
  | { ok: false; title: string; message: string };

const SUPPORTED_MIME_TYPES = new Set<ChatMediaMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
]);

export const CHAT_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const CHAT_VIDEO_MAX_BYTES = 1024 * 1024 * 1024;

/**
 * Chuyển metadata từ thư viện hoặc camera thành dữ liệu mà hàng đợi upload riêng tư hiểu được.
 * Hàm không thực hiện I/O để có thể kiểm thử độc lập với thiết bị.
 */
export function buildChatMediaCandidate(
  asset: ChatMediaAssetLike,
  index: number,
  now = Date.now(),
): CandidateBuildResult {
  const isVideo = asset.type === "video";
  const size = asset.fileSize;
  const mimeType = asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg");

  if (!size || size <= 0) {
    return {
      ok: false,
      title: "Không đọc được dung lượng",
      message: "Hãy chọn lại media để ChatPHT kiểm tra giới hạn an toàn.",
    };
  }

  if (!SUPPORTED_MIME_TYPES.has(mimeType as ChatMediaMimeType)) {
    return {
      ok: false,
      title: "Định dạng chưa hỗ trợ",
      message: "Hãy chọn ảnh JPEG/PNG/WEBP/GIF hoặc video MP4/MOV.",
    };
  }

  const maxBytes = isVideo ? CHAT_VIDEO_MAX_BYTES : CHAT_IMAGE_MAX_BYTES;
  if (size > maxBytes) {
    return {
      ok: false,
      title: "Tệp quá lớn",
      message: isVideo ? "Video tối đa 1GB." : "Ảnh tối đa 20 MB.",
    };
  }

  const extension = isVideo ? "mp4" : "jpg";
  return {
    ok: true,
    candidate: {
      id: `media-${now}-${index}`,
      uri: asset.uri,
      assetId: asset.assetId,
      fileName: asset.fileName ?? `chatpht-${now}-${index}.${extension}`,
      size,
      mimeType: mimeType as ChatMediaMimeType,
    },
  };
}
