import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ProfileAvatar } from "@/components/profile-avatar";

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

  return <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#EDF6FF]">
    <View style={styles.header}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={22} color="#FFFFFF" /></Pressable><View><Text style={styles.kicker}>DANH BẠ</Text><Text style={styles.title}>Tìm bạn mới</Text><Text style={styles.subtitle}>Dùng chính xác tên người dùng</Text></View></View>
    <View style={styles.searchBox}><MaterialIcons name="search" size={21} color="#66768F" /><TextInput value={query} onChangeText={(text) => setQuery(text.toLowerCase())} autoCapitalize="none" autoCorrect={false} placeholder="Nhập tên người dùng" placeholderTextColor="#8894A7" style={styles.input} returnKeyType="search" /></View>
    <FlatList data={results.data ?? []} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" renderItem={({ item }) => <View style={styles.row}><ProfileAvatar name={item.displayName} avatarUrl={item.avatarUrl} size={48} style={styles.avatar} /><View style={styles.userInfo}><Text style={styles.name}>{item.displayName}</Text><Text style={styles.username}>@{item.username}</Text></View><Pressable disabled={request.isPending} onPress={() => void connect(item.username)} style={({ pressed }) => [styles.add, (pressed || request.isPending) && styles.pressed]}><Text style={styles.addText}>Kết bạn</Text></Pressable></View>} ListEmptyComponent={query.trim().length > 0 && !results.isLoading ? <View style={styles.empty}><MaterialIcons name="person-search" color="#7A9FC7" size={35}/><Text style={styles.emptyTitle}>Không tìm thấy người dùng</Text><Text style={styles.emptyText}>Kiểm tra lại tên người dùng và thử lại.</Text></View> : null} />
  </ScreenContainer>;
}

const styles = StyleSheet.create({ header: { alignItems: "center", backgroundColor: "#1769D4", borderBottomLeftRadius: 28, borderBottomRightRadius: 28, flexDirection: "row", gap: 12, paddingBottom: 19, paddingHorizontal: 20, paddingTop: 11 }, back: { alignItems: "center", backgroundColor: "#4A90EA", borderColor: "#8BBDFC", borderRadius: 14, borderWidth: 1, height: 42, justifyContent: "center", width: 42 }, kicker: { color: "#BBD8FF", fontSize: 10, fontWeight: "800", letterSpacing: 1.3 }, title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" }, subtitle: { color: "#CAE1FF", fontSize: 12.5, marginTop: 2 }, searchBox: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#CAE0F7", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, height: 52, marginHorizontal: 17, marginTop: 16, paddingHorizontal: 14 }, input: { color: "#173F6C", flex: 1, fontSize: 16, height: "100%" }, list: { gap: 9, padding: 17 }, row: { alignItems: "center", backgroundColor: "#FFFFFFE8", borderColor: "#D8E9F8", borderRadius: 18, borderWidth: 1, flexDirection: "row", gap: 12, minHeight: 74, padding: 12 }, avatar: { backgroundColor: "#DDE7FB" }, userInfo: { flex: 1, minWidth: 0 }, name: { color: "#173F6C", fontSize: 15.5, fontWeight: "800" }, username: { color: "#718EAC", fontSize: 13, marginTop: 3 }, add: { backgroundColor: "#1769D4", borderRadius: 11, justifyContent: "center", minHeight: 37, paddingHorizontal: 12 }, addText: { color: "#FFF", fontSize: 12.5, fontWeight: "800" }, pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] }, empty: { alignItems: "center", paddingTop: 70 }, emptyTitle: { color: "#335D88", fontSize: 16, fontWeight: "800", marginTop: 12 }, emptyText: { color: "#718EAC", fontSize: 13, marginTop: 6 } });
