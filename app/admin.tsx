import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";

function expiryLabel(value: Date | string | null, expired: boolean) {
  if (!value) return "Không giới hạn";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa xác định";
  return `${expired ? "Đã hết hạn" : "Hết hạn"}: ${date.toLocaleDateString("vi-VN")}`;
}

export default function AdminScreen() {
  const { user, loading } = useAuth();
  const users = trpc.admin.listUsers.useQuery(undefined, { enabled: user?.role === "admin" });
  const utils = trpc.useUtils();
  const setDays = trpc.admin.setAccessDays.useMutation({ onSuccess: () => utils.admin.listUsers.invalidate() });
  const clearExpiry = trpc.admin.clearAccessExpiry.useMutation({ onSuccess: () => utils.admin.listUsers.invalidate() });
  const deleteUser = trpc.admin.deleteUser.useMutation({ onSuccess: () => utils.admin.listUsers.invalidate() });
  const [days, setDaysValue] = useState<Record<number, string>>({});

  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#7C3AED" /></ScreenContainer>;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "admin") return <Redirect href="/(tabs)/profile" />;

  const applyDays = async (userId: number) => {
    const value = Number.parseInt(days[userId] ?? "", 10);
    if (!Number.isInteger(value) || value < 1 || value > 3650) {
      Alert.alert("Số ngày chưa hợp lệ", "Nhập số nguyên từ 1 đến 3650 ngày.");
      return;
    }
    try {
      await setDays.mutateAsync({ userId, days: value });
      setDaysValue((current) => ({ ...current, [userId]: "" }));
    } catch (error) {
      Alert.alert("Không thể cập nhật", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };

  const confirmDelete = (userId: number, name: string) => Alert.alert("Xóa người dùng", `Xóa vĩnh viễn tài khoản ${name}, hội thoại và media do tài khoản này gửi?`, [
    { text: "Hủy", style: "cancel" },
    { text: "Xóa vĩnh viễn", style: "destructive", onPress: () => void deleteUser.mutateAsync({ userId }).catch((error) => Alert.alert("Không thể xóa", error instanceof Error ? error.message : "Vui lòng thử lại.")) },
  ]);

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <View style={styles.header}><Pressable onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-back" size={24} color="#312E81" /></Pressable><View><Text style={styles.kicker}>QUẢN TRỊ</Text><Text style={styles.title}>Người dùng</Text></View></View>
        <View style={styles.notice}><MaterialIcons name="admin-panel-settings" size={20} color="#6D28D9" /><Text style={styles.noticeText}>Chỉ tài khoản quản trị mới thấy khu vực này. Tài khoản quá hạn sẽ bị chặn khi dùng ứng dụng.</Text></View>
        <Pressable onPress={() => router.push("/admin-storage")} style={({ pressed }) => [styles.storageLink, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Mở dung lượng lưu trữ"><View style={styles.storageLinkIcon}><MaterialIcons name="storage" size={22} color="#6D28D9" /></View><View style={styles.storageLinkBody}><Text style={styles.storageLinkTitle}>Dung lượng lưu trữ</Text><Text style={styles.storageLinkText}>Xem media đã dùng, quota 20 GB và 5 tin nhắn gần nhất.</Text></View><MaterialIcons name="chevron-right" size={24} color="#7C3AED" /></Pressable>
        {users.isLoading ? <ActivityIndicator color="#7C3AED" style={styles.loading} /> : null}
        {users.data?.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.row}><View style={styles.avatar}><Text style={styles.avatarText}>{item.displayName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.userInfo}><Text style={styles.name}>{item.displayName}</Text><Text style={styles.username}>@{item.username}</Text><Text style={[styles.expiry, item.isExpired && styles.expired]}>{expiryLabel(item.accessExpiresAt, item.isExpired)}</Text></View>{item.role === "admin" ? <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>ADMIN</Text></View> : null}</View>
            {item.role === "user" ? <><View style={styles.expiryRow}><TextInput value={days[item.id] ?? ""} onChangeText={(value) => setDaysValue((current) => ({ ...current, [item.id]: value.replace(/[^0-9]/g, "") }))} placeholder="Số ngày" placeholderTextColor="#94A3B8" keyboardType="number-pad" style={styles.daysInput} /><Pressable onPress={() => void applyDays(item.id)} style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}><Text style={styles.primaryText}>Đặt hạn</Text></Pressable><Pressable onPress={() => void clearExpiry.mutateAsync({ userId: item.id }).catch(() => undefined)} style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}><MaterialIcons name="all-inclusive" size={19} color="#475569" /></Pressable></View><Pressable onPress={() => confirmDelete(item.id, item.displayName)} style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}><MaterialIcons name="delete-outline" size={18} color="#C2410C" /><Text style={styles.deleteText}>Xóa người dùng và dữ liệu của họ</Text></Pressable></> : null}
          </View>
        ))}
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, paddingBottom: 36, gap: 14 }, header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 4 }, back: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#EDE9FE" }, kicker: { color: "#7C3AED", fontSize: 11, letterSpacing: 1.4, fontWeight: "800" }, title: { color: "#172033", fontSize: 26, fontWeight: "800" }, notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 16, backgroundColor: "#F5F3FF" }, noticeText: { color: "#4C3C75", flex: 1, fontSize: 13, lineHeight: 19 }, storageLink: { flexDirection: "row", alignItems: "center", gap: 12, padding: 15, borderRadius: 19, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDD6FE" }, storageLinkIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#EDE9FE" }, storageLinkBody: { flex: 1 }, storageLinkTitle: { color: "#312E81", fontSize: 15, fontWeight: "800" }, storageLinkText: { color: "#64748B", marginTop: 3, fontSize: 12, lineHeight: 17 }, loading: { marginVertical: 42 }, card: { padding: 16, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0", gap: 13 }, row: { flexDirection: "row", alignItems: "center", gap: 12 }, avatar: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "#EDE9FE" }, avatarText: { color: "#6D28D9", fontSize: 19, fontWeight: "800" }, userInfo: { flex: 1 }, name: { color: "#172033", fontSize: 16, fontWeight: "800" }, username: { color: "#64748B", marginTop: 2, fontSize: 13 }, expiry: { color: "#16713B", marginTop: 5, fontSize: 12, fontWeight: "700" }, expired: { color: "#C92A2A" }, adminBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, backgroundColor: "#EDE9FE" }, adminBadgeText: { color: "#6D28D9", fontSize: 10, fontWeight: "800" }, expiryRow: { flexDirection: "row", gap: 8, alignItems: "center" }, daysInput: { flex: 1, height: 44, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#F8FAFC", borderWidth: 1, borderColor: "#CBD5E1", color: "#172033" }, primaryButton: { height: 44, justifyContent: "center", paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#6D28D9" }, primaryText: { color: "#FFF", fontWeight: "800", fontSize: 13 }, clearButton: { width: 44, height: 44, justifyContent: "center", alignItems: "center", borderRadius: 12, backgroundColor: "#F1F5F9" }, deleteButton: { minHeight: 42, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#FFF7ED", flexDirection: "row", alignItems: "center", gap: 8 }, deleteText: { color: "#C2410C", fontWeight: "700", fontSize: 13 }, pressed: { opacity: 0.7 },
});
