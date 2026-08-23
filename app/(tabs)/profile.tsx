import { useAuth } from "@/hooks/use-auth";
import {
  downloadReleaseApk,
  getInstalledBuildCode,
  getInstalledAppVersion,
  getLatestChatPHTRelease,
  isReleaseNewer,
  openAndroidPackageInstaller,
  type ChatPHTRelease,
} from "@/lib/github-release-update";
import { trpc } from "@/lib/trpc";
import {
  clearStoredPushToken,
  getStoredPushToken,
} from "@/lib/push-notifications";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Redirect, router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ScreenContainer } from "@/components/screen-container";
import { ProfileAvatar } from "@/components/profile-avatar";

export default function ProfileScreen() {
  const { user, loading, logout, refresh } = useAuth();
  const serverLogout = trpc.auth.logout.useMutation();
  const unregisterDevice = trpc.notifications.unregisterDevice.useMutation();
  const [release, setRelease] = useState<ChatPHTRelease | null>(null);
  const [updateState, setUpdateState] = useState<"idle" | "checking" | "ready" | "downloading" | "installing">("idle");
  const [updateNote, setUpdateNote] = useState(`Bản đang cài: ${getInstalledAppVersion()}${getInstalledBuildCode() ? ` (mã ${getInstalledBuildCode()})` : ""}`);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  if (loading)
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator color="#2563EB" />
      </ScreenContainer>
    );
  if (!user) return <Redirect href={"/login" as never} />;
  const signOut = () =>
    Alert.alert("Đăng xuất", "Bạn sẽ cần đăng nhập lại trên thiết bị này.", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Đăng xuất",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getStoredPushToken();
            if (token) await unregisterDevice.mutateAsync({ token });
            await clearStoredPushToken();
            await serverLogout.mutateAsync();
          } finally {
            await logout();
            router.replace("/login" as never);
          }
        },
      },
    ]);
  const checkForUpdate = async () => {
    setUpdateState("checking");
    setDownloadProgress(null);
    try {
      const latest = await getLatestChatPHTRelease();
      setRelease(latest);
      if (isReleaseNewer(latest.version, latest.buildCode)) {
        setUpdateState("ready");
        setUpdateNote(`Có bản ${latest.version}${latest.buildCode ? ` (mã ${latest.buildCode})` : ""} — ${latest.assetName}`);
      } else {
        setUpdateState("idle");
        setUpdateNote(`Bạn đang dùng bản mới nhất (${getInstalledAppVersion()}${getInstalledBuildCode() ? ` · mã ${getInstalledBuildCode()}` : ""}).`);
      }
    } catch (error) {
      setUpdateState("idle");
      setUpdateNote("Chưa kiểm tra được bản mới. Hãy kiểm tra kết nối rồi thử lại.");
      Alert.alert("Không thể kiểm tra cập nhật", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };
  const installUpdate = async () => {
    if (!release || updateState === "downloading" || updateState === "installing") return;
    setUpdateState("downloading");
    setDownloadProgress(0);
    try {
      const apkUri = await downloadReleaseApk(release, ({ receivedBytes, totalBytes }) => {
        setDownloadProgress(totalBytes ? Math.min(1, receivedBytes / totalBytes) : null);
      });
      setUpdateState("installing");
      setUpdateNote("Đã tải xong. Android sẽ yêu cầu bạn xác nhận cài đặt.");
      await openAndroidPackageInstaller(apkUri);
    } catch (error) {
      setUpdateState("ready");
      setUpdateNote("Tải hoặc mở trình cài đặt chưa thành công. Bạn có thể thử lại hoặc tải APK từ GitHub Release.");
      Alert.alert("Không thể cập nhật", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };
  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#EDF6FF]">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.wrap}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}><Text style={styles.kicker}>CÁ NHÂN</Text><Text style={styles.title}>Bạn & riêng tư</Text><Text style={styles.heroText}>Quản lý hồ sơ, bảo mật và trải nghiệm ChatPHT của bạn.</Text></View>
        <Pressable onPress={() => router.push("/profile-edit" as never)} style={({ pressed }) => [styles.profileCard, pressed && styles.pressed]}>
          <ProfileAvatar name={user.displayName} avatarUrl={user.avatarUrl} size={62} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user.displayName}</Text>
            <Text style={styles.username}>@{user.username}</Text>
          </View>
          <View style={styles.editAvatar}><MaterialIcons name="edit" size={17} color="#1769D4" /></View>
        </Pressable>
        <View style={styles.security}>
          <View style={styles.lock}>
            <MaterialIcons name="lock" color="#16713B" size={19} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.securityTitle}>
              Dữ liệu trò chuyện được bảo vệ
            </Text>
            <Text style={styles.securityText}>
              Phiên đăng nhập lưu trong kho bảo mật của thiết bị. Máy chủ chỉ
              cấp quyền cho thành viên hội thoại.
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => router.push("/settings" as never)}
          style={({ pressed }) => [styles.settings, pressed && styles.pressed]}
        >
          <MaterialIcons name="security" size={20} color="#1D4ED8" />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Khóa ứng dụng & thông báo</Text>
            <Text style={styles.infoText}>
              Đặt mã khóa, ẩn thông báo và xem giới hạn video.
            </Text>
          </View>
          <MaterialIcons name="chevron-right" size={22} color="#94A3B8" />
        </Pressable>
        {user.role === "admin" ? (
          <Pressable
            onPress={() => router.push("/admin" as never)}
            style={({ pressed }) => [styles.admin, pressed && styles.pressed]}
          >
            <MaterialIcons name="admin-panel-settings" size={21} color="#7C3AED" />
            <View style={{ flex: 1 }}>
              <Text style={styles.infoTitle}>Quản lý người dùng</Text>
              <Text style={styles.infoText}>Đặt thời hạn sử dụng hoặc xóa tài khoản thử nghiệm.</Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color="#94A3B8" />
          </Pressable>
        ) : null}
        <View style={styles.info}>
          <MaterialIcons name="person-search" size={20} color="#2563EB" />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Tìm bạn bằng tên người dùng</Text>
            <Text style={styles.infoText}>
              Bạn bè đã chấp nhận mới có thể nhắn tin với bạn.
            </Text>
          </View>
        </View>
        <View style={styles.updateCard}>
          <View style={styles.updateIcon}><MaterialIcons name="system-update-alt" size={21} color="#0F766E" /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Cập nhật ứng dụng</Text>
            <Text style={styles.infoText}>{updateNote}</Text>
            {updateState === "downloading" ? (
              <View style={styles.progressTrack} accessibilityLabel="Tiến trình tải APK">
                <View style={[styles.progressFill, { width: `${Math.round((downloadProgress ?? 0) * 100)}%` }]} />
              </View>
            ) : null}
          </View>
          {updateState === "ready" ? (
            <Pressable onPress={() => void installUpdate()} style={({ pressed }) => [styles.updateAction, pressed && styles.pressed]} accessibilityLabel="Tải và cài bản cập nhật">
              <Text style={styles.updateActionText}>Cập nhật</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => void checkForUpdate()} disabled={updateState === "checking" || updateState === "downloading" || updateState === "installing"} style={({ pressed }) => [styles.updateCheck, pressed && styles.pressed]} accessibilityLabel="Kiểm tra bản cập nhật">
              {updateState === "checking" || updateState === "downloading" || updateState === "installing" ? <ActivityIndicator size="small" color="#0F766E" /> : <MaterialIcons name="refresh" size={20} color="#0F766E" />}
            </Pressable>
          )}
        </View>
        <View style={styles.about}>
          <View style={styles.aboutIcon}>
            <MaterialIcons name="forum" size={20} color="#1D4ED8" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>ChatPHT</Text>
            <Text style={styles.infoText}>
              Ứng dụng nhắn tin riêng tư, nhanh gọn, hỗ trợ văn bản, ảnh và
              video.
            </Text>
            <Text style={styles.creator}>Tạo bởi Phùng Hải Trường</Text>
          </View>
        </View>
        <Pressable
          onPress={signOut}
          style={({ pressed }) => [styles.logout, pressed && styles.pressed]}
        >
          <MaterialIcons name="logout" size={20} color="#C92A2A" />
          <Text style={styles.logoutText}>Đăng xuất khỏi thiết bị</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  wrap: { flexGrow: 1, paddingBottom: 30 },
  hero: { backgroundColor: "#1769D4", borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingBottom: 28, paddingHorizontal: 22, paddingTop: 11 },
  kicker: {
    color: "#BBD8FF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: {
    color: "#FFFFFF",
    fontSize: 29,
    fontWeight: "800",
    letterSpacing: -0.6,
    marginTop: 3,
  },
  heroText: { color: "#D5E8FF", fontSize: 13, lineHeight: 18, marginTop: 5 },
  profileCard: {
    marginHorizontal: 18,
    marginTop: -8,
    padding: 18,
    borderRadius: 22,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E6EAF1",
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  avatar: { backgroundColor: "#DDE7FB" },
  editAvatar: { alignItems: "center", backgroundColor: "#E8F2FF", borderRadius: 12, height: 34, justifyContent: "center", width: 34 },
  name: { color: "#172554", fontSize: 18, fontWeight: "800" },
  username: { color: "#718096", fontSize: 14, marginTop: 4 },
  security: {
    marginHorizontal: 18,
    marginTop: 18,
    padding: 16,
    borderRadius: 19,
    backgroundColor: "#ECFDF3",
    flexDirection: "row",
    gap: 12,
  },
  lock: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#D5F5E2",
    alignItems: "center",
    justifyContent: "center",
  },
  securityTitle: { color: "#17613B", fontSize: 14, fontWeight: "800" },
  securityText: {
    color: "#4E7460",
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  info: {
    marginHorizontal: 18,
    marginTop: 13,
    padding: 16,
    borderRadius: 19,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E6EAF1",
    flexDirection: "row",
    gap: 12,
  },
  updateCard: {
    marginHorizontal: 18,
    marginTop: 13,
    padding: 16,
    borderRadius: 19,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#C8F0DD",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  updateIcon: { width: 38, height: 38, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#D1FAE5" },
  updateCheck: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#D1FAE5" },
  updateAction: { minHeight: 34, borderRadius: 11, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#0F766E" },
  updateActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  progressTrack: { height: 5, marginTop: 8, borderRadius: 3, overflow: "hidden", backgroundColor: "#BBF7D0" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: "#0F766E" },
  settings: {
    marginHorizontal: 18,
    marginTop: 13,
    padding: 16,
    borderRadius: 19,
    backgroundColor: "#EEF4FF",
    borderWidth: 1,
    borderColor: "#D8E6FF",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  admin: {
    marginHorizontal: 18,
    marginTop: 13,
    padding: 16,
    borderRadius: 19,
    backgroundColor: "#F5F3FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  about: {
    marginHorizontal: 18,
    marginTop: 13,
    padding: 16,
    borderRadius: 19,
    backgroundColor: "#F8FAFF",
    borderWidth: 1,
    borderColor: "#DEE8FF",
    flexDirection: "row",
    gap: 12,
  },
  aboutIcon: {
    height: 38,
    width: 38,
    borderRadius: 13,
    backgroundColor: "#E3EDFF",
    alignItems: "center",
    justifyContent: "center",
  },
  infoTitle: { color: "#334155", fontSize: 14, fontWeight: "800" },
  infoText: { marginTop: 4, color: "#718096", fontSize: 12.5, lineHeight: 18 },
  creator: {
    marginTop: 7,
    color: "#1D4ED8",
    fontSize: 12.5,
    fontWeight: "800",
  },
  logout: {
    marginHorizontal: 18,
    marginTop: "auto",
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#F3D2D2",
    backgroundColor: "#FFF5F5",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  logoutText: { color: "#C92A2A", fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
