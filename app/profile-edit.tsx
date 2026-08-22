import { ProfileAvatar } from "@/components/profile-avatar";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { uploadMediaDirectly, resolveMediaUploadUri } from "@/lib/direct-media-upload";
import * as Auth from "@/lib/_core/auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type SelectedAvatar = { uri: string; size: number };

export default function ProfileEditScreen() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatar, setAvatar] = useState<SelectedAvatar | null>(null);
  const [progress, setProgress] = useState(0);
  const requestUpload = trpc.profile.requestAvatarUpload.useMutation();
  const updateProfile = trpc.profile.update.useMutation();
  const saving = requestUpload.isPending || updateProfile.isPending;

  if (!user) return null;

  const chooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Cần quyền thư viện ảnh", "Hãy cho phép ChatPHT truy cập ảnh để đặt ảnh đại diện.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
      selectionLimit: 1,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      const sourceUri = await resolveMediaUploadUri(asset.uri, asset.assetId);
      const context = ImageManipulator.manipulate(sourceUri);
      context.resize({ width: 1024, height: 1024 });
      const rendered = await context.renderAsync();
      const normalized = await rendered.saveAsync({ compress: 0.78, format: SaveFormat.JPEG });
      const info = await FileSystem.getInfoAsync(normalized.uri);
      const size = info.exists && "size" in info && typeof info.size === "number" ? info.size : 0;
      if (!size) throw new Error("Không thể chuẩn bị tệp ảnh từ thư viện.");
      if (size > 4 * 1024 * 1024) throw new Error("Ảnh sau khi tối ưu vẫn vượt quá 4 MB.");
      setAvatar({ uri: normalized.uri, size });
    } catch (error) {
      Alert.alert("Không thể chuẩn bị ảnh", error instanceof Error ? error.message : "Vui lòng chọn ảnh khác.");
    }
  };

  const save = async () => {
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      Alert.alert("Tên chưa hợp lệ", "Tên hiển thị cần có ít nhất 2 ký tự.");
      return;
    }
    try {
      let avatarKey: string | undefined;
      if (avatar) {
        const mimeType = "image/jpeg" as const;
        const upload = await requestUpload.mutateAsync({ filename: "avatar.jpg", mimeType, size: avatar.size });
        await uploadMediaDirectly({ uri: avatar.uri, uploadUrl: upload.uploadUrl, mimeType, onProgress: setProgress });
        avatarKey = upload.key;
      }
      const updated = await updateProfile.mutateAsync({ displayName: trimmedName, ...(avatarKey ? { avatarKey } : {}) });
      await Auth.setUserInfo(updated);
      router.back();
    } catch (error) {
      Alert.alert("Chưa thể lưu hồ sơ", error instanceof Error ? error.message : "Vui lòng thử lại sau giây lát.");
    }
  };

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#EEF7FF]">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={styles.iconButton} accessibilityLabel="Quay lại">
            <MaterialIcons name="arrow-back" size={22} color="#103A74" />
          </Pressable>
          <Text style={styles.title}>Chỉnh sửa hồ sơ</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.hero}>
          <View style={styles.avatarWrap}>
            <ProfileAvatar name={displayName || user.displayName} avatarUrl={avatar ? avatar.uri : user.avatarUrl} size={112} style={styles.avatar} />
            <Pressable onPress={chooseAvatar} style={({ pressed }) => [styles.cameraButton, pressed && styles.pressed]} accessibilityLabel="Đổi ảnh đại diện">
              <MaterialIcons name="photo-camera" size={20} color="#FFFFFF" />
            </Pressable>
          </View>
          <Text style={styles.heroTitle}>Hồ sơ của bạn</Text>
          <Text style={styles.heroCaption}>Chọn ảnh vuông rõ mặt để bạn bè dễ nhận ra.</Text>
          <Pressable onPress={chooseAvatar} style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
            <MaterialIcons name="image" size={18} color="#1769D4" />
            <Text style={styles.linkText}>Đổi ảnh đại diện</Text>
          </Pressable>
        </View>

        <View style={styles.formCard}>
          <Text style={styles.label}>TÊN HIỂN THỊ</Text>
          <TextInput value={displayName} onChangeText={setDisplayName} maxLength={48} placeholder="Tên của bạn" placeholderTextColor="#8FA0B8" style={styles.input} returnKeyType="done" />
          <Text style={styles.helper}>Tên này sẽ xuất hiện trong danh bạ và hội thoại.</Text>
          <View style={styles.usernameRow}>
            <MaterialIcons name="alternate-email" size={19} color="#3D78C9" />
            <View style={{ flex: 1 }}>
              <Text style={styles.usernameLabel}>TÊN NGƯỜI DÙNG</Text>
              <Text style={styles.username}>@{user.username}</Text>
            </View>
            <MaterialIcons name="lock-outline" size={19} color="#8A9BB1" />
          </View>
        </View>

        <Pressable onPress={save} disabled={saving} style={({ pressed }) => [styles.saveButton, (pressed || saving) && styles.pressed]}>
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="check" size={21} color="#FFFFFF" />}
          <Text style={styles.saveText}>{saving ? (progress ? `Đang tải ${progress}%` : "Đang lưu…") : "Lưu thay đổi"}</Text>
        </Pressable>
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: { padding: 18, paddingBottom: 32 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 46 },
  headerSpacer: { width: 42 },
  iconButton: { alignItems: "center", backgroundColor: "#FFFFFFB8", borderRadius: 14, height: 42, justifyContent: "center", width: 42 },
  title: { color: "#103A74", fontSize: 18, fontWeight: "800" },
  hero: { alignItems: "center", paddingTop: 24, paddingBottom: 22 },
  avatarWrap: { position: "relative" },
  avatar: { borderColor: "#FFFFFF", borderWidth: 5, elevation: 3 },
  cameraButton: { alignItems: "center", backgroundColor: "#1769D4", borderColor: "#FFFFFF", borderRadius: 18, borderWidth: 3, bottom: -1, height: 38, justifyContent: "center", position: "absolute", right: -3, width: 38 },
  heroTitle: { color: "#153B70", fontSize: 22, fontWeight: "800", marginTop: 14 },
  heroCaption: { color: "#6C809D", fontSize: 13, marginTop: 6, textAlign: "center" },
  linkButton: { alignItems: "center", flexDirection: "row", gap: 6, marginTop: 13, padding: 8 },
  linkText: { color: "#1769D4", fontSize: 14, fontWeight: "800" },
  formCard: { backgroundColor: "#FFFFFFE6", borderColor: "#DDE9F7", borderRadius: 22, borderWidth: 1, padding: 18 },
  label: { color: "#577091", fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  input: { backgroundColor: "#F1F7FF", borderColor: "#D5E5F8", borderRadius: 14, borderWidth: 1, color: "#153B70", fontSize: 17, fontWeight: "700", marginTop: 8, paddingHorizontal: 14, paddingVertical: 13 },
  helper: { color: "#7F91A8", fontSize: 12, lineHeight: 17, marginTop: 9 },
  usernameRow: { alignItems: "center", borderTopColor: "#E6EEF8", borderTopWidth: 1, flexDirection: "row", gap: 10, marginTop: 18, paddingTop: 16 },
  usernameLabel: { color: "#7C8EA7", fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  username: { color: "#315579", fontSize: 15, fontWeight: "700", marginTop: 3 },
  saveButton: { alignItems: "center", backgroundColor: "#1769D4", borderRadius: 16, flexDirection: "row", gap: 8, justifyContent: "center", marginTop: 20, minHeight: 54 },
  saveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
