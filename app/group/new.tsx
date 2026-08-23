import { ProfileAvatar } from "@/components/profile-avatar";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { uploadMediaDirectly, resolveMediaUploadUri } from "@/lib/direct-media-upload";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Redirect, router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const MAX_INVITED_MEMBERS = 49;
type SelectedAvatar = { uri: string; size: number };

export default function NewGroupScreen() {
  const { user, loading } = useAuth();
  const contacts = trpc.friends.contacts.useQuery(undefined, { enabled: Boolean(user) });
  const createGroup = trpc.conversations.createGroup.useMutation();
  const requestAvatarUpload = trpc.conversations.requestGroupAvatarUpload.useMutation();
  const updateGroup = trpc.conversations.updateGroup.useMutation();
  const [title, setTitle] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [avatar, setAvatar] = useState<SelectedAvatar | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const filteredContacts = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("vi-VN");
    if (!term) return contacts.data ?? [];
    return (contacts.data ?? []).filter((contact) => `${contact.displayName} ${contact.username}`.toLocaleLowerCase("vi-VN").includes(term));
  }, [contacts.data, query]);

  const toggleMember = (id: number) => {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_INVITED_MEMBERS) {
        Alert.alert("Đã đủ thành viên", "Một nhóm có tối đa 50 người, gồm cả bạn.");
        return current;
      }
      return [...current, id];
    });
  };

  const chooseAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Cần quyền thư viện ảnh", "Hãy cho phép ChatPHT truy cập ảnh để đặt avatar nhóm.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.82, selectionLimit: 1 });
    if (result.canceled || !result.assets[0]) return;
    try {
      const sourceUri = await resolveMediaUploadUri(result.assets[0].uri, result.assets[0].assetId);
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

  const submit = async () => {
    if (!title.trim()) return Alert.alert("Thiếu tên nhóm", "Hãy đặt tên cho nhóm trước khi tạo.");
    if (!selectedIds.length) return Alert.alert("Chọn thành viên", "Chọn ít nhất một người bạn để tạo nhóm.");
    try {
      const group = await createGroup.mutateAsync({ title: title.trim(), memberIds: selectedIds });
      if (avatar) {
        const upload = await requestAvatarUpload.mutateAsync({ conversationId: group.id, mimeType: "image/jpeg", size: avatar.size });
        await uploadMediaDirectly({ uri: avatar.uri, uploadUrl: upload.uploadUrl, mimeType: "image/jpeg", onProgress: setUploadProgress });
        await updateGroup.mutateAsync({ conversationId: group.id, avatarKey: upload.key });
      }
      router.replace(`/chat/${group.id}` as never);
    } catch (error) {
      Alert.alert("Không thể tạo nhóm", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };

  if (loading) return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#1769D4" /></ScreenContainer>;
  if (!user) return <Redirect href={"/login" as never} />;

  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]} containerClassName="bg-[#EDF6FF]">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} accessibilityLabel="Quay lại"><MaterialIcons name="arrow-back" size={23} color="#FFFFFF" /></Pressable>
        <View style={styles.headerText}><Text style={styles.kicker}>NHÓM MỚI</Text><Text style={styles.title}>Tạo nhóm trò chuyện</Text></View>
        <View style={styles.memberCount}><Text style={styles.memberCountText}>{selectedIds.length + 1}/50</Text></View>
      </View>
      <View style={styles.formCard}>
        <Pressable onPress={() => void chooseAvatar()} style={({ pressed }) => [styles.groupAvatar, pressed && styles.pressed]} accessibilityLabel="Chọn avatar nhóm">
          {avatar ? <ProfileAvatar name={title || "Nhóm"} avatarUrl={avatar.uri} size={54} /> : <MaterialIcons name="groups" size={28} color="#1769D4" />}
          <View style={styles.avatarEdit}><MaterialIcons name="photo-camera" size={13} color="#FFFFFF" /></View>
        </Pressable>
        <View style={styles.formBody}><Text style={styles.label}>Tên nhóm</Text><TextInput value={title} onChangeText={setTitle} placeholder="Ví dụ: Gia đình, Lớp 12A1" placeholderTextColor="#8297B3" maxLength={80} style={styles.titleInput} returnKeyType="done" accessibilityLabel="Tên nhóm" /></View>
      </View>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Chọn thành viên</Text><Text style={styles.sectionHint}>Bạn + tối đa 49 người bạn</Text></View>
      <View style={styles.searchBox}><MaterialIcons name="search" size={20} color="#6483A9" /><TextInput value={query} onChangeText={setQuery} placeholder="Tìm trong danh bạ" placeholderTextColor="#8297B3" style={styles.searchInput} accessibilityLabel="Tìm thành viên" /></View>
      <FlatList data={filteredContacts} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled" renderItem={({ item }) => {
        const selected = selectedIds.includes(item.id);
        return <Pressable onPress={() => toggleMember(item.id)} style={({ pressed }) => [styles.memberRow, selected && styles.memberSelected, pressed && styles.pressed]} accessibilityRole="checkbox" accessibilityState={{ checked: selected }} accessibilityLabel={`Chọn ${item.displayName}`}>
          <ProfileAvatar name={item.displayName} avatarUrl={item.avatarUrl} size={46} />
          <View style={styles.memberInfo}><Text numberOfLines={1} style={styles.memberName}>{item.displayName}</Text><Text numberOfLines={1} style={styles.username}>@{item.username}</Text></View>
          <View style={[styles.check, selected && styles.checkSelected]}>{selected && <MaterialIcons name="check" size={18} color="#FFFFFF" />}</View>
        </Pressable>;
      }} ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="group-add" size={32} color="#1769D4" /><Text style={styles.emptyText}>Hãy kết bạn trước để tạo nhóm.</Text></View>} />
      <View style={styles.footer}><Pressable onPress={() => void submit()} disabled={createGroup.isPending || requestAvatarUpload.isPending || updateGroup.isPending} style={({ pressed }) => [styles.createButton, (pressed || createGroup.isPending || requestAvatarUpload.isPending || updateGroup.isPending) && styles.pressed]} accessibilityLabel="Tạo nhóm"><Text style={styles.createText}>{createGroup.isPending ? "Đang tạo nhóm..." : requestAvatarUpload.isPending || updateGroup.isPending ? (uploadProgress ? `Đang tải avatar ${uploadProgress}%` : "Đang lưu avatar...") : `Tạo nhóm (${selectedIds.length + 1})`}</Text>{createGroup.isPending || requestAvatarUpload.isPending || updateGroup.isPending ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />}</Pressable></View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", backgroundColor: "#1769D4", flexDirection: "row", gap: 12, paddingBottom: 17, paddingHorizontal: 16, paddingTop: 9 }, backButton: { alignItems: "center", height: 42, justifyContent: "center", width: 36 }, headerText: { flex: 1 }, kicker: { color: "#BBD8FF", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, title: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginTop: 2 }, memberCount: { backgroundColor: "#FFFFFF2B", borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }, memberCountText: { color: "#FFFFFF", fontSize: 12, fontWeight: "800" },
  formCard: { alignItems: "center", backgroundColor: "#FFFFFF", borderBottomColor: "#DCEAF8", borderBottomWidth: 1, flexDirection: "row", gap: 12, padding: 16 }, groupAvatar: { alignItems: "center", backgroundColor: "#E4F0FF", borderRadius: 27, height: 54, justifyContent: "center", position: "relative", width: 54 }, avatarEdit: { alignItems: "center", backgroundColor: "#1769D4", borderColor: "#FFFFFF", borderRadius: 10, borderWidth: 1.5, bottom: -1, height: 21, justifyContent: "center", position: "absolute", right: -1, width: 21 }, formBody: { flex: 1 }, label: { color: "#6684A8", fontSize: 12, fontWeight: "800" }, titleInput: { borderBottomColor: "#CFDEEF", borderBottomWidth: 1, color: "#173F6C", fontSize: 16, fontWeight: "700", marginTop: 2, minHeight: 38 },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 17, paddingTop: 17 }, sectionTitle: { color: "#173F6C", fontSize: 16, fontWeight: "800" }, sectionHint: { color: "#6B86A5", fontSize: 12 }, searchBox: { alignItems: "center", backgroundColor: "#FFFFFF", borderColor: "#DCEAF8", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 9, marginHorizontal: 15, marginTop: 10, minHeight: 46, paddingHorizontal: 12 }, searchInput: { color: "#173F6C", flex: 1, fontSize: 14, height: "100%" },
  list: { padding: 12, paddingBottom: 88 }, memberRow: { alignItems: "center", backgroundColor: "#FFFFFFDE", borderColor: "#DCEAF8", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 11, marginBottom: 8, minHeight: 68, padding: 10 }, memberSelected: { borderColor: "#4E91ED", backgroundColor: "#EAF4FF" }, memberInfo: { flex: 1, minWidth: 0 }, memberName: { color: "#173F6C", fontSize: 15, fontWeight: "800" }, username: { color: "#718EAC", fontSize: 12.5, marginTop: 3 }, check: { alignItems: "center", borderColor: "#A2B9D1", borderRadius: 13, borderWidth: 1.5, height: 26, justifyContent: "center", width: 26 }, checkSelected: { backgroundColor: "#1769D4", borderColor: "#1769D4" },
  empty: { alignItems: "center", gap: 10, paddingTop: 55 }, emptyText: { color: "#6B86A5", fontSize: 14, fontWeight: "600" }, footer: { backgroundColor: "#FFFFFF", borderTopColor: "#DCEAF8", borderTopWidth: 1, padding: 12 }, createButton: { alignItems: "center", backgroundColor: "#1769D4", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", minHeight: 50 }, createText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" }, pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
