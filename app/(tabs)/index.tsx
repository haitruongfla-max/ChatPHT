import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";

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
  const [refreshing, setRefreshing] = useState(false);
  const refreshInbox = useCallback(async () => {
    setRefreshing(true);
    try { await conversations.refetch(); } finally { setRefreshing(false); }
  }, [conversations]);

  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#2563EB" /></ScreenContainer>;
  if (!user) return <Redirect href={"/login" as never} />;

  return (
    <ScreenContainer edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <View><Text style={styles.kicker}>CHATPHT</Text><Text style={styles.title}>Hộp thư</Text></View>
        <View style={styles.headerActions}>
          <Pressable onPress={() => router.push("/requests" as never)} style={({ pressed }) => [styles.circleButton, pressed && styles.pressed]}>
            <MaterialIcons name="person-add-alt-1" size={21} color="#1D4ED8" />
            {(requests.data?.length ?? 0) > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{requests.data?.length}</Text></View>}
          </Pressable>
          <Pressable onPress={() => router.push("/search" as never)} style={({ pressed }) => [styles.newChat, pressed && styles.pressed]}>
            <MaterialIcons name="edit" size={18} color="#FFFFFF" /><Text style={styles.newChatText}>Chat mới</Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={conversations.data ?? []}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        contentContainerStyle={(conversations.data?.length ?? 0) === 0 ? styles.emptyList : styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshInbox()} tintColor="#2563EB" />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/chat/${item.id}` as never)} style={({ pressed }) => [styles.thread, pressed && styles.threadPressed]}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{item.peer.displayName.slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.threadBody}>
              <View style={styles.threadTop}><Text numberOfLines={1} style={styles.threadName}>{item.peer.displayName}</Text><Text style={styles.time}>{item.latestMessage ? new Date(item.latestMessage.createdAt).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }) : ""}</Text></View>
              <Text numberOfLines={1} style={styles.preview}>{preview(item.latestMessage)}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#A1ACC0" />
          </Pressable>
        )}
        ListEmptyComponent={<View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name="forum" size={30} color="#2563EB" /></View><Text style={styles.emptyTitle}>Chưa có hội thoại</Text><Text style={styles.emptyBody}>Tìm bạn bằng tên người dùng để bắt đầu nhắn tin riêng tư.</Text><Pressable onPress={() => router.push("/search" as never)} style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}><Text style={styles.emptyButtonText}>Tìm bạn</Text></Pressable></View>}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F6F8FC" },
  kicker: { fontSize: 11, color: "#2563EB", letterSpacing: 1.5, fontWeight: "800" }, title: { marginTop: 2, fontSize: 29, lineHeight: 35, color: "#172554", fontWeight: "800", letterSpacing: -0.6 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 }, circleButton: { position: "relative", height: 43, width: 43, borderRadius: 14, backgroundColor: "#E9EFFD", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", right: -2, top: -3, minWidth: 17, height: 17, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#DC2626", borderWidth: 1.5, borderColor: "#F6F8FC" }, badgeText: { color: "#FFF", fontSize: 10, fontWeight: "800" },
  newChat: { height: 43, paddingHorizontal: 12, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#2563EB" }, newChatText: { color: "#FFF", fontWeight: "800", fontSize: 13 }, pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  list: { flex: 1 }, listContent: { paddingHorizontal: 12, paddingBottom: 98 }, emptyList: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 90 },
  thread: { backgroundColor: "#FFF", marginHorizontal: 8, marginBottom: 7, borderWidth: 1, borderColor: "#E6EAF1", borderRadius: 18, padding: 13, flexDirection: "row", alignItems: "center", gap: 11 }, threadPressed: { opacity: 0.74 },
  avatar: { width: 47, height: 47, borderRadius: 16, backgroundColor: "#DDE7FB", justifyContent: "center", alignItems: "center" }, avatarText: { color: "#1D4ED8", fontSize: 19, fontWeight: "800" }, threadBody: { flex: 1, minWidth: 0 }, threadTop: { flexDirection: "row", gap: 10, alignItems: "center" }, threadName: { flex: 1, color: "#162B54", fontSize: 16, fontWeight: "800" }, time: { color: "#8995A8", fontSize: 11 }, preview: { marginTop: 4, color: "#6B778B", fontSize: 13.5 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 80 }, emptyIcon: { width: 68, height: 68, borderRadius: 24, backgroundColor: "#E9EFFD", justifyContent: "center", alignItems: "center" }, emptyTitle: { marginTop: 18, color: "#172554", fontSize: 19, fontWeight: "800" }, emptyBody: { maxWidth: 260, marginTop: 8, textAlign: "center", color: "#718096", lineHeight: 20, fontSize: 14 }, emptyButton: { marginTop: 21, backgroundColor: "#2563EB", paddingHorizontal: 20, minHeight: 44, justifyContent: "center", borderRadius: 13 }, emptyButtonText: { color: "#FFF", fontWeight: "800" },
});
