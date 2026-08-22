import { ProfileAvatar } from "@/components/profile-avatar";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";

export default function ContactsScreen() {
  const { user, loading } = useAuth();
  const contacts = trpc.friends.contacts.useQuery(undefined, { enabled: Boolean(user), refetchInterval: 5000 });
  const openConversation = trpc.conversations.open.useMutation();
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
    if (!normalizedQuery) return contacts.data ?? [];
    return (contacts.data ?? []).filter((contact) =>
      [contact.displayName, contact.username].some((value) => value.toLocaleLowerCase("vi-VN").includes(normalizedQuery)),
    );
  }, [contacts.data, query]);

  const refreshContacts = useCallback(async () => {
    setRefreshing(true);
    try {
      await contacts.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [contacts]);

  const startChat = async (peerId: number) => {
    try {
      const conversation = await openConversation.mutateAsync({ peerId });
      router.push(`/chat/${conversation.id}` as never);
    } catch (error) {
      Alert.alert("Không thể mở cuộc trò chuyện", error instanceof Error ? error.message : "Vui lòng thử lại sau.");
    }
  };

  if (loading) {
    return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#2563EB" /></ScreenContainer>;
  }
  if (!user) return <Redirect href={"/login" as never} />;

  const isFiltering = query.trim().length > 0;

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-[#EDF6FF]">
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.kicker}>CHATPHT</Text>
            <Text style={styles.title}>Danh bạ</Text>
            <Text style={styles.subtitle}>Những người bạn đã kết nối</Text>
          </View>
          <Pressable
            onPress={() => router.push("/search" as never)}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            accessibilityLabel="Tìm bạn mới"
          >
            <MaterialIcons name="person-add-alt-1" size={20} color="#1769D4" />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <MaterialIcons name="search" size={21} color="#376DAD" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm trong danh bạ"
            placeholderTextColor="#718EAC"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Tìm kiếm trong danh bạ"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Xóa từ khóa tìm kiếm">
              <MaterialIcons name="cancel" size={19} color="#83A4CA" />
            </Pressable>
          )}
        </View>
      </View>

      <FlatList
        data={filteredContacts}
        keyExtractor={(item) => String(item.id)}
        style={styles.list}
        contentContainerStyle={filteredContacts.length === 0 ? styles.emptyList : styles.listContent}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshContacts()} tintColor="#2563EB" />}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.listHeaderText}>{isFiltering ? `Kết quả tìm kiếm (${filteredContacts.length})` : `${filteredContacts.length} người bạn`}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.contactCard}>
            <Pressable
              onPress={() => void startChat(item.id)}
              disabled={openConversation.isPending}
              style={({ pressed }) => [styles.contactMain, (pressed || openConversation.isPending) && styles.contactPressed]}
              accessibilityLabel={`Mở cuộc trò chuyện với ${item.displayName}`}
            >
              <ProfileAvatar name={item.displayName} avatarUrl={item.avatarUrl} size={52} style={styles.avatar} />
              <View style={styles.contactInfo}>
                <Text numberOfLines={1} style={styles.contactName}>{item.displayName}</Text>
                <Text numberOfLines={1} style={styles.username}>@{item.username}</Text>
              </View>
            </Pressable>
            <Pressable
              onPress={() => void startChat(item.id)}
              disabled={openConversation.isPending}
              style={({ pressed }) => [styles.chatButton, (pressed || openConversation.isPending) && styles.pressed]}
              accessibilityLabel={`Nhắn tin với ${item.displayName}`}
            >
              {openConversation.isPending ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.chatButtonText}>Nhắn tin</Text>}
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          contacts.isLoading ? (
            <View style={styles.empty}><ActivityIndicator color="#2563EB" /></View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}><MaterialIcons name={isFiltering ? "person-search" : "group-add"} color="#2563EB" size={31} /></View>
              <Text style={styles.emptyTitle}>{isFiltering ? "Không tìm thấy người bạn phù hợp" : "Danh bạ của bạn đang trống"}</Text>
              <Text style={styles.emptyBody}>{isFiltering ? "Hãy thử lại với tên hiển thị hoặc tên người dùng khác." : "Tìm và kết bạn để bắt đầu trò chuyện riêng tư."}</Text>
              {!isFiltering && (
                <Pressable onPress={() => router.push("/search" as never)} style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                  <Text style={styles.emptyButtonText}>Tìm bạn</Text>
                </Pressable>
              )}
            </View>
          )
        }
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: "#1769D4", borderBottomLeftRadius: 27, borderBottomRightRadius: 27, paddingBottom: 18, paddingHorizontal: 17, paddingTop: 9 },
  headerTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  kicker: { color: "#BBD8FF", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  title: { color: "#FFFFFF", fontSize: 26, fontWeight: "800", letterSpacing: -0.4, marginTop: 1 },
  subtitle: { color: "#CAE1FF", fontSize: 12.5, marginTop: 2 },
  addButton: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 14, height: 43, justifyContent: "center", width: 43 },
  searchBox: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 16, flexDirection: "row", gap: 10, marginTop: 15, minHeight: 49, paddingHorizontal: 14 },
  searchInput: { color: "#173F6C", flex: 1, fontSize: 15, height: "100%" },
  list: { flex: 1 },
  listContent: { paddingBottom: 99, paddingHorizontal: 13 },
  emptyList: { flexGrow: 1, paddingBottom: 90, paddingHorizontal: 24 },
  listHeader: { paddingBottom: 9, paddingTop: 15 },
  listHeaderText: { color: "#5D7FA8", fontSize: 13, fontWeight: "700" },
  contactCard: { alignItems: "center", backgroundColor: "#FFFFFFE8", borderColor: "#D8E9F8", borderRadius: 19, borderWidth: 1, flexDirection: "row", gap: 10, marginBottom: 9, minHeight: 76, padding: 12 },
  contactMain: { alignItems: "center", flex: 1, flexDirection: "row", gap: 12, minWidth: 0 },
  contactPressed: { opacity: 0.72 },
  avatar: { backgroundColor: "#DDE7FB" },
  contactInfo: { flex: 1, minWidth: 0 },
  contactName: { color: "#173F6C", fontSize: 15.5, fontWeight: "800" },
  username: { color: "#718EAC", fontSize: 13, marginTop: 3 },
  chatButton: { alignItems: "center", backgroundColor: "#1769D4", borderRadius: 11, justifyContent: "center", minHeight: 37, minWidth: 78, paddingHorizontal: 11 },
  chatButtonText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.97 }] },
  empty: { alignItems: "center", flex: 1, justifyContent: "center", paddingBottom: 88 },
  emptyIcon: { alignItems: "center", backgroundColor: "#E4F0FF", borderRadius: 23, height: 68, justifyContent: "center", width: 68 },
  emptyTitle: { color: "#173F6C", fontSize: 17, fontWeight: "800", marginTop: 17, textAlign: "center" },
  emptyBody: { color: "#718EAC", fontSize: 13.5, lineHeight: 20, marginTop: 7, maxWidth: 275, textAlign: "center" },
  emptyButton: { backgroundColor: "#1769D4", borderRadius: 13, justifyContent: "center", marginTop: 20, minHeight: 44, paddingHorizontal: 20 },
  emptyButtonText: { color: "#FFFFFF", fontWeight: "800" },
});
