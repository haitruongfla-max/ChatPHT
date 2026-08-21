import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";

export default function SearchScreen() {
  const { user, loading } = useAuth();
  const [query, setQuery] = useState("");
  const utils = trpc.useUtils();
  const results = trpc.friends.search.useQuery({ query }, { enabled: query.trim().length > 0 });
  const request = trpc.friends.request.useMutation({ onSuccess: () => void utils.friends.incoming.invalidate() });

  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#2563EB" /></ScreenContainer>;
  if (!user) return <Redirect href={"/login" as never} />;

  const connect = async (username: string) => {
    try {
      const response = await request.mutateAsync({ username });
      if (response.status === "accepted") router.replace(`/chat/${response.conversationId}` as never);
      else Alert.alert("Đã gửi lời mời", "Bạn sẽ có thể nhắn tin khi lời mời được chấp nhận.");
    } catch (error) {
      Alert.alert("Không thể gửi lời mời", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={22} color="#172554" /></Pressable><View><Text style={styles.title}>Tìm bạn</Text><Text style={styles.subtitle}>Dùng chính xác tên người dùng</Text></View></View>
    <View style={styles.searchBox}><MaterialIcons name="search" size={21} color="#66768F" /><TextInput value={query} onChangeText={(text) => setQuery(text.toLowerCase())} autoCapitalize="none" autoCorrect={false} placeholder="Nhập tên người dùng" placeholderTextColor="#8894A7" style={styles.input} returnKeyType="search" /></View>
    <FlatList data={results.data ?? []} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <View style={styles.row}><View style={styles.avatar}><Text style={styles.avatarText}>{item.displayName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.userInfo}><Text style={styles.name}>{item.displayName}</Text><Text style={styles.username}>@{item.username}</Text></View><Pressable disabled={request.isPending} onPress={() => void connect(item.username)} style={({ pressed }) => [styles.add, (pressed || request.isPending) && styles.pressed]}><Text style={styles.addText}>Kết bạn</Text></Pressable></View>} ListEmptyComponent={query.trim().length > 0 && !results.isLoading ? <View style={styles.empty}><MaterialIcons name="person-search" color="#94A3B8" size={35}/><Text style={styles.emptyTitle}>Không tìm thấy người dùng</Text><Text style={styles.emptyText}>Kiểm tra lại tên người dùng và thử lại.</Text></View> : null} />
  </ScreenContainer>;
}

const styles = StyleSheet.create({ header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18, flexDirection: "row", alignItems: "center", gap: 12 }, back: { height: 42, width: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E9EFFD" }, title: { color: "#172554", fontSize: 22, fontWeight: "800" }, subtitle: { color: "#718096", marginTop: 2, fontSize: 13 }, searchBox: { flexDirection: "row", alignItems: "center", marginHorizontal: 20, paddingHorizontal: 14, height: 50, gap: 10, borderRadius: 15, borderWidth: 1, borderColor: "#D9E1EE", backgroundColor: "#FFF" }, input: { flex: 1, color: "#172554", fontSize: 16, height: "100%" }, list: { padding: 20, gap: 9 }, row: { minHeight: 72, borderRadius: 17, padding: 12, gap: 11, flexDirection: "row", alignItems: "center", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EAF0" }, avatar: { width: 45, height: 45, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "#DDE7FB" }, avatarText: { fontWeight: "800", color: "#1D4ED8", fontSize: 18 }, userInfo: { flex: 1, minWidth: 0 }, name: { color: "#172554", fontSize: 15.5, fontWeight: "800" }, username: { color: "#718096", marginTop: 3, fontSize: 13 }, add: { minHeight: 37, borderRadius: 11, paddingHorizontal: 12, justifyContent: "center", backgroundColor: "#2563EB" }, addText: { color: "#FFF", fontSize: 12.5, fontWeight: "800" }, pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] }, empty: { alignItems: "center", paddingTop: 70 }, emptyTitle: { color: "#475569", marginTop: 12, fontSize: 16, fontWeight: "800" }, emptyText: { color: "#8190A5", marginTop: 6, fontSize: 13 } });
