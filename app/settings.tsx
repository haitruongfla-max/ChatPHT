import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { clearAppLockPin, hasAppLockPin, saveAppLockPin, verifyAppLockPin } from "@/lib/app-lock";
import { areChatPushNotificationsEnabled, clearStoredPushToken, ensureChatNotificationChannels, getStoredPushToken, registerForChatPushNotifications, setChatPushNotificationsEnabled, storePushToken } from "@/lib/push-notifications";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";

export default function SettingsScreen() {
  const { user } = useAuth();
  const registerDevice = trpc.notifications.registerDevice.useMutation();
  const unregisterDevice = trpc.notifications.unregisterDevice.useMutation();
  const [loading, setLoading] = useState(true);
  const [hasPin, setHasPin] = useState(false);
  const [editingPin, setEditingPin] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [savingPin, setSavingPin] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(true);
  const [savingPush, setSavingPush] = useState(false);
  const [testingNotification, setTestingNotification] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([hasAppLockPin(), areChatPushNotificationsEnabled()]).then(([pinPresent, enabled]) => {
      if (!active) return;
      setHasPin(pinPresent);
      setPushEnabled(enabled);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const normalizePin = (value: string, setter: (next: string) => void) => setter(value.replace(/\D/g, "").slice(0, 8));
  const resetPinForm = () => { setCurrentPin(""); setNewPin(""); setConfirmPin(""); setEditingPin(false); };

  const savePin = async () => {
    if (hasPin && !(await verifyAppLockPin(currentPin))) { Alert.alert("Mã chưa đúng", "Nhập đúng mã hiện tại để thay đổi khóa ứng dụng."); return; }
    if (!/^\d{4,8}$/.test(newPin)) { Alert.alert("Mã chưa hợp lệ", "Mã khóa cần gồm 4 đến 8 chữ số."); return; }
    if (newPin !== confirmPin) { Alert.alert("Mã không khớp", "Hãy nhập lại mã mới giống nhau."); return; }
    setSavingPin(true);
    try { await saveAppLockPin(newPin); setHasPin(true); resetPinForm(); Alert.alert("Đã bật khóa ứng dụng", "ChatPHT sẽ yêu cầu mã khi bạn quay lại ứng dụng."); }
    finally { setSavingPin(false); }
  };

  const disablePin = async () => {
    if (!(await verifyAppLockPin(currentPin))) { Alert.alert("Mã chưa đúng", "Nhập đúng mã hiện tại để tắt khóa ứng dụng."); return; }
    await clearAppLockPin();
    setHasPin(false);
    resetPinForm();
    Alert.alert("Đã tắt khóa ứng dụng");
  };

  const changePushEnabled = async (enabled: boolean) => {
    if (!user || savingPush) return;
    setSavingPush(true);
    try {
      if (!enabled) {
        const token = await getStoredPushToken();
        if (token) await unregisterDevice.mutateAsync({ token });
        await clearStoredPushToken();
        await setChatPushNotificationsEnabled(false);
        setPushEnabled(false);
        return;
      }
      await setChatPushNotificationsEnabled(true);
      const token = await registerForChatPushNotifications();
      if (!token) {
        await setChatPushNotificationsEnabled(false);
        setPushEnabled(false);
        Alert.alert("Chưa thể bật thông báo", "Hãy cho phép thông báo trong cài đặt hệ thống của điện thoại rồi thử lại.");
        return;
      }
      await registerDevice.mutateAsync({ token, platform: Platform.OS === "ios" ? "ios" : "android" });
      await storePushToken(token);
      setPushEnabled(true);
    } catch {
      await setChatPushNotificationsEnabled(false);
      setPushEnabled(false);
      Alert.alert("Không thể cập nhật thông báo", "Vui lòng kiểm tra kết nối mạng rồi thử lại.");
    } finally { setSavingPush(false); }
  };

  const sendLocalNotificationTest = async () => {
    if (Platform.OS === "web" || testingNotification) return;
    setTestingNotification(true);
    try {
      await ensureChatNotificationChannels();
      const current = await Notifications.getPermissionsAsync();
      const permission = current.status === "granted" ? current : await Notifications.requestPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert("Chưa được cấp quyền", "Hãy bật quyền Thông báo cho ChatPHT trong cài đặt hệ thống rồi thử lại.");
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: { title: "ChatPHT", body: "Thông báo trên thiết bị đang hoạt động.", sound: "default", data: { type: "notification_test" } },
        trigger: null,
      });
      Alert.alert("Đã gửi kiểm tra", "Bạn sẽ thấy thông báo ChatPHT ngay trên điện thoại.");
    } catch {
      Alert.alert("Chưa thể kiểm tra", "Vui lòng mở cài đặt hệ thống, cho phép thông báo và thử lại.");
    } finally {
      setTestingNotification(false);
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.top}><Pressable onPress={() => router.back()} style={({ pressed }) => [styles.back, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={23} color="#1D4ED8" /></Pressable><View><Text style={styles.kicker}>CÀI ĐẶT</Text><Text style={styles.title}>Bảo mật & thông báo</Text></View></View>

        <View style={styles.section}><Text style={styles.sectionTitle}>Khóa ứng dụng</Text><View style={styles.card}><View style={styles.row}><View style={styles.icon}><MaterialIcons name="lock-outline" size={21} color="#1D4ED8" /></View><View style={styles.rowBody}><Text style={styles.rowTitle}>{hasPin ? "Mã khóa đang bật" : "Đặt mã khóa"}</Text><Text style={styles.rowText}>{hasPin ? "Yêu cầu mã khi bạn quay lại ChatPHT." : "Bảo vệ tin nhắn bằng mã gồm 4–8 chữ số."}</Text></View><Pressable onPress={() => setEditingPin((value) => !value)} style={({ pressed }) => [styles.smallAction, pressed && styles.pressed]}><Text style={styles.smallActionText}>{hasPin ? "Đổi mã" : "Bật"}</Text></Pressable></View>
          {editingPin && <View style={styles.form}>{hasPin && <><Text style={styles.formLabel}>Mã hiện tại</Text><TextInput value={currentPin} onChangeText={(value) => normalizePin(value, setCurrentPin)} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} placeholder="••••" placeholderTextColor="#94A3B8" /></>}
            <Text style={styles.formLabel}>Mã mới</Text><TextInput value={newPin} onChangeText={(value) => normalizePin(value, setNewPin)} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} placeholder="4–8 chữ số" placeholderTextColor="#94A3B8" />
            <Text style={styles.formLabel}>Nhập lại mã mới</Text><TextInput value={confirmPin} onChangeText={(value) => normalizePin(value, setConfirmPin)} keyboardType="number-pad" secureTextEntry maxLength={8} style={styles.input} placeholder="Nhập lại mã mới" placeholderTextColor="#94A3B8" />
            <View style={styles.formActions}><Pressable onPress={resetPinForm} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><Text style={styles.cancelText}>Hủy</Text></Pressable><Pressable onPress={() => void savePin()} disabled={savingPin} style={({ pressed }) => [styles.save, savingPin && styles.disabled, pressed && styles.pressed]}>{savingPin ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveText}>Lưu mã</Text>}</Pressable></View>
            {hasPin && <Pressable onPress={() => void disablePin()} style={({ pressed }) => [styles.disable, pressed && styles.pressed]}><Text style={styles.disableText}>Tắt khóa ứng dụng</Text></Pressable>}</View>}
        </View></View>

        <View style={styles.section}><Text style={styles.sectionTitle}>Thông báo</Text><View style={styles.card}><View style={styles.row}><View style={styles.icon}><MaterialIcons name="notifications-none" size={21} color="#1D4ED8" /></View><View style={styles.rowBody}><Text style={styles.rowTitle}>Hiển thị thông báo</Text><Text style={styles.rowText}>Báo tin nhắn mới mà không hiển thị nội dung riêng tư.</Text></View><Switch value={pushEnabled} disabled={loading || savingPush} onValueChange={(value) => void changePushEnabled(value)} trackColor={{ false: "#CBD5E1", true: "#93C5FD" }} thumbColor={pushEnabled ? "#2563EB" : "#F8FAFC"} /></View><Pressable onPress={() => void sendLocalNotificationTest()} disabled={testingNotification} style={({ pressed }) => [styles.notificationTest, testingNotification && styles.disabled, pressed && styles.pressed]}><MaterialIcons name="notifications-active" size={18} color="#1D4ED8" />{testingNotification ? <ActivityIndicator color="#1D4ED8" /> : <Text style={styles.notificationTestText}>Gửi thông báo kiểm tra</Text>}</Pressable></View></View>

        <View style={styles.section}><Text style={styles.sectionTitle}>Gửi video</Text><View style={styles.card}><View style={styles.row}><View style={styles.icon}><MaterialIcons name="movie" size={21} color="#1D4ED8" /></View><View style={styles.rowBody}><Text style={styles.rowTitle}>Video tối đa 100 MB</Text><Text style={styles.rowText}>Video lớn được tải trực tiếp vào kho riêng tư để ứng dụng vẫn ổn định.</Text></View></View></View></View>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 38 }, top: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 23 }, back: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 15, backgroundColor: "#E9EFFD" }, kicker: { fontSize: 10.5, letterSpacing: 1.4, fontWeight: "800", color: "#2563EB" }, title: { marginTop: 2, fontSize: 23, lineHeight: 29, fontWeight: "800", color: "#172554" }, section: { marginBottom: 21 }, sectionTitle: { marginBottom: 8, paddingHorizontal: 3, fontSize: 12, color: "#64748B", fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.7 }, card: { borderRadius: 20, borderWidth: 1, borderColor: "#E6EAF1", overflow: "hidden", backgroundColor: "#FFF" }, row: { flexDirection: "row", alignItems: "center", gap: 11, padding: 15 }, icon: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#E9EFFD" }, rowBody: { flex: 1, minWidth: 0 }, rowTitle: { fontSize: 14.5, color: "#1E2B44", fontWeight: "800" }, rowText: { marginTop: 3, color: "#718096", fontSize: 12.5, lineHeight: 17 }, notificationTest: { minHeight: 48, borderTopWidth: 1, borderTopColor: "#E9EEF5", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#F8FAFD" }, notificationTestText: { color: "#1D4ED8", fontSize: 13, fontWeight: "800" }, smallAction: { minHeight: 34, paddingHorizontal: 11, borderRadius: 11, justifyContent: "center", backgroundColor: "#E9EFFD" }, smallActionText: { color: "#1D4ED8", fontSize: 12.5, fontWeight: "800" }, form: { borderTopWidth: 1, borderColor: "#E9EEF5", padding: 15, backgroundColor: "#F8FAFD" }, formLabel: { marginTop: 9, marginBottom: 6, color: "#475569", fontSize: 12.5, fontWeight: "700" }, input: { height: 46, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: "#CDD7E6", backgroundColor: "#FFF", fontSize: 16, color: "#172554" }, formActions: { flexDirection: "row", gap: 10, marginTop: 16 }, cancel: { flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#E9EEF5" }, cancelText: { color: "#475569", fontWeight: "800" }, save: { flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#2563EB" }, saveText: { color: "#FFF", fontWeight: "800" }, disable: { minHeight: 42, marginTop: 10, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF1F2" }, disableText: { color: "#C92A2A", fontSize: 13, fontWeight: "800" }, disabled: { opacity: 0.55 }, pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
});
