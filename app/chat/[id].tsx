import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import {
  ChatMediaPreview,
  ChatMediaViewer,
} from "@/components/chat-media-viewer";
import { ChatMediaGrid } from "@/components/chat-media-grid";
import {
  ChatCameraCapture,
  type CapturedChatMedia,
} from "@/components/chat-camera-capture";
import {
  buildChatMediaCandidate,
  type ChatMediaUploadCandidate,
} from "@/lib/chat-media-candidates";
import {
  resolveMediaUploadUri,
  uploadMediaDirectly,
} from "@/lib/direct-media-upload";
import { runMediaUploadQueue } from "@/lib/media-upload-queue";
import { preserveStableMediaUrl } from "@/lib/stable-media-url";
import { subscribeToConversationBackground } from "@/lib/conversation-background-realtime.native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ChatMessage = {
  id: number;
  senderId: number;
  body: string | null;
  contentType: "text" | "image" | "video" | "screen_share_invite";
  mediaUrl: string | null;
  mediaCacheKey: string | null;
  mediaName: string | null;
  mediaBatchId: string | null;
  replyToMessageId: number | null;
  replyTo: { id: number; senderId: number; body: string | null; contentType: "text" | "image" | "video" | "screen_share_invite"; mediaName: string | null; recalledAt: Date | null } | null;
  mediaCleanedAt: Date | null;
  recalledAt: Date | null;
  recalledBy: number | null;
  createdAt: Date;
  reactions: { emoji: string; userId: number }[];
  recipientDeliveredAt: Date | null;
  recipientReadAt: Date | null;
};

type TimelineMessage = ChatMessage & { albumItems?: ChatMessage[] };

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

function VideoBubble({ uri, onOpen }: { uri: string; onOpen: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      style={styles.videoFrame}
      accessibilityRole="button"
      accessibilityLabel="Mở video toàn màn hình"
    >
      <View style={styles.videoPreview}>
        <View style={styles.videoIcon}>
          <MaterialIcons name="play-arrow" size={30} color="#FFFFFF" />
        </View>
        <Text style={styles.videoPreviewText}>Chạm để xem video</Text>
      </View>
    </Pressable>
  );
}

function relativeTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function MessageTime({ item, mine }: { item: ChatMessage; mine: boolean }) {
  const createdAt = new Date(item.createdAt).getTime();
  const deliveryState =
    item.recipientReadAt &&
    new Date(item.recipientReadAt).getTime() >= createdAt
      ? `Đã đọc lúc ${readTime(item.recipientReadAt)}`
      : item.recipientDeliveredAt &&
          new Date(item.recipientDeliveredAt).getTime() >= createdAt
        ? "Đã nhận"
        : "Đã gửi";

  return (
    <View style={styles.messageMeta}>
      <Text style={[styles.messageTime, mine && styles.mineTime]}>
        {relativeTime(item.createdAt)}
      </Text>
      {mine ? <Text style={styles.deliveryState}>{deliveryState}</Text> : null}
    </View>
  );
}

export default function ChatScreen() {
  const { user, loading } = useAuth();
  const userId = user?.id;
  const routeParams = useLocalSearchParams<{ id: string; group?: string }>();
  const rawId = routeParams.id;
  const conversationId = Number(rawId);
  const isGroup = routeParams.group === "1";
  const listRef = useRef<FlatList<TimelineMessage>>(null);
  const lastTypingHeartbeatAt = useRef(0);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState("Đang tải lên");
  const [wallpaperProgress, setWallpaperProgress] = useState<number | null>(null);
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(
    null,
  );
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedMedia, setCapturedMedia] = useState<CapturedChatMedia | null>(null);
  const [captureCaption, setCaptureCaption] = useState("");
  const [sendingCapturedMedia, setSendingCapturedMedia] = useState(false);
  const [preview, setPreview] = useState<ChatMediaPreview | null>(null);
  const [previewItems, setPreviewItems] = useState<ChatMediaPreview[]>([]);
  const openMediaPreview = (entries: ChatMessage[], selectedId: number) => {
    const media = entries.flatMap((entry) => {
      if (!entry.mediaUrl || (entry.contentType !== "image" && entry.contentType !== "video")) return [];
      return [{
        id: entry.id,
        uri: entry.mediaUrl,
        type: entry.contentType,
        name: entry.mediaName,
        cacheKey: entry.mediaCacheKey,
      } satisfies ChatMediaPreview];
    });
    if (!media.length) return;
    setPreviewItems(media);
    setPreview(media.find((entry) => entry.id === selectedId) ?? media[0]);
  };
  const utils = trpc.useUtils();
  const messages = trpc.messages.list.useQuery(
    { conversationId },
    {
      enabled: Boolean(user) && Number.isInteger(conversationId),
      refetchInterval: 1000,
    },
  );
  const typingStatus = trpc.messages.typingStatus.useQuery(
    { conversationId },
    {
      enabled: Boolean(user) && Number.isInteger(conversationId),
      refetchInterval: 650,
    },
  );
  const wallpaper = trpc.conversations.wallpaper.useQuery(
    { conversationId },
    { enabled: Boolean(user) && Number.isInteger(conversationId) },
  );
  useEffect(() => {
    if (!user || !Number.isInteger(conversationId)) return;
    return subscribeToConversationBackground(conversationId, () => {
      void utils.conversations.wallpaper.invalidate({ conversationId });
    });
  }, [conversationId, user, utils]);
  const groupDetails = trpc.conversations.groupDetails.useQuery(
    { conversationId },
    { enabled: Boolean(user) && isGroup && Number.isInteger(conversationId), refetchInterval: 3000 },
  );
  const groupMembers = trpc.conversations.groupMembers.useQuery(
    { conversationId },
    { enabled: Boolean(user) && isGroup && Number.isInteger(conversationId) },
  );
  const messageCount = messages.data?.length ?? 0;
  const stableMediaUrls = useRef(new Map<string, string>());
  const sendText = trpc.messages.sendText.useMutation();
  const requestMediaUpload = trpc.messages.requestMediaUpload.useMutation();
  const preflightMediaUpload = trpc.messages.preflightMediaUpload.useMutation();
  const completeMediaUpload = trpc.messages.completeMediaUpload.useMutation();
  const toggleReaction = trpc.messages.toggleReaction.useMutation();
  const { mutateAsync: markRead } = trpc.messages.markRead.useMutation();
  const { mutateAsync: setTyping } = trpc.messages.setTyping.useMutation();
  const recall = trpc.messages.recall.useMutation();
  const removeConversation = trpc.conversations.clearForSelfAndExitInbox.useMutation();
  const clearConversation = trpc.conversations.clearContent.useMutation();
  const requestWallpaperUpload = trpc.conversations.requestWallpaperUpload.useMutation();
  const setWallpaper = trpc.conversations.setWallpaper.useMutation();
  const pinGroupMessage = trpc.conversations.pinGroupMessage.useMutation();
  const group = groupDetails.data;
  const isGroupAdmin = Boolean(
    groupMembers.data?.some((member) => member.id === userId && (member.groupRole === "owner" || member.groupRole === "admin")),
  );
  const header = useMemo(
    () => ({
      title: isGroup ? group?.title ?? "Nhóm chat" : "Hội thoại riêng tư",
      subtitle: isGroup
        ? group ? `${group.memberCount} thành viên · Chỉ thành viên có thể xem tin nhắn` : "Đang tải thông tin nhóm"
        : "Chỉ thành viên có thể xem tin nhắn",
    }),
    [group, isGroup],
  );
  const timeline = useMemo<TimelineMessage[]>(() => {
    const sourceMessages = ((messages.data ?? []) as ChatMessage[]).map((message) =>
      preserveStableMediaUrl(stableMediaUrls.current, message),
    );
    const renderedBatches = new Set<string>();
    const messageItems = sourceMessages.flatMap((message) => {
      if (!message.mediaBatchId) return [{ ...message, entryType: "message" as const }];
      if (renderedBatches.has(message.mediaBatchId)) return [];
      renderedBatches.add(message.mediaBatchId);
      const albumItems = sourceMessages.filter((candidate) => candidate.mediaBatchId === message.mediaBatchId);
      return [{ ...message, albumItems, entryType: "message" as const }];
    });
    return messageItems;
  }, [messages.data]);
  const pinnedMessage = useMemo(
    () => group?.pinnedMessageId
      ? ((messages.data ?? []) as ChatMessage[]).find((message) => message.id === group.pinnedMessageId) ?? null
      : null,
    [group?.pinnedMessageId, messages.data],
  );
  const mentionQuery = useMemo(() => {
    if (!isGroup) return null;
    const match = draft.match(/(?:^|\s)@([^\s@]*)$/);
    return match ? match[1].toLocaleLowerCase("vi-VN") : null;
  }, [draft, isGroup]);
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    return (groupMembers.data ?? []).filter((member) =>
      member.id !== userId && (member.username.toLocaleLowerCase("vi-VN").includes(mentionQuery) || member.displayName.toLocaleLowerCase("vi-VN").includes(mentionQuery)),
    ).slice(0, 5);
  }, [groupMembers.data, mentionQuery, userId]);

  useEffect(() => {
    if (timeline.length)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 20);
  }, [timeline.length]);

  useEffect(() => {
    if (!userId || messageCount === 0 || !Number.isInteger(conversationId))
      return;
    void markRead({ conversationId })
      .then(() => utils.messages.list.invalidate({ conversationId }))
      .catch(() => undefined);
  }, [conversationId, markRead, messageCount, userId, utils.messages.list]);

  if (loading)
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color="#2563EB" />
      </SafeAreaView>
    );
  if (!user) return <Redirect href={"/login" as never} />;
  if (!Number.isInteger(conversationId) || conversationId <= 0)
    return <Redirect href={"/(tabs)"} />;

  const refresh = () => {
    void utils.messages.list.invalidate({ conversationId });
    void utils.conversations.list.invalidate();
    if (isGroup) {
      void utils.conversations.groupDetails.invalidate({ conversationId });
      void utils.conversations.groupMembers.invalidate({ conversationId });
    }
  };
  const pinMessage = async (messageId: number | null) => {
    if (!isGroup || !isGroupAdmin || pinGroupMessage.isPending) return;
    try {
      await pinGroupMessage.mutateAsync({ conversationId, messageId });
      void utils.conversations.groupDetails.invalidate({ conversationId });
    } catch (error) {
      Alert.alert("Không thể ghim tin nhắn", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };
  const openMessageActions = (item: TimelineMessage, mine: boolean) => {
    if (item.recalledAt) return;
    const isPinned = group?.pinnedMessageId === item.id;
    const actions: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [
      { text: "Trả lời", onPress: () => setReplyTarget(item) },
    ];
    if (isGroup && isGroupAdmin) actions.push({ text: isPinned ? "Bỏ ghim" : "Ghim tin nhắn", onPress: () => void pinMessage(isPinned ? null : item.id) });
    if (mine) actions.push({ text: "Thu hồi", style: "destructive", onPress: () => confirmRecall(item) });
    actions.push({ text: "Hủy", style: "cancel" });
    Alert.alert("Tùy chọn tin nhắn", isGroup && isGroupAdmin ? "Quản trị viên có thể ghim tin nhắn quan trọng cho cả nhóm." : "Bạn có thể trả lời trực tiếp tin nhắn này.", actions);
  };
  const send = async () => {
    const body = draft.trim();
    if (!body || sendText.isPending || uploading) return;
    setDraft("");
    void setTyping({ conversationId, isTyping: false }).catch(() => undefined);
    try {
      await sendText.mutateAsync({ conversationId, body, replyToMessageId: replyTarget?.id ?? null });
      setReplyTarget(null);
      refresh();
    } catch (error) {
      setDraft(body);
      Alert.alert(
        "Không gửi được tin",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  };

  const changeDraft = (value: string) => {
    setDraft(value);
    const now = Date.now();
    const isTyping = value.trim().length > 0;
    const dueForHeartbeat = now - lastTypingHeartbeatAt.current >= 1200;
    if (!isTyping || dueForHeartbeat) {
      lastTypingHeartbeatAt.current = now;
      void setTyping({ conversationId, isTyping }).catch(() => undefined);
    }
  };
  const chooseMention = (member: NonNullable<typeof groupMembers.data>[number]) => {
    changeDraft(draft.replace(/(^|\s)@[^\s@]*$/, `$1@${member.username} `));
  };

  const chooseWallpaper = async () => {
    if (wallpaperProgress !== null || requestWallpaperUpload.isPending || setWallpaper.isPending) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Cần quyền thư viện ảnh", "Hãy cho phép ChatPHT truy cập ảnh để đặt nền chung cho cuộc trò chuyện.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [9, 16],
      quality: 0.82,
      selectionLimit: 1,
    });
    if (picked.canceled || !picked.assets[0]) return;
    try {
      setWallpaperProgress(0);
      const asset = picked.assets[0];
      const sourceUri = await resolveMediaUploadUri(asset.uri, asset.assetId);
      const context = ImageManipulator.manipulate(sourceUri);
      context.resize({ width: 1440 });
      const rendered = await context.renderAsync();
      const normalized = await rendered.saveAsync({ compress: 0.72, format: SaveFormat.JPEG });
      const info = await FileSystem.getInfoAsync(normalized.uri);
      const size = info.exists && "size" in info && typeof info.size === "number" ? info.size : 0;
      if (!size) throw new Error("Không thể chuẩn bị ảnh nền từ thư viện.");
      if (size > 6 * 1024 * 1024) throw new Error("Ảnh nền sau khi tối ưu vẫn vượt quá 6 MB.");
      const upload = await requestWallpaperUpload.mutateAsync({ conversationId, mimeType: "image/jpeg", size });
      if (upload.nearQuota) {
        Alert.alert("Kho gần đầy", "Ảnh nền này được tính vào quota 200GB. Hệ thống sẽ tự dọn media tin nhắn cũ nhất theo chính sách hiện có khi cần.");
      }
      await uploadMediaDirectly({
        uri: normalized.uri,
        uploadUrl: upload.uploadUrl,
        mimeType: "image/jpeg",
        onProgress: setWallpaperProgress,
      });
      await setWallpaper.mutateAsync({ conversationId, wallpaperKey: upload.key, size });
      await utils.conversations.wallpaper.invalidate({ conversationId });
    } catch (error) {
      Alert.alert("Không thể đặt ảnh nền", error instanceof Error ? error.message : "Vui lòng chọn ảnh khác và thử lại.");
    } finally {
      setWallpaperProgress(null);
    }
  };

  const clearWallpaper = async () => {
    try {
      await setWallpaper.mutateAsync({ conversationId, wallpaperKey: null });
      await utils.conversations.wallpaper.invalidate({ conversationId });
    } catch (error) {
      Alert.alert("Không thể xóa ảnh nền", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };

  const openWallpaperMenu = () =>
    Alert.alert(
      "Ảnh nền cuộc trò chuyện",
      "Ảnh nền này hiển thị chung cho mọi thành viên trong cuộc trò chuyện và được tính vào quota lưu trữ chung.",
      [
        { text: "Hủy", style: "cancel" },
        ...(wallpaper.data?.url ? [{ text: "Xóa ảnh nền", style: "destructive" as const, onPress: () => void clearWallpaper() }] : []),
        { text: "Chọn ảnh từ thư viện", onPress: () => void chooseWallpaper() },
      ],
    );

  const uploadCandidates = async (candidates: ChatMediaUploadCandidate[]) => {
    if (!candidates.length || uploading) return false;
    setUploading(true);
    setUploadProgress(0);
    setUploadLabel(`Đang gửi 0/${candidates.length}...`);
    try {
      const preflight = await preflightMediaUpload.mutateAsync({
        conversationId,
        totalBytes: candidates.reduce((total, item) => total + item.size, 0),
        fileCount: candidates.length,
      });
      if (preflight.nearQuota) {
        Alert.alert("Kho gần đầy", "Kho gần đầy, sẽ tự dọn ảnh cũ nhất.");
      }
      const mediaBatchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 16)}`;
      await runMediaUploadQueue(
        candidates,
        async (candidate, onProgress) => {
          const uploadUri = await resolveMediaUploadUri(candidate.uri, candidate.assetId);
          const prepared = await requestMediaUpload.mutateAsync({
            conversationId,
            filename: candidate.fileName,
            mimeType: candidate.mimeType,
            size: candidate.size,
          });
          await uploadMediaDirectly({
            uri: uploadUri,
            uploadUrl: prepared.uploadUrl,
            mimeType: candidate.mimeType,
            onProgress,
          });
          await completeMediaUpload.mutateAsync({
            conversationId,
            key: prepared.key,
            filename: prepared.filename,
            mimeType: candidate.mimeType,
            size: candidate.size,
            mediaBatchId,
          });
        },
        ({ completed, total, percent }) => {
          setUploadProgress(percent);
          setUploadLabel(completed === total ? "Đang hoàn tất tin nhắn..." : `Đang gửi ${completed}/${total}...`);
        },
        3,
      );
      await utils.messages.list.invalidate({ conversationId });
      void utils.conversations.list.invalidate();
      return true;
    } catch (error) {
      Alert.alert(
        "Không tải được tệp",
        error instanceof Error ? error.message : "Vui lòng thử lại bằng tệp nhỏ hơn.",
      );
      return false;
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setUploadLabel("Đang tải lên");
    }
  };

  const validateMediaAssets = (
    assets: {
      uri: string;
      assetId?: string | null;
      fileName?: string | null;
      fileSize?: number | null;
      mimeType?: string | null;
      type?: string | null;
    }[],
  ) => {
    const candidates: ChatMediaUploadCandidate[] = [];
    const now = Date.now();
    for (const [index, asset] of assets.entries()) {
      const result = buildChatMediaCandidate(asset, index, now);
      if (!result.ok) {
        Alert.alert(result.title, result.message);
        return null;
      }
      candidates.push(result.candidate);
    }
    return candidates;
  };

  const canStartMediaUpload = () => {
    if (uploading) return false;
    if (!replyTarget) return true;
    Alert.alert("Đang trả lời tin nhắn", "Hãy gửi nội dung chữ cho phản hồi này hoặc bấm dấu X để bỏ trạng thái trả lời trước khi gửi media.");
    return false;
  };

  const chooseMedia = async () => {
    if (!canStartMediaUpload()) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Cần quyền thư viện", "Hãy cho phép ChatPHT truy cập thư viện ảnh và video để gửi tệp.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 50,
      allowsEditing: false,
      quality: 1,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    const candidates = validateMediaAssets(picked.assets.slice(0, 50));
    if (candidates) await uploadCandidates(candidates);
  };

  const uploadCapturedMedia = async ({ uri, type }: CapturedChatMedia) => {
    try {
      let preparedUri = uri;
      let mimeType: "image/jpeg" | "video/mp4" = type === "video" ? "video/mp4" : "image/jpeg";
      if (type === "image") {
        const context = ImageManipulator.manipulate(uri);
        context.resize({ width: 1920 });
        const rendered = await context.renderAsync();
        const normalized = await rendered.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
        preparedUri = normalized.uri;
      }
      const info = await FileSystem.getInfoAsync(preparedUri);
      const fileSize = info.exists && "size" in info && typeof info.size === "number" ? info.size : 0;
      const candidates = validateMediaAssets([{
        uri: preparedUri,
        type,
        fileSize,
        mimeType,
        fileName: `chatpht-${type === "video" ? "video" : "photo"}-${Date.now()}.${type === "video" ? "mp4" : "jpg"}`,
      }]);
      return candidates ? await uploadCandidates(candidates) : false;
    } catch (error) {
      Alert.alert("Không thể chuẩn bị media", error instanceof Error ? error.message : "Vui lòng thử lại.");
      return false;
    }
  };

  const handleCapturedMedia = (media: CapturedChatMedia) => {
    setCameraOpen(false);
    setCaptureCaption("");
    setCapturedMedia(media);
  };

  const retakeCapturedMedia = () => {
    if (sendingCapturedMedia) return;
    setCapturedMedia(null);
    setCaptureCaption("");
    setCameraOpen(true);
  };

  const sendCapturedMedia = async () => {
    if (!capturedMedia || sendingCapturedMedia) return;
    setSendingCapturedMedia(true);
    const caption = captureCaption.trim();
    try {
      const mediaSent = await uploadCapturedMedia(capturedMedia);
      if (!mediaSent) return;
      if (caption) {
        await sendText.mutateAsync({ conversationId, body: caption, replyToMessageId: null });
        await utils.messages.list.invalidate({ conversationId });
      }
      setCapturedMedia(null);
      setCaptureCaption("");
    } catch (error) {
      Alert.alert("Đã gửi media nhưng chưa gửi được chú thích", error instanceof Error ? error.message : "Vui lòng gửi lại chú thích.");
    } finally {
      setSendingCapturedMedia(false);
    }
  };

  const openCamera = () => {
    if (!canStartMediaUpload()) return;
    setCameraOpen(true);
  };

  const remove = async () => {
    try {
      await removeConversation.mutateAsync({ conversationId });
      await utils.conversations.list.invalidate();
      router.replace("/(tabs)" as never);
    } catch (error) {
      Alert.alert(
        "Không thể xóa hội thoại",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  };

  const confirmRemove = () =>
    Alert.alert(
      "Xóa lịch sử và rời hộp thư?",
      "Tin nhắn, ảnh và video hiện có sẽ chỉ bị xóa khỏi hộp thư của bạn. Người kia vẫn giữ dữ liệu của họ. Khi có tin nhắn mới, cuộc trò chuyện sẽ hiện lại nhưng không hiển thị nội dung cũ.",
      [
        { text: "Hủy", style: "cancel" },
        { text: "Xóa và rời", style: "destructive", onPress: () => void remove() },
      ],
    );

  const clearContent = async () => {
    try {
      await clearConversation.mutateAsync({ conversationId });
      refresh();
    } catch (error) {
      Alert.alert(
        "Không thể xóa sạch",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  };

  const confirmClearContent = () =>
    Alert.alert(
      "Xóa sạch toàn bộ nội dung?",
      "Tin nhắn, ảnh và video sẽ bị xóa vĩnh viễn cho cả hai người. Thao tác này không thể hoàn tác.",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Xóa sạch",
          style: "destructive",
          onPress: () => void clearContent(),
        },
      ],
    );

  const openConversationMenu = () => {
    const actions: { text: string; style?: "cancel" | "destructive"; onPress?: () => void }[] = [
      { text: "Hủy", style: "cancel" },
      { text: "Ảnh nền cuộc trò chuyện", onPress: openWallpaperMenu },
    ];
    if (isGroup) {
      actions.push({ text: "Thông tin và quản trị nhóm", onPress: () => router.push(`/group/${conversationId}` as never) });
    } else {
      actions.push(
        { text: "Xóa lịch sử và rời hộp thư", style: "destructive", onPress: () => void confirmRemove() },
        { text: "Xóa sạch toàn bộ nội dung", style: "destructive", onPress: () => void confirmClearContent() },
      );
    }
    Alert.alert("Tùy chọn hội thoại", "Các thay đổi ảnh nền được đồng bộ cho mọi thành viên.", actions);
  };

  const confirmRecall = (item: ChatMessage) =>
    Alert.alert(
      "Thu hồi tin nhắn?",
      "Nội dung sẽ bị gỡ cho tất cả thành viên trong hội thoại.",
      [
        { text: "Hủy", style: "cancel" },
        {
          text: "Thu hồi",
          style: "destructive",
          onPress: () =>
            void recall
              .mutateAsync({ messageId: item.id })
              .then(refresh)
              .catch((error) =>
                Alert.alert(
                  "Không thể thu hồi",
                  error instanceof Error ? error.message : "Vui lòng thử lại.",
                ),
              ),
        },
      ],
    );

  const reactToMessage = async (
    messageId: number,
    emoji: (typeof REACTION_EMOJIS)[number],
  ) => {
    if (toggleReaction.isPending) return;
    setReactionPickerFor(null);
    try {
      await toggleReaction.mutateAsync({ messageId, emoji });
      await utils.messages.list.invalidate({ conversationId });
    } catch (error) {
      Alert.alert(
        "Không thể thả cảm xúc",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  };

  return (
    <SafeAreaView
      style={styles.safe}
      edges={["top", "bottom", "left", "right"]}
    >
      {wallpaper.data?.url ? (
        <Image
          source={{ uri: wallpaper.data.url }}
          contentFit="cover"
          transition={180}
          style={styles.wallpaper}
        />
      ) : null}
      {wallpaper.data?.url ? <View style={styles.wallpaperTint} /> : null}
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}
          >
            <MaterialIcons name="arrow-back" size={22} color="#172554" />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{header.title}</Text>
            <Text style={styles.headerSubtitle}>
              {wallpaperProgress !== null ? `Đang tải ảnh nền ${wallpaperProgress}%` : header.subtitle}
            </Text>
          </View>
          <Pressable
            onPress={openConversationMenu}
            style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Thêm tùy chọn hội thoại"
          >
            <MaterialIcons name="more-vert" size={22} color="#2563EB" />
          </Pressable>
        </View>
        {isGroup && group?.pinnedMessageId ? (
          <View style={styles.pinnedBanner} accessibilityLabel="Tin nhắn đã ghim trong nhóm">
            <MaterialIcons name="push-pin" size={16} color="#1D4ED8" />
            <Text numberOfLines={1} style={styles.pinnedText}>
              {pinnedMessage?.body?.trim() || "Đã ghim một tin nhắn trong nhóm"}
            </Text>
          </View>
        ) : null}
        <FlatList
          ref={listRef}
          data={timeline}
          keyExtractor={(item) => `message-${item.id}`}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: false })
          }
          renderItem={({ item }) => {
            const mine = item.senderId === user.id;
            const groupedReactions = item.reactions.reduce<
              Record<string, { count: number; mine: boolean }>
            >((accumulator, reaction) => {
              const value = accumulator[reaction.emoji] ?? {
                count: 0,
                mine: false,
              };
              value.count += 1;
              value.mine = value.mine || reaction.userId === user.id;
              accumulator[reaction.emoji] = value;
              return accumulator;
            }, {});
            return (
              <View
                style={[
                  styles.messageRow,
                  mine ? styles.mineRow : styles.theirRow,
                ]}
              >
                <View style={styles.messageStack}>
                  <Pressable
                    onLongPress={!item.recalledAt ? () => openMessageActions(item, mine) : undefined}
                    delayLongPress={750}
                    style={[
                      styles.bubble,
                      mine ? styles.mineBubble : styles.theirBubble,
                    ]}
                  >
                    {item.recalledAt ? (
                      <View style={styles.recalled}>
                        <MaterialIcons
                          name="undo"
                          size={15}
                          color={mine ? "#D9E5FF" : "#64748B"}
                        />
                        <Text
                          style={[
                            styles.recalledText,
                            mine && styles.mineRecalledText,
                          ]}
                        >
                          Bạn đã thu hồi tin nhắn
                        </Text>
                      </View>
                    ) : (
                      <>
                        {item.replyTo ? (
                          <View style={[styles.replyPreview, mine && styles.mineReplyPreview]}>
                            <MaterialIcons name="reply" size={14} color={mine ? "#D9E5FF" : "#4B6584"} />
                            <Text numberOfLines={2} style={[styles.replyPreviewText, mine && styles.mineReplyPreviewText]}>
                              {item.replyTo.recalledAt ? "Tin nhắn đã được thu hồi" : item.replyTo.body?.trim() || (item.replyTo.contentType === "video" ? "Video" : "Ảnh")}
                            </Text>
                          </View>
                        ) : null}
                        {item.albumItems && item.albumItems.length > 1 ? (
                          <ChatMediaGrid
                              items={item.albumItems.filter((albumItem): albumItem is ChatMessage & { contentType: "text" | "image" | "video" } => albumItem.contentType !== "screen_share_invite")}
                            onOpen={(media) => openMediaPreview(item.albumItems ?? [], media.id)}
                          />
                        ) : null}
                        {(!item.albumItems || item.albumItems.length === 1) && item.contentType === "image" && item.mediaUrl ? (
                          <Pressable
                            onPress={() => openMediaPreview([item], item.id)}
                            accessibilityRole="button"
                            accessibilityLabel="Mở ảnh toàn màn hình"
                          >
                            <Image
                              source={{
                                uri: item.mediaUrl,
                                cacheKey:
                                  item.mediaCacheKey ?? `chat-media-${item.id}`,
                              }}
                              cachePolicy="memory-disk"
                              style={styles.image}
                              contentFit="cover"
                      transition={0}
                            />
                          </Pressable>
                        ) : null}
                        {(!item.albumItems || item.albumItems.length === 1) && item.contentType === "video" && item.mediaUrl ? (
                          <VideoBubble
                            uri={item.mediaUrl}
                            onOpen={() => openMediaPreview([item], item.id)}
                          />
                        ) : null}
                        {item.contentType === "screen_share_invite" ? (
                          <View style={[styles.screenShareInvite, mine && styles.mineScreenShareInvite]}>
                            <View style={[styles.screenShareInviteIcon, mine && styles.mineScreenShareInviteIcon]}>
                              <MaterialIcons name="info-outline" size={22} color={mine ? "#DBEAFE" : "#1D4ED8"} />
                            </View>
                            <View style={styles.screenShareInviteContent}>
                              <Text style={[styles.screenShareInviteTitle, mine && styles.mineScreenShareInviteTitle]}>Thông báo hệ thống cũ</Text>
                              <Text style={[styles.screenShareInviteDetail, mine && styles.mineScreenShareInviteDetail]}>Mục này không còn được hỗ trợ trong phiên bản hiện tại.</Text>
                            </View>
                          </View>
                        ) : null}
                        {item.mediaCleanedAt ? <View style={[styles.mediaCleaned, mine && styles.mineMediaCleaned]}><MaterialIcons name="auto-delete" size={16} color={mine ? "#D9E5FF" : "#64748B"} /><Text style={[styles.mediaCleanedText, mine && styles.mineMediaCleanedText]}>File đã được tự động dọn dẹp để tiết kiệm dung lượng</Text></View> : null}
                        {item.body && item.contentType !== "screen_share_invite" ? (
                          <Text
                            selectable
                            accessibilityHint="Nhấn giữ nội dung để chọn hoặc sao chép văn bản"
                            style={[
                              styles.messageText,
                              mine && styles.mineText,
                            ]}
                          >
                            {item.body}
                          </Text>
                        ) : null}
                      </>
                    )}
                    <MessageTime item={item} mine={mine} />
                  </Pressable>
                  {!item.recalledAt ? (
                    <View
                      style={[
                        styles.reactionRow,
                        mine ? styles.mineReactionRow : styles.theirReactionRow,
                      ]}
                    >
                      {Object.entries(groupedReactions).map(
                        ([emoji, value]) => (
                          <Pressable
                            key={emoji}
                            onPress={() =>
                              void reactToMessage(
                                item.id,
                                emoji as (typeof REACTION_EMOJIS)[number],
                              )
                            }
                            style={({ pressed }) => [
                              styles.reactionBadge,
                              value.mine && styles.reactionBadgeMine,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={styles.reactionBadgeText}>
                              {emoji} {value.count}
                            </Text>
                          </Pressable>
                        ),
                      )}
                      <Pressable
                        onPress={() =>
                          setReactionPickerFor(
                            reactionPickerFor === item.id ? null : item.id,
                          )
                        }
                        style={({ pressed }) => [
                          styles.reactionAdd,
                          pressed && styles.pressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel="Thả cảm xúc"
                      >
                        <MaterialIcons
                          name="add-reaction"
                          size={16}
                          color="#64748B"
                        />
                      </Pressable>
                    </View>
                  ) : null}
                  {reactionPickerFor === item.id ? (
                    <View
                      style={[
                        styles.reactionPicker,
                        mine
                          ? styles.mineReactionPicker
                          : styles.theirReactionPicker,
                      ]}
                    >
                      {REACTION_EMOJIS.map((emoji) => (
                        <Pressable
                          key={emoji}
                          onPress={() => void reactToMessage(item.id, emoji)}
                          style={({ pressed }) => [
                            styles.reactionOption,
                            pressed && styles.pressed,
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Thả cảm xúc ${emoji}`}
                        >
                          <Text style={styles.reactionOptionText}>{emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name="lock" size={26} color="#2563EB" />
              </View>
              <Text style={styles.emptyTitle}>Không có tin nhắn nào</Text>
              <Text style={styles.emptyText}>
                Bắt đầu cuộc trò chuyện riêng tư của bạn.
              </Text>
            </View>
          }
        />
        {typingStatus.data?.isTyping ? (
          <View style={styles.typingStatus} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.typingText}>Người kia đang nhập tin nhắn...</Text>
          </View>
        ) : null}
        <View style={styles.composer}>
          {uploading && uploadProgress !== null ? (
            <View style={styles.uploadStatus} accessibilityLiveRegion="polite">
              <View style={styles.uploadLabelRow}>
                <Text style={styles.uploadLabel}>{uploadLabel}</Text>
                <Text style={styles.uploadPercent}>{uploadProgress}%</Text>
              </View>
              <View style={styles.uploadTrack}>
                <View
                  style={[styles.uploadFill, { width: `${uploadProgress}%` }]}
                />
              </View>
            </View>
          ) : null}
          {replyTarget ? (
            <View style={styles.replyComposer} accessibilityLabel="Đang trả lời tin nhắn">
              <MaterialIcons name="reply" size={18} color="#2563EB" />
              <View style={styles.replyComposerText}>
                <Text style={styles.replyComposerLabel}>Đang trả lời</Text>
                <Text numberOfLines={1} style={styles.replyComposerBody}>{replyTarget.body?.trim() || (replyTarget.contentType === "video" ? "Video" : "Ảnh")}</Text>
              </View>
              <Pressable onPress={() => setReplyTarget(null)} style={({ pressed }) => [styles.replyDismiss, pressed && styles.pressed]} accessibilityLabel="Bỏ trả lời">
                <MaterialIcons name="close" size={19} color="#5D789A" />
              </Pressable>
            </View>
          ) : null}
          {mentionCandidates.length ? (
            <View style={styles.mentionSuggestions} accessibilityLabel="Gợi ý nhắc tên thành viên">
              {mentionCandidates.map((member) => (
                <Pressable key={member.id} onPress={() => chooseMention(member)} style={({ pressed }) => [styles.mentionRow, pressed && styles.pressed]}>
                  <MaterialIcons name="alternate-email" size={17} color="#2563EB" />
                  <Text numberOfLines={1} style={styles.mentionText}>{member.displayName} <Text style={styles.mentionUsername}>@{member.username}</Text></Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={styles.composerRow}>
            <Pressable
              disabled={uploading}
              onPress={openCamera}
              style={({ pressed }) => [
                styles.cameraButton,
                (pressed || uploading) && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Mở camera: chạm để chụp ảnh, giữ để quay video"
            >
              <MaterialIcons name="photo-camera" size={22} color="#2563EB" />
            </Pressable>
            <Pressable
              disabled={uploading}
              onPress={() => void chooseMedia()}
              style={({ pressed }) => [
                styles.attach,
                (pressed || uploading) && styles.pressed,
              ]}
            >
              {uploading ? (
                <ActivityIndicator color="#2563EB" size="small" />
              ) : (
                <MaterialIcons name="attach-file" size={23} color="#2563EB" />
              )}
            </Pressable>
            <TextInput
              value={draft}
              onChangeText={changeDraft}
              placeholder="Viết tin nhắn..."
              placeholderTextColor="#8A96A8"
              style={styles.input}
              multiline
              maxLength={2000}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
              blurOnSubmit={false}
              contextMenuHidden={false}
              selectionColor="#2563EB"
              accessibilityLabel="Nội dung tin nhắn"
              accessibilityHint="Nhấn giữ trong ô soạn để chọn, sao chép, cắt hoặc dán văn bản"
            />
            <Pressable
              disabled={uploading || !draft.trim() || sendText.isPending}
              onPress={() => void send()}
              style={({ pressed }) => [
                styles.send,
                (uploading || !draft.trim() || sendText.isPending) &&
                  styles.sendDisabled,
                pressed && styles.pressed,
              ]}
            >
              {sendText.isPending ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <MaterialIcons name="send" size={20} color="#FFF" />
              )}
            </Pressable>
          </View>
        </View>
        <ChatMediaViewer item={preview} items={previewItems} onClose={() => { setPreview(null); setPreviewItems([]); }} />
        <ChatCameraCapture
          visible={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCaptured={handleCapturedMedia}
        />
        <Modal visible={Boolean(capturedMedia)} animationType="slide" presentationStyle="pageSheet" onRequestClose={retakeCapturedMedia}>
          <SafeAreaView style={styles.capturePreviewSafe} edges={["top", "bottom", "left", "right"]}>
            <View style={styles.capturePreviewHeader}>
              <Pressable disabled={sendingCapturedMedia} onPress={retakeCapturedMedia} style={({ pressed }) => [styles.capturePreviewHeaderButton, (pressed || sendingCapturedMedia) && styles.pressed]} accessibilityLabel="Chụp hoặc quay lại">
                <MaterialIcons name="arrow-back" size={22} color="#1D4ED8" />
              </Pressable>
              <Text style={styles.capturePreviewTitle}>{capturedMedia?.type === "video" ? "Xem trước video" : "Xem trước ảnh"}</Text>
              <View style={styles.capturePreviewHeaderButton} pointerEvents="none" />
            </View>
            <View style={styles.capturePreviewFrame}>
              {capturedMedia?.type === "image" ? (
                <Image source={{ uri: capturedMedia.uri }} style={styles.capturePreviewImage} contentFit="contain" />
              ) : capturedMedia?.thumbnailUri ? (
                <Image source={{ uri: capturedMedia.thumbnailUri }} style={styles.capturePreviewImage} contentFit="contain" />
              ) : (
                <View style={styles.capturePreviewVideoFallback}>
                  <MaterialIcons name="movie" size={52} color="#BFDBFE" />
                  <Text style={styles.capturePreviewVideoText}>Video HD đã sẵn sàng để gửi</Text>
                </View>
              )}
              {capturedMedia?.type === "video" ? <View style={styles.capturePreviewPlay}><MaterialIcons name="play-arrow" size={42} color="#FFFFFF" /></View> : null}
            </View>
            <View style={styles.capturePreviewComposer}>
              <TextInput value={captureCaption} onChangeText={setCaptureCaption} editable={!sendingCapturedMedia} placeholder="Thêm chú thích (không bắt buộc)..." placeholderTextColor="#7B8798" style={styles.capturePreviewInput} multiline maxLength={600} accessibilityLabel="Chú thích cho media" />
              <View style={styles.capturePreviewActions}>
                <Pressable disabled={sendingCapturedMedia} onPress={retakeCapturedMedia} style={({ pressed }) => [styles.capturePreviewRetake, (pressed || sendingCapturedMedia) && styles.pressed]}>
                  <MaterialIcons name="camera-alt" size={19} color="#1D4ED8" />
                  <Text style={styles.capturePreviewRetakeText}>Chụp lại</Text>
                </Pressable>
                <Pressable disabled={sendingCapturedMedia} onPress={() => void sendCapturedMedia()} style={({ pressed }) => [styles.capturePreviewSend, (pressed || sendingCapturedMedia) && styles.pressed]}>
                  {sendingCapturedMedia ? <ActivityIndicator color="#FFFFFF" size="small" /> : <><Text style={styles.capturePreviewSendText}>Gửi</Text><MaterialIcons name="send" size={18} color="#FFFFFF" /></>}
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F8FC" },
  wallpaper: { ...StyleSheet.absoluteFillObject, pointerEvents: "none" },
  wallpaperTint: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: "none",
    backgroundColor: "rgba(238, 246, 255, 0.60)",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F6F8FC",
  },
  keyboard: { flex: 1 },
  header: {
    height: 68,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E6EAF1",
    backgroundColor: "rgba(246, 248, 252, 0.92)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  back: {
    height: 42,
    width: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EFFD",
  },
  headerText: { flex: 1 },
  headerTitle: { color: "#172554", fontSize: 16, fontWeight: "800" },
  headerSubtitle: { marginTop: 3, color: "#718096", fontSize: 11.5 },
  callButton: {
    height: 36,
    width: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2FF",
    marginRight: 6,
  },
  moreButton: {
    height: 36,
    width: 36,
    borderRadius: 12,
    backgroundColor: "#E9EFFD",
    alignItems: "center",
    justifyContent: "center",
  },
  pinnedBanner: {
    minHeight: 38,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#EFF6FF",
    borderBottomWidth: 1,
    borderBottomColor: "#DBEAFE",
  },
  pinnedText: { flex: 1, color: "#1E3A8A", fontSize: 12.5, fontWeight: "700" },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 9,
    flexGrow: 1,
  },
  messageRow: { flexDirection: "row" },
  callHistoryRow: { alignItems: "center", marginVertical: 4 },
  callHistoryCard: {
    minWidth: 205,
    maxWidth: "88%",
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 15,
    backgroundColor: "#EEF4FF",
    borderWidth: 1,
    borderColor: "#D7E5FF",
  },
  callHistoryMissed: { backgroundColor: "#FFF2F2", borderColor: "#FECACA" },
  callHistoryIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DCEAFF",
  },
  callHistoryIconMissed: { backgroundColor: "#FEE2E2" },
  callHistoryContent: { flexShrink: 1 },
  callHistoryTitle: { color: "#1E3A8A", fontSize: 13, fontWeight: "800" },
  callHistoryTitleMissed: { color: "#B91C1C" },
  callHistoryDetail: { color: "#64748B", fontSize: 11.5, marginTop: 3 },
  messageStack: { maxWidth: "82%" },
  mineRow: { justifyContent: "flex-end" },
  theirRow: { justifyContent: "flex-start" },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 9,
    overflow: "hidden",
  },
  mineBubble: { backgroundColor: "#2563EB", borderBottomRightRadius: 5 },
  theirBubble: { backgroundColor: "#E9EEF8", borderBottomLeftRadius: 5 },
  screenShareInvite: { minWidth: 215, flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 3 },
  mineScreenShareInvite: {},
  screenShareInviteIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#DCEAFF" },
  mineScreenShareInviteIcon: { backgroundColor: "rgba(255,255,255,0.16)" },
  screenShareInviteContent: { flex: 1, minWidth: 0 },
  screenShareInviteTitle: { color: "#1E3A8A", fontSize: 13.5, fontWeight: "800" },
  mineScreenShareInviteTitle: { color: "#FFFFFF" },
  screenShareInviteDetail: { color: "#58718F", fontSize: 11.5, lineHeight: 16, marginTop: 2 },
  mineScreenShareInviteDetail: { color: "#D9E5FF" },
  screenShareJoin: { height: 31, alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 10, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#1D4ED8" },
  mineScreenShareJoin: { backgroundColor: "#FFFFFF" },
  screenShareJoinText: { color: "#FFFFFF", fontSize: 11.5, fontWeight: "800" },
  mineScreenShareJoinText: { color: "#1D4ED8" },
  replyPreview: { alignItems: "center", backgroundColor: "#E8EEF5", borderLeftColor: "#64748B", borderLeftWidth: 3, borderRadius: 8, flexDirection: "row", gap: 6, marginBottom: 8, paddingHorizontal: 8, paddingVertical: 6 },
  mineReplyPreview: { backgroundColor: "#315EAB", borderLeftColor: "#D9E5FF" },
  replyPreviewText: { color: "#4B6584", flex: 1, fontSize: 12, lineHeight: 16 },
  mineReplyPreviewText: { color: "#E9F1FF" },
  messageText: { color: "#1E293B", fontSize: 15.5, lineHeight: 21 },
  mineText: { color: "#FFF" },
  messageMeta: {
    marginTop: 4,
    flexDirection: "row",
    alignSelf: "flex-end",
    alignItems: "center",
    gap: 6,
  },
  messageTime: { color: "#718096", fontSize: 10.5 },
  mineTime: { color: "#D9E5FF" },
  deliveryState: { color: "#D9E5FF", fontSize: 10.5, fontWeight: "700" },
  image: { width: 220, height: 190, borderRadius: 12, marginBottom: 3 },
  videoFrame: {
    width: 220,
    height: 150,
    borderRadius: 12,
    marginBottom: 3,
    overflow: "hidden",
    backgroundColor: "#0B1630",
  },
  videoPreview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "#102A5A",
    pointerEvents: "none",
  },
  videoIcon: {
    height: 46,
    width: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,.22)",
  },
  videoPreviewText: { color: "#E6F0FF", fontSize: 12.5, fontWeight: "700" },
  mediaCleaned: { flexDirection: "row", alignItems: "center", gap: 7, marginVertical: 3, paddingVertical: 5, paddingHorizontal: 7, borderRadius: 10, backgroundColor: "#F1F5F9" },
  mineMediaCleaned: { backgroundColor: "rgba(255,255,255,0.16)" },
  mediaCleanedText: { flex: 1, color: "#64748B", fontSize: 12, lineHeight: 17, fontStyle: "italic" },
  mineMediaCleanedText: { color: "#D9E5FF" },
  recalled: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 3,
  },
  recalledText: { color: "#64748B", fontStyle: "italic", fontSize: 14 },
  mineRecalledText: { color: "#D9E5FF" },
  reactionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 4,
  },
  mineReactionRow: { justifyContent: "flex-end" },
  theirReactionRow: { justifyContent: "flex-start" },
  reactionBadge: {
    minHeight: 26,
    paddingHorizontal: 7,
    borderRadius: 13,
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE4EF",
  },
  reactionBadgeMine: { backgroundColor: "#E8F0FF", borderColor: "#93B4F9" },
  reactionBadgeText: { fontSize: 12 },
  reactionAdd: {
    height: 26,
    width: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DDE4EF",
  },
  reactionPicker: {
    marginTop: 5,
    padding: 5,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#DDE4EF",
    flexDirection: "row",
    alignSelf: "flex-start",
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  mineReactionPicker: { alignSelf: "flex-end" },
  theirReactionPicker: { alignSelf: "flex-start" },
  reactionOption: {
    height: 32,
    width: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  reactionOptionText: { fontSize: 18 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 45,
  },
  emptyIcon: {
    height: 55,
    width: 55,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E9EFFD",
  },
  emptyTitle: {
    color: "#475569",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 12,
  },
  emptyText: { color: "#8190A5", fontSize: 13, marginTop: 5 },
  typingStatus: {
    minHeight: 34,
    paddingHorizontal: 16,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F6F8FC",
  },
  typingText: { color: "#2563EB", fontSize: 12.5, fontWeight: "700" },
  replyComposer: { alignItems: "center", backgroundColor: "#EAF2FF", borderBottomColor: "#CFE2FF", borderBottomWidth: 1, flexDirection: "row", gap: 9, marginHorizontal: -12, marginTop: -10, paddingHorizontal: 16, paddingVertical: 8 },
  replyComposerText: { flex: 1, minWidth: 0 },
  replyComposerLabel: { color: "#2563EB", fontSize: 11, fontWeight: "800" },
  replyComposerBody: { color: "#4B6584", fontSize: 12.5, marginTop: 1 },
  replyDismiss: { alignItems: "center", height: 32, justifyContent: "center", width: 32 },
  mentionSuggestions: { backgroundColor: "#FFFFFF", borderColor: "#D7E4F5", borderRadius: 14, borderWidth: 1, elevation: 3, marginHorizontal: 14, marginTop: 8, overflow: "hidden", shadowColor: "#1E3A5F", shadowOpacity: 0.13, shadowRadius: 8 },
  mentionRow: { alignItems: "center", flexDirection: "row", gap: 8, minHeight: 42, paddingHorizontal: 12 },
  mentionText: { color: "#173F6C", flex: 1, fontSize: 13.5, fontWeight: "700" },
  mentionUsername: { color: "#6A87A5", fontWeight: "500" },
  composer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#E3E8F0",
    backgroundColor: "#FFF",
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  cameraButton: {
    height: 42,
    width: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF2FF",
  },
  uploadStatus: { paddingHorizontal: 2, paddingBottom: 9 },
  uploadLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 5,
  },
  uploadLabel: { color: "#475569", fontSize: 12.5, fontWeight: "700" },
  uploadPercent: { color: "#2563EB", fontSize: 12.5, fontWeight: "800" },
  uploadTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: "#E6ECF7",
    overflow: "hidden",
  },
  uploadFill: { height: "100%", borderRadius: 999, backgroundColor: "#2563EB" },
  attach: {
    height: 43,
    width: 43,
    borderRadius: 14,
    backgroundColor: "#E9EFFD",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    maxHeight: 94,
    minHeight: 43,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F0F3F8",
    color: "#172554",
    fontSize: 15.5,
  },
  send: {
    height: 43,
    width: 43,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2563EB",
  },
  sendDisabled: { backgroundColor: "#AAB4C5" },
  capturePreviewSafe: { flex: 1, backgroundColor: "#F7FAFF" },
  capturePreviewHeader: { minHeight: 58, paddingHorizontal: 16, alignItems: "center", justifyContent: "space-between", flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#E3E8F0", backgroundColor: "#FFFFFF" },
  capturePreviewHeaderButton: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#EAF2FF" },
  capturePreviewTitle: { color: "#172554", fontSize: 16, fontWeight: "800" },
  capturePreviewFrame: { flex: 1, margin: 16, overflow: "hidden", borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#091225" },
  capturePreviewImage: { width: "100%", height: "100%" },
  capturePreviewVideoFallback: { alignItems: "center", gap: 10 },
  capturePreviewVideoText: { color: "#DBEAFE", fontSize: 14, fontWeight: "700" },
  capturePreviewPlay: { position: "absolute", width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.68)" },
  capturePreviewComposer: { padding: 16, paddingTop: 4, backgroundColor: "#FFFFFF", borderTopWidth: 1, borderTopColor: "#E3E8F0" },
  capturePreviewInput: { minHeight: 74, maxHeight: 132, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16, backgroundColor: "#F1F5FA", color: "#172554", fontSize: 15 },
  capturePreviewActions: { marginTop: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  capturePreviewRetake: { height: 46, paddingHorizontal: 14, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#EAF2FF" },
  capturePreviewRetakeText: { color: "#1D4ED8", fontSize: 13.5, fontWeight: "800" },
  capturePreviewSend: { minWidth: 116, height: 46, paddingHorizontal: 16, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: "#2563EB" },
  capturePreviewSendText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
