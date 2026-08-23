import { ProfileAvatar } from "@/components/profile-avatar";
import { ScreenContainer } from "@/components/screen-container";
import { useAuth } from "@/hooks/use-auth";
import { uploadMediaDirectly, resolveMediaUploadUri } from "@/lib/direct-media-upload";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

const MAX_GROUP_MEMBERS = 50;
type SelectedAvatar = { uri: string; size: number };
type ScreenMode = "members" | "add";

export default function GroupSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Number(id);
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const groupDetails = trpc.conversations.groupDetails.useQuery({ conversationId }, { enabled: Boolean(user) && Number.isInteger(conversationId) && conversationId > 0 });
  const groupMembers = trpc.conversations.groupMembers.useQuery({ conversationId }, { enabled: Boolean(user) && Number.isInteger(conversationId) && conversationId > 0 });
  const contacts = trpc.friends.contacts.useQuery(undefined, { enabled: Boolean(user) });
  const requestAvatarUpload = trpc.conversations.requestGroupAvatarUpload.useMutation();
  const updateGroup = trpc.conversations.updateGroup.useMutation();
  const addMembers = trpc.conversations.addGroupMembers.useMutation();
  const removeMember = trpc.conversations.removeGroupMember.useMutation();
  const updateMemberRole = trpc.conversations.updateGroupMemberRole.useMutation();
  const [mode, setMode] = useState<ScreenMode>("members");
  const [title, setTitle] = useState("");
  const [avatar, setAvatar] = useState<SelectedAvatar | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const group = groupDetails.data;
  const members = useMemo(() => groupMembers.data ?? [], [groupMembers.data]);
  const myMembership = members.find((member) => member.id === user?.id);
  const canManage = myMembership?.groupRole === "owner" || myMembership?.groupRole === "admin";
  const isOwner = myMembership?.groupRole === "owner";
  const remainingSlots = Math.max(0, MAX_GROUP_MEMBERS - members.length);
  const memberIds = useMemo(() => new Set(members.map((member) => member.id)), [members]);
  const availableContacts = useMemo(() => (contacts.data ?? []).filter((contact) => !memberIds.has(contact.id)), [contacts.data, memberIds]);
  const savingGroup = requestAvatarUpload.isPending || updateGroup.isPending;
  const changingMembers = addMembers.isPending || removeMember.isPending || updateMemberRole.isPending;

  useEffect(() => {
    if (group?.title) setTitle(group.title);
  }, [group?.title]);

  if (loading || groupDetails.isLoading || groupMembers.isLoading) {
    return <ScreenContainer className="items-center justify-center"><ActivityIndicator color="#1769D4" /></ScreenContainer>;
  }
  if (!user) return <Redirect href={"/login" as never} />;
  if (!Number.isInteger(conversationId) || conversationId <= 0) return <Redirect href={"/(tabs)" as never} />;
  if (!group) {
    return (
      <ScreenContainer className="items-center justify-center px-6">
        <MaterialIcons name="group-off" size={40} color="#6483A9" />
        <Text style={styles.errorTitle}>Không mở được nhóm</Text>
        <Text style={styles.errorText}>Bạn có thể đã không còn là thành viên của nhóm này.</Text>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>Quay lại</Text></Pressable>
      </ScreenContainer>
    );
  }

  const refreshGroup = () => {
    void utils.conversations.groupDetails.invalidate({ conversationId });
    void utils.conversations.groupMembers.invalidate({ conversationId });
    void utils.conversations.list.invalidate();
  };

  const chooseAvatar = async () => {
    if (!canManage) return;
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

  const saveGroup = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return Alert.alert("Thiếu tên nhóm", "Tên nhóm không được để trống.");
    try {
      let avatarKey: string | undefined;
      if (avatar) {
        const upload = await requestAvatarUpload.mutateAsync({ conversationId, mimeType: "image/jpeg", size: avatar.size });
        await uploadMediaDirectly({ uri: avatar.uri, uploadUrl: upload.uploadUrl, mimeType: "image/jpeg", onProgress: setUploadProgress });
        avatarKey = upload.key;
      }
      await updateGroup.mutateAsync({ conversationId, title: trimmedTitle, ...(avatarKey ? { avatarKey } : {}) });
      setAvatar(null);
      setUploadProgress(0);
      refreshGroup();
    } catch (error) {
      Alert.alert("Chưa thể cập nhật nhóm", error instanceof Error ? error.message : "Vui lòng thử lại sau giây lát.");
    }
  };

  const toggleContact = (userId: number) => {
    setSelectedIds((current) => {
      if (current.includes(userId)) return current.filter((item) => item !== userId);
      if (current.length >= remainingSlots) {
        Alert.alert("Đã đủ thành viên", "Một nhóm có tối đa 50 người.");
        return current;
      }
      return [...current, userId];
    });
  };

  const submitAddMembers = async () => {
    if (!selectedIds.length) return;
    try {
      await addMembers.mutateAsync({ conversationId, userIds: selectedIds });
      setSelectedIds([]);
      setMode("members");
      refreshGroup();
    } catch (error) {
      Alert.alert("Không thể thêm thành viên", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };

  const confirmRemove = (member: (typeof members)[number]) => {
    Alert.alert("Xóa thành viên?", `Xóa ${member.displayName} khỏi nhóm này?`, [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa", style: "destructive", onPress: () => {
          void removeMember.mutateAsync({ conversationId, userId: member.id })
            .then(refreshGroup)
            .catch((error: unknown) => Alert.alert("Không thể xóa", error instanceof Error ? error.message : "Vui lòng thử lại."));
        },
      },
    ]);
  };

  const confirmRole = (member: (typeof members)[number]) => {
    const promote = member.groupRole !== "admin";
    Alert.alert(promote ? "Cấp quyền quản trị?" : "Thu quyền quản trị?", promote ? `${member.displayName} có thể thêm/xóa thành viên và đổi thông tin nhóm.` : `${member.displayName} sẽ trở lại vai trò thành viên.`, [
      { text: "Hủy", style: "cancel" },
      {
        text: promote ? "Cấp quyền" : "Thu quyền", onPress: () => {
          void updateMemberRole.mutateAsync({ conversationId, userId: member.id, role: promote ? "admin" : "member" })
            .then(refreshGroup)
            .catch((error: unknown) => Alert.alert("Không thể cập nhật quyền", error instanceof Error ? error.message : "Vui lòng thử lại."));
        },
      },
    ]);
  };

  const data = mode === "members" ? members : availableContacts;

  return (
    <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#EDF6FF]">
      <FlatList
        data={data}
        key={mode}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <View style={styles.header}>
              <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]} accessibilityLabel="Quay lại"><MaterialIcons name="arrow-back" size={23} color="#103A74" /></Pressable>
              <Text style={styles.headerTitle}>Thông tin nhóm</Text>
              <View style={styles.headerSpacer} />
            </View>
            <View style={styles.identityCard}>
              <Pressable disabled={!canManage} onPress={() => void chooseAvatar()} style={({ pressed }) => [styles.avatarControl, canManage && pressed && styles.pressed]} accessibilityLabel="Đổi avatar nhóm">
                <ProfileAvatar name={group.title} avatarUrl={avatar?.uri ?? group.avatarUrl} size={78} />
                {canManage ? <View style={styles.avatarEdit}><MaterialIcons name="photo-camera" size={16} color="#FFFFFF" /></View> : null}
              </Pressable>
              <View style={styles.identityText}><Text numberOfLines={2} style={styles.groupTitle}>{group.title}</Text><Text style={styles.memberMeta}>{members.length}/{MAX_GROUP_MEMBERS} thành viên</Text><Text style={styles.roleMeta}>{isOwner ? "Bạn là người tạo nhóm" : canManage ? "Bạn là quản trị viên" : "Thành viên nhóm"}</Text></View>
            </View>
            {canManage ? (
              <View style={styles.editCard}>
                <Text style={styles.inputLabel}>TÊN NHÓM</Text>
                <TextInput value={title} onChangeText={setTitle} maxLength={80} style={styles.titleInput} placeholder="Tên nhóm" placeholderTextColor="#8297B3" returnKeyType="done" />
                <Pressable onPress={() => void saveGroup()} disabled={savingGroup} style={({ pressed }) => [styles.saveButton, (pressed || savingGroup) && styles.pressed]}>
                  {savingGroup ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="check" size={19} color="#FFFFFF" />}
                  <Text style={styles.saveButtonText}>{savingGroup ? (uploadProgress ? `Đang tải ${uploadProgress}%` : "Đang lưu…") : "Lưu thông tin nhóm"}</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.sectionTabs}>
              <Pressable onPress={() => setMode("members")} style={({ pressed }) => [styles.tab, mode === "members" && styles.tabActive, pressed && styles.pressed]}><Text style={[styles.tabText, mode === "members" && styles.tabTextActive]}>Thành viên ({members.length})</Text></Pressable>
              {canManage ? <Pressable onPress={() => setMode("add")} style={({ pressed }) => [styles.tab, mode === "add" && styles.tabActive, pressed && styles.pressed]}><Text style={[styles.tabText, mode === "add" && styles.tabTextActive]}>Thêm bạn</Text></Pressable> : null}
            </View>
            {mode === "add" ? <Text style={styles.sectionHint}>Chọn tối đa {remainingSlots} người để nhóm không vượt quá 50 thành viên.</Text> : null}
          </View>
        }
        renderItem={({ item }) => {
          if (mode === "members") {
            const member = item as (typeof members)[number];
            return (
              <View style={styles.memberRow}>
                <ProfileAvatar name={member.displayName} avatarUrl={member.avatarUrl} size={46} />
                <View style={styles.memberInfo}><Text numberOfLines={1} style={styles.memberName}>{member.displayName}{member.id === user.id ? " (Bạn)" : ""}</Text><Text numberOfLines={1} style={styles.memberRole}>{member.groupRole === "owner" ? "Người tạo nhóm" : member.groupRole === "admin" ? "Quản trị viên" : `@${member.username}`}</Text></View>
                {canManage && member.groupRole !== "owner" ? <Pressable onPress={() => confirmRemove(member)} disabled={changingMembers} style={({ pressed }) => [styles.memberAction, pressed && styles.pressed]} accessibilityLabel={`Xóa ${member.displayName} khỏi nhóm`}><MaterialIcons name="person-remove" size={19} color="#C2410C" /></Pressable> : null}
                {isOwner && member.groupRole !== "owner" ? <Pressable onPress={() => confirmRole(member)} disabled={changingMembers} style={({ pressed }) => [styles.memberAction, pressed && styles.pressed]} accessibilityLabel={member.groupRole === "admin" ? `Thu quyền quản trị của ${member.displayName}` : `Cấp quyền quản trị cho ${member.displayName}`}><MaterialIcons name="admin-panel-settings" size={19} color="#1769D4" /></Pressable> : null}
              </View>
            );
          }
          const contact = item as (typeof availableContacts)[number];
          return (
            <Pressable onPress={() => toggleContact(contact.id)} style={({ pressed }) => [styles.memberRow, selectedIds.includes(contact.id) && styles.selectedRow, pressed && styles.pressed]} accessibilityRole="checkbox" accessibilityState={{ checked: selectedIds.includes(contact.id) }} accessibilityLabel={`Chọn ${contact.displayName}`}>
              <ProfileAvatar name={contact.displayName} avatarUrl={contact.avatarUrl} size={46} />
              <View style={styles.memberInfo}><Text numberOfLines={1} style={styles.memberName}>{contact.displayName}</Text><Text numberOfLines={1} style={styles.memberRole}>@{contact.username}</Text></View>
              <View style={[styles.check, selectedIds.includes(contact.id) && styles.checkActive]}>{selectedIds.includes(contact.id) ? <MaterialIcons name="check" size={17} color="#FFFFFF" /> : null}</View>
            </Pressable>
          );
        }}
        ListEmptyComponent={<View style={styles.empty}><MaterialIcons name={mode === "members" ? "group-off" : "person-add-disabled"} size={34} color="#6483A9" /><Text style={styles.emptyText}>{mode === "members" ? "Nhóm chưa có thành viên." : "Không còn bạn bè nào để thêm vào nhóm."}</Text></View>}
        ListFooterComponent={mode === "add" ? <Pressable onPress={() => void submitAddMembers()} disabled={!selectedIds.length || changingMembers} style={({ pressed }) => [styles.addButton, (!selectedIds.length || changingMembers || pressed) && styles.pressed]}><Text style={styles.addButtonText}>{changingMembers ? "Đang thêm…" : `Thêm ${selectedIds.length} thành viên`}</Text>{changingMembers ? <ActivityIndicator color="#FFFFFF" /> : <MaterialIcons name="person-add" size={20} color="#FFFFFF" />}</Pressable> : <View style={styles.bottomSpace} />}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingBottom: 28 },
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 62, paddingHorizontal: 16 },
  backButton: { alignItems: "center", backgroundColor: "#FFFFFFC9", borderRadius: 14, height: 42, justifyContent: "center", width: 42 },
  headerTitle: { color: "#103A74", fontSize: 18, fontWeight: "800" },
  headerSpacer: { width: 42 },
  identityCard: { alignItems: "center", backgroundColor: "#1769D4", flexDirection: "row", gap: 14, marginHorizontal: 16, padding: 17, borderRadius: 22 },
  avatarControl: { position: "relative" },
  avatarEdit: { alignItems: "center", backgroundColor: "#0C4DA5", borderColor: "#FFFFFF", borderRadius: 14, borderWidth: 2, bottom: -2, height: 28, justifyContent: "center", position: "absolute", right: -3, width: 28 },
  identityText: { flex: 1, minWidth: 0 },
  groupTitle: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  memberMeta: { color: "#D5E9FF", fontSize: 13, fontWeight: "700", marginTop: 5 },
  roleMeta: { color: "#B5D5FF", fontSize: 12, marginTop: 3 },
  editCard: { backgroundColor: "#FFFFFF", borderColor: "#DCEAF8", borderRadius: 20, borderWidth: 1, marginHorizontal: 16, marginTop: 14, padding: 16 },
  inputLabel: { color: "#6684A8", fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  titleInput: { borderBottomColor: "#CFDEEF", borderBottomWidth: 1, color: "#173F6C", fontSize: 16, fontWeight: "700", marginTop: 5, minHeight: 42 },
  saveButton: { alignItems: "center", backgroundColor: "#1769D4", borderRadius: 13, flexDirection: "row", gap: 7, justifyContent: "center", marginTop: 14, minHeight: 46 },
  saveButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  sectionTabs: { flexDirection: "row", gap: 10, marginHorizontal: 16, marginTop: 20 },
  tab: { alignItems: "center", backgroundColor: "#E3EEF9", borderRadius: 12, flex: 1, minHeight: 42, justifyContent: "center", paddingHorizontal: 10 },
  tabActive: { backgroundColor: "#1769D4" },
  tabText: { color: "#54799E", fontSize: 13, fontWeight: "800" },
  tabTextActive: { color: "#FFFFFF" },
  sectionHint: { color: "#6684A8", fontSize: 12, lineHeight: 17, marginHorizontal: 17, marginTop: 10 },
  memberRow: { alignItems: "center", backgroundColor: "#FFFFFFDE", borderColor: "#DCEAF8", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 10, marginHorizontal: 16, marginTop: 10, minHeight: 68, padding: 10 },
  selectedRow: { backgroundColor: "#EAF4FF", borderColor: "#4E91ED" },
  memberInfo: { flex: 1, minWidth: 0 },
  memberName: { color: "#173F6C", fontSize: 15, fontWeight: "800" },
  memberRole: { color: "#718EAC", fontSize: 12.5, marginTop: 3 },
  memberAction: { alignItems: "center", backgroundColor: "#F1F7FF", borderRadius: 12, height: 36, justifyContent: "center", width: 36 },
  check: { alignItems: "center", borderColor: "#A2B9D1", borderRadius: 13, borderWidth: 1.5, height: 26, justifyContent: "center", width: 26 },
  checkActive: { backgroundColor: "#1769D4", borderColor: "#1769D4" },
  empty: { alignItems: "center", gap: 9, paddingHorizontal: 28, paddingTop: 50 },
  emptyText: { color: "#6B86A5", fontSize: 14, fontWeight: "600", textAlign: "center" },
  addButton: { alignItems: "center", backgroundColor: "#1769D4", borderRadius: 14, flexDirection: "row", gap: 8, justifyContent: "center", marginHorizontal: 16, marginTop: 18, minHeight: 50 },
  addButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  bottomSpace: { height: 16 },
  errorTitle: { color: "#173F6C", fontSize: 18, fontWeight: "800", marginTop: 12 },
  errorText: { color: "#6684A8", fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: "center" },
  secondaryButton: { backgroundColor: "#E3EEF9", borderRadius: 12, marginTop: 18, paddingHorizontal: 16, paddingVertical: 11 },
  secondaryButtonText: { color: "#1769D4", fontSize: 14, fontWeight: "800" },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
