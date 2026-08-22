import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { formatStorageGb, storageUsagePercent } from "@/lib/storage-usage";
import { trpc } from "@/lib/trpc";

function formatTime(value: Date | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Không rõ thời điểm" : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

export default function AdminStorageScreen() {
  const { user, loading } = useAuth();
  const usage = trpc.admin.storageSummary.useQuery(undefined, { enabled: user?.role === "admin" });

  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#7C3AED" /></ScreenContainer>;
  if (!user) return <Redirect href="/login" />;
  if (user.role !== "admin") return <Redirect href="/(tabs)/profile" />;

  const data = usage.data;
  const percentage = data ? storageUsagePercent(data.usedBytes, data.quotaBytes) : 0;

  return <ScreenContainer edges={["top", "bottom", "left", "right"]}><ScrollView contentContainerStyle={styles.wrap}>
    <View style={styles.header}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Quay lại quản trị"><MaterialIcons name="arrow-back" size={24} color="#312E81" /></Pressable><View><Text style={styles.kicker}>QUẢN TRỊ</Text><Text style={styles.title}>Dung lượng lưu trữ</Text></View></View>
    <View style={styles.notice}><MaterialIcons name="info-outline" size={20} color="#6D28D9" /><Text style={styles.noticeText}>Số liệu quét các media đã ghi nhận trong tin nhắn. Kho riêng tư hiện không cung cấp API liệt kê object, vì vậy tệp chưa hoàn tất gửi, avatar và ảnh nền không có kích thước metadata sẽ không được cộng vào tổng này.</Text></View>
    {usage.isLoading ? <ActivityIndicator color="#7C3AED" style={styles.loading} /> : null}
    {data ? <><View style={styles.usageCard}><View style={styles.usageTop}><View><Text style={styles.usageLabel}>ĐÃ DÙNG</Text><Text style={styles.usageValue}>{formatStorageGb(data.usedBytes)} GB <Text style={styles.usageQuota}>/ {formatStorageGb(data.quotaBytes, 0)} GB</Text></Text></View><View style={styles.storageIcon}><MaterialIcons name="storage" size={27} color="#6D28D9" /></View></View><View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(1, percentage)}%` }]} /></View><Text style={styles.usageHint}>{data.mediaCount} tin nhắn có media đã được đối chiếu · {percentage.toLocaleString("vi-VN", { maximumFractionDigits: 3 })}% quota</Text></View>
      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>5 tin nhắn media gần nhất</Text><Text style={styles.sectionSub}>Dựa trên metadata đã lưu khi hoàn tất upload.</Text></View><Pressable onPress={() => void usage.refetch()} style={({ pressed }) => [styles.refresh, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Làm mới dung lượng"><MaterialIcons name="refresh" size={19} color="#6D28D9" /></Pressable></View>
      {data.recentMedia.length ? data.recentMedia.map((item) => <View key={item.id} style={styles.mediaRow}><View style={styles.mediaIcon}><MaterialIcons name={item.contentType === "video" ? "videocam" : "image"} size={20} color="#6D28D9" /></View><View style={styles.mediaInfo}><Text style={styles.mediaName} numberOfLines={1}>{item.mediaName ?? (item.contentType === "video" ? "Video" : "Ảnh")}</Text><Text style={styles.mediaMeta}>{item.senderName} · {formatTime(item.createdAt)}</Text></View><Text style={styles.mediaSize}>{formatStorageGb(item.mediaSize ?? 0)} GB</Text></View>) : <View style={styles.empty}><MaterialIcons name="perm-media" size={27} color="#94A3B8" /><Text style={styles.emptyText}>Chưa có ảnh hoặc video được ghi nhận.</Text></View>}</> : null}
    {usage.error ? <View style={styles.error}><MaterialIcons name="error-outline" size={20} color="#B4232C" /><Text style={styles.errorText}>Không thể tải số liệu lưu trữ. Hãy chạm nút làm mới để thử lại.</Text></View> : null}
  </ScrollView></ScreenContainer>;
}

const styles = StyleSheet.create({
  wrap: { padding: 20, paddingBottom: 36, gap: 14 }, header: { flexDirection: "row", alignItems: "center", gap: 13, marginBottom: 4 }, back: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "#EDE9FE" }, kicker: { color: "#7C3AED", fontSize: 11, letterSpacing: 1.4, fontWeight: "800" }, title: { color: "#172033", fontSize: 26, fontWeight: "800" }, notice: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 16, backgroundColor: "#F5F3FF" }, noticeText: { color: "#4C3C75", flex: 1, fontSize: 13, lineHeight: 19 }, loading: { marginVertical: 42 }, usageCard: { padding: 18, borderRadius: 22, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#DDD6FE", gap: 14 }, usageTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, usageLabel: { color: "#7C3AED", fontSize: 11, fontWeight: "800", letterSpacing: 1.1 }, usageValue: { color: "#172033", marginTop: 5, fontSize: 23, fontWeight: "800" }, usageQuota: { color: "#64748B", fontSize: 16 }, storageIcon: { width: 50, height: 50, borderRadius: 16, justifyContent: "center", alignItems: "center", backgroundColor: "#EDE9FE" }, barTrack: { height: 9, overflow: "hidden", borderRadius: 8, backgroundColor: "#EDE9FE" }, barFill: { height: "100%", minWidth: 4, borderRadius: 8, backgroundColor: "#7C3AED" }, usageHint: { color: "#64748B", fontSize: 12, lineHeight: 18 }, sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 6 }, sectionTitle: { color: "#172033", fontSize: 17, fontWeight: "800" }, sectionSub: { color: "#64748B", marginTop: 3, fontSize: 12 }, refresh: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 13, backgroundColor: "#F5F3FF" }, mediaRow: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 11, padding: 13, borderRadius: 17, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E2E8F0" }, mediaIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#F5F3FF" }, mediaInfo: { flex: 1, minWidth: 0 }, mediaName: { color: "#172033", fontSize: 14, fontWeight: "700" }, mediaMeta: { color: "#64748B", marginTop: 4, fontSize: 11 }, mediaSize: { color: "#475569", fontSize: 11, fontWeight: "700" }, empty: { minHeight: 126, alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 18, backgroundColor: "#F8FAFC" }, emptyText: { color: "#64748B", fontSize: 13 }, error: { flexDirection: "row", gap: 9, padding: 14, borderRadius: 16, backgroundColor: "#FFF0F1" }, errorText: { flex: 1, color: "#9F2D35", fontSize: 13, lineHeight: 18 }, pressed: { opacity: 0.7 },
});
