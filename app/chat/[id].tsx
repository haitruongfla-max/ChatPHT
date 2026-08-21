import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import {
  ChatMediaPreview,
  ChatMediaViewer,
} from "@/components/chat-media-viewer";
import {
  resolveMediaUploadUri,
  uploadMediaDirectly,
} from "@/lib/direct-media-upload";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
  contentType: "text" | "image" | "video";
  mediaUrl: string | null;
  mediaCacheKey: string | null;
  mediaName: string | null;
  recalledAt: Date | null;
  recalledBy: number | null;
  createdAt: Date;
  reactions: { emoji: string; userId: number }[];
  recipientDeliveredAt: Date | null;
  recipientReadAt: Date | null;
};

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"] as const;

function VideoBubble({ uri, onOpen }: { uri: string; onOpen: () => void }) {
  return (
    <Pressable
      onPress={onOpen}
      style={styles.videoFrame}
      accessibilityRole="button"
      accessibilityLabel="Mở video toàn màn hình"
    >
      <View pointerEvents="none" style={styles.videoPreview}>
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
  const rawId = useLocalSearchParams<{ id: string }>().id;
  const conversationId = Number(rawId);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const lastTypingHeartbeatAt = useRef(0);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState("Đang tải lên");
  const [reactionPickerFor, setReactionPickerFor] = useState<number | null>(
    null,
  );
  const [preview, setPreview] = useState<ChatMediaPreview | null>(null);
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
  const messageCount = messages.data?.length ?? 0;
  const sendText = trpc.messages.sendText.useMutation();
  const requestMediaUpload = trpc.messages.requestMediaUpload.useMutation();
  const completeMediaUpload = trpc.messages.completeMediaUpload.useMutation();
  const toggleReaction = trpc.messages.toggleReaction.useMutation();
  const { mutateAsync: markRead } = trpc.messages.markRead.useMutation();
  const { mutateAsync: setTyping } = trpc.messages.setTyping.useMutation();
  const recall = trpc.messages.recall.useMutation();
  const removeConversation = trpc.conversations.remove.useMutation();
  const clearConversation = trpc.conversations.clearContent.useMutation();
  const startCall = trpc.calls.start.useMutation();
  const header = useMemo(
    () => ({
      title: "Hội thoại riêng tư",
      subtitle: "Chỉ thành viên có thể xem tin nhắn",
    }),
    [],
  );

  useEffect(() => {
    if (messages.data?.length)
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 20);
  }, [messages.data?.length]);

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
  };
  const beginCall = async (kind: "audio" | "video") => {
    try {
      const call = await startCall.mutateAsync({ conversationId, kind });
      router.push({
        pathname: "/call",
        params: { callId: call.id, kind, direction: "outgoing", name: header.title },
      });
    } catch (error) {
      Alert.alert(
        "Không thể bắt đầu cuộc gọi",
        error instanceof Error ? error.message : "Vui lòng thử lại.",
      );
    }
  };
  const send = async () => {
    const body = draft.trim();
    if (!body || sendText.isPending || uploading) return;
    setDraft("");
    void setTyping({ conversationId, isTyping: false }).catch(() => undefined);
    try {
      await sendText.mutateAsync({ conversationId, body });
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

  const chooseMedia = async () => {
    if (uploading) return;
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false,
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const isVideo = asset.type === "video";
    const maxBytes = isVideo ? 100 * 1024 * 1024 : 8 * 1024 * 1024;
    const fileSize = asset.fileSize;
    if (!fileSize) {
      Alert.alert(
        "Không đọc được dung lượng",
        "Hãy chọn lại tệp từ thư viện để SwiftChat kiểm tra giới hạn an toàn.",
      );
      return;
    }
    if (fileSize > maxBytes) {
      Alert.alert(
        "Tệp quá lớn",
        isVideo ? "Video tối đa 100 MB." : "Ảnh tối đa 8 MB.",
      );
      return;
    }
    const mimeType = asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg");
    const filename =
      asset.fileName ?? `swiftchat-${Date.now()}.${isVideo ? "mp4" : "jpg"}`;
    if (
      !(
        mimeType.startsWith("image/") ||
        mimeType === "video/mp4" ||
        mimeType === "video/quicktime"
      )
    ) {
      Alert.alert(
        "Định dạng chưa hỗ trợ",
        "Hãy chọn ảnh JPEG/PNG/WEBP/GIF hoặc video MP4/MOV.",
      );
      return;
    }
    setUploading(true);
    setUploadProgress(0);
    setUploadLabel("Chuẩn bị tệp...");
    try {
      const uploadUri = await resolveMediaUploadUri(asset.uri, asset.assetId);
      const prepared = await requestMediaUpload.mutateAsync({
        conversationId,
        filename,
        mimeType: mimeType as
          | "image/jpeg"
          | "image/png"
          | "image/webp"
          | "image/gif"
          | "video/mp4"
          | "video/quicktime",
        size: fileSize,
      });
      setUploadLabel("Đang tải lên");
      await uploadMediaDirectly({
        uri: uploadUri,
        uploadUrl: prepared.uploadUrl,
        mimeType,
        onProgress: setUploadProgress,
      });
      setUploadProgress(100);
      setUploadLabel("Đang gửi tin nhắn...");
      await completeMediaUpload.mutateAsync({
        conversationId,
        key: prepared.key,
        filename: prepared.filename,
        mimeType: mimeType as
          | "image/jpeg"
          | "image/png"
          | "image/webp"
          | "image/gif"
          | "video/mp4"
          | "video/quicktime",
        size: fileSize,
      });
      await utils.messages.list.invalidate({ conversationId });
      void utils.conversations.list.invalidate();
    } catch (error) {
      Alert.alert(
        "Không tải được tệp",
        error instanceof Error
          ? error.message
          : "Vui lòng thử lại bằng tệp nhỏ hơn.",
      );
    } finally {
      setUploading(false);
      setUploadProgress(null);
      setUploadLabel("Đang tải lên");
    }
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
      "Xóa hội thoại?",
      "Hội thoại chỉ biến khỏi hộp thư của bạn. Người kia vẫn giữ nguyên tin nhắn.",
      [
        { text: "Hủy", style: "cancel" },
        { text: "Xóa", style: "destructive", onPress: () => void remove() },
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
            <Text style={styles.headerSubtitle}>{header.subtitle}</Text>
          </View>
          <Pressable
            onPress={() => void beginCall("audio")}
            disabled={startCall.isPending}
            style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Gọi thoại"
          >
            <MaterialIcons name="phone" size={20} color="#2563EB" />
          </Pressable>
          <Pressable
            onPress={() => void beginCall("video")}
            disabled={startCall.isPending}
            style={({ pressed }) => [styles.callButton, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Gọi video"
          >
            <MaterialIcons name="videocam" size={21} color="#2563EB" />
          </Pressable>
          <Pressable
            onPress={confirmRemove}
            disabled={
              removeConversation.isPending || clearConversation.isPending
            }
            style={({ pressed }) => [
              styles.deleteConversation,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Xóa hội thoại khỏi hộp thư"
          >
            <MaterialIcons name="delete-outline" size={21} color="#C2410C" />
          </Pressable>
          <Pressable
            onPress={confirmClearContent}
            disabled={
              removeConversation.isPending || clearConversation.isPending
            }
            style={({ pressed }) => [
              styles.clearConversation,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Xóa sạch toàn bộ tin nhắn, ảnh và video"
          >
            <MaterialIcons name="delete-forever" size={21} color="#B91C1C" />
          </Pressable>
          <View style={styles.shield}>
            <MaterialIcons name="shield" size={19} color="#16713B" />
          </View>
        </View>
        <FlatList
          ref={listRef}
          data={(messages.data ?? []) as ChatMessage[]}
          keyExtractor={(item) => String(item.id)}
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
                    onLongPress={
                      mine && !item.recalledAt
                        ? () => confirmRecall(item)
                        : undefined
                    }
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
                        {item.contentType === "image" && item.mediaUrl ? (
                          <Pressable
                            onPress={() =>
                              setPreview({
                                uri: item.mediaUrl as string,
                                type: "image",
                                name: item.mediaName,
                              })
                            }
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
                              transition={120}
                            />
                          </Pressable>
                        ) : null}
                        {item.contentType === "video" && item.mediaUrl ? (
                          <VideoBubble
                            uri={item.mediaUrl}
                            onOpen={() =>
                              setPreview({
                                uri: item.mediaUrl as string,
                                type: "video",
                                name: item.mediaName,
                              })
                            }
                          />
                        ) : null}
                        {item.body ? (
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
          <View style={styles.composerRow}>
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
        <ChatMediaViewer item={preview} onClose={() => setPreview(null)} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F8FC" },
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
    backgroundColor: "#F6F8FC",
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
  deleteConversation: {
    height: 36,
    width: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF0E9",
  },
  clearConversation: {
    height: 36,
    width: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FEE2E2",
  },
  shield: {
    height: 36,
    width: 36,
    borderRadius: 12,
    backgroundColor: "#ECFDF3",
    alignItems: "center",
    justifyContent: "center",
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 9,
    flexGrow: 1,
  },
  messageRow: { flexDirection: "row" },
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
  composer: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderColor: "#E3E8F0",
    backgroundColor: "#FFF",
  },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
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
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },
});
