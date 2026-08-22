import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ProfileAvatar } from "@/components/profile-avatar";

function preview(message: { body: string | null; contentType: "text" | "image" | "video" } | null) {
  if (!message) return "Bắt đầu một cuộc trò chuyện";
  if (message.contentType === "image") return "Ảnh";
  if (message.contentType === "video") return "Video";
  return message.body ?? "Tin nhắn mới";
}

export default function InboxScreen() {
  const { user, loading } = useAuth();
  const conversations = trpc.conversations.list.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 2500 });
  const requests = trpc.friends.incoming.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 5000 });
  const clearConversation = trpc.conversations.clearContent.useMutation();
  const [refreshing, setRefreshing] = useState(false);
  const refreshInbox = useCallback(async () => {
    setRefreshing(true);
    try { await conversations.refetch(); } finally { setRefreshing(false); }
  }, [conversations]);

  const clearContent = async (conversationId: number) => {
    try {
      await clearConversation.mutateAsync({ conversationId });
      await conversations.refetch();
    } catch (error) {
      Alert.alert("Không thể xóa sạch", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };

  const confirmClearContent = (conversationId: number, displayName: string) =>
    Alert.alert(
      "Xóa sạch toàn bộ nội dung?",
      `Tin nhắn, ảnh và video trong cuộc trò chuyện với ${displayName} sẽ bị xóa vĩnh viễn cho cả hai người. Thao tác này không thể hoàn tác.`,
      [
        { text: "Hủy", style: "cancel" },
        { text: "Xóa sạch", style: "destructive", onPress: () => void clearContent(conversationId) },
      ],
    );

  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#2563EB" /></ScreenContainer>;
  if (!user) return <Redirect href={"/login" as never} />;

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-[#EDF6FF]">
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View><Text style={styles.kicker}>CHATPHT</Text><Text style={styles.title}>Tin nhắn</Text></View>
          <View style={styles.headerActions}>
            <Pressable onPress={() => router.push("/requests" as never)} style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]} accessibilityLabel="Lời mời kết bạn">
              <MaterialIcons name="person-add-alt-1" size={20} color="#FFFFFF" />
            {(requests.data?.length ?? 0) > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{requests.data?.length}</Text></View>}
          </Pressable>
            <Pressable onPress={() => router.push("/search" as never)} style={({ pressed }) => [styles.newChat, pressed && styles.pressed]} accessibilityLabel="Tạo cuộc trò chuyện mới">
              <MaterialIcons name="add-comment" size={18} color="#1769D4" />
            </Pressable>
          </View>
        </View>
        <Pressable onPress={() => router.push("/search" as never)} style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]} accessibilityLabel="Tìm kiếm bạn bè">
          <MaterialIcons name="search" size={22} color="#376DAD" />
          <Text style={styles.searchText}>Tìm theo tên người dùng</Text>
          <MaterialIcons name="qr-code-scanner" size={20} color="#82A9D7" />
        </Pressable>
        {(requests.data?.length ?? 0) > 0 && <Pressable onPress={() => router.push("/requests" as never)} style={styles.noticeCard}>
          <View style={styles.noticeIcon}><MaterialIcons name="group-add" size={18} color="#1769D4" /></View>
          <Text style={styles.noticeText}>Bạn có {requests.data?.length} lời mời kết bạn mới</Text>
          <MaterialIcons name="chevron-right" size={20} color="#83A4CA" />
        </Pressable>}
      </View>

      <FlatList
        data={conversations.data ?? []}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        contentContainerStyle={(conversations.data?.length ?? 0) === 0 ? styles.emptyList : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshInbox()} tintColor="#2563EB" />}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/chat/${item.id}` as never)}
            onLongPress={() => confirmClearContent(item.id, item.peer.displayName)}
            delayLongPress={450}
            disabled={clearConversation.isPending}
            style={({ pressed }) => [styles.thread, (pressed || clearConversation.isPending) && styles.threadPressed]}
            accessibilityLabel={`Mở cuộc trò chuyện với ${item.peer.displayName}`}
            accessibilityHint="Nhấn giữ để xóa sạch toàn bộ nội dung cuộc trò chuyện"
          >
            <ProfileAvatar name={item.peer.displayName} avatarUrl={item.peer.avatarUrl} size={50} style={styles.avatar} />
            <View style={styles.threadBody}>
              <View style={styles.threadTop}><Text numberOfLines={1} style={styles.threadName}>{item.peer.displayName}</Text><Text style={styles.time}>{item.latestMessage ? new Date(item.latestMessage.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : ""}</Text></View>
              <Text numberOfLines={1} style={styles.preview}>{preview(item.latestMessage)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={21} color="#9AB2CE" />
          </Pressable>
        )}
        ListEmptyComponent={<View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name="forum" size={30} color="#2563EB" /></View><Text style={styles.emptyTitle}>Chưa có hội thoại</Text><Text style={styles.emptyBody}>Tìm bạn bằng tên người dùng để bắt đầu nhắn tin riêng tư.</Text><Pressable onPress={() => router.push("/search" as never)} style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}><Text style={styles.emptyButtonText}>Tìm bạn</Text></Pressable></View>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: "#1769D4", borderBottomLeftRadius: 26, borderBottomRightRadius: 26, paddingHorizontal: 17, paddingTop: 9, paddingBottom: 17 },
  headerTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: "#BBD8FF", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 }, title: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", letterSpacing: -0.4, marginTop: 1 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 9 }, circleButton: { alignItems: "center", backgroundColor: "#4A90EA", borderColor: "#82B6F7", borderRadius: 14, borderWidth: 1, height: 43, justifyContent: "center", position: "relative", width: 43 },
  badge: { alignItems: "center", backgroundColor: "#FF5B62", borderColor: "#1769D4", borderRadius: 9, borderWidth: 2, height: 19, justifyContent: "center", minWidth: 19, position: "absolute", right: -4, top: -5 }, badgeText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  newChat: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 14, height: 43, justifyContent: "center", width: 43 },
  searchBar: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 16, flexDirection: "row", gap: 10, marginTop: 16, minHeight: 48, paddingHorizontal: 14 },
  searchText: { color: "#6C89AA", flex: 1, fontSize: 14, fontWeight: "600" },
  noticeCard: { alignItems: "center", backgroundColor: "#E8F2FF", borderRadius: 14, flexDirection: "row", gap: 10, marginTop: 12, minHeight: 50, paddingHorizontal: 11 },
  noticeIcon: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 10, height: 30, justifyContent: "center", width: 30 }, noticeText: { color: "#1A548F", flex: 1, fontSize: 13, fontWeight: "700" },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  list: { flex: 1 }, listContent: { paddingHorizontal: 12, paddingBottom: 98 }, emptyList: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 90 },
  thread: { alignItems: "center", backgroundColor: "#FFFFFFDC", borderColor: "#DCEAF8", borderRadius: 19, borderWidth: 1, flexDirection: "row", gap: 12, marginBottom: 8, marginHorizontal: 9, padding: 13 }, threadPressed: { opacity: 0.74 },
  avatar: { backgroundColor: "#DDE7FB" }, threadBody: { flex: 1, minWidth: 0 }, threadTop: { alignItems: "center", flexDirection: "row", gap: 10 }, threadName: { color: "#143E70", flex: 1, fontSize: 16, fontWeight: "800" }, time: { color: "#7891AD", fontSize: 11 }, preview: { color: "#6B829D", fontSize: 13.5, marginTop: 4 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 }, emptyIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: "#E9EFFD", justifyContent: "center", alignItems: "center" }, emptyTitle: { marginTop: 18, color: "#172554", fontSize: 19, fontWeight: "800" }, emptyBody: { maxWidth: 260, marginTop: 8, textAlign: "center", color: "#718096", lineHeight: 20, fontSize: 14 }, emptyButton: { marginTop: 21, backgroundColor: "#2563EB", paddingHorizontal: 20, minHeight: 44, justifyContent: "center", borderRadius: 13 }, emptyButtonText: { color: "#FFF", fontWeight: "800" },
});
