import { useAuth } from "@/hooks/use-auth";
import { trpc } from "@/lib/trpc";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type ChatMessage = {
  id: number;
  senderId: number;
  body: string | null;
  contentType: "text" | "image" | "video";
  mediaUrl: string | null;
  createdAt: Date;
};

function VideoBubble({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView style={styles.video} player={player} allowsFullscreen allowsPictureInPicture contentFit="cover" surfaceType="textureView" />;
}

async function webBase64(uri: string) {
  const blob = await (await fetch(uri)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không thể đọc tệp đã chọn."));
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

async function readBase64(uri: string) {
  if (Platform.OS === "web") return webBase64(uri);
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

function relativeTime(value: Date) {
  return new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function ChatScreen() {
  const { user, loading } = useAuth();
  const rawId = useLocalSearchParams<{ id: string }>().id;
  const conversationId = Number(rawId);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const utils = trpc.useUtils();
  const messages = trpc.messages.list.useQuery({ conversationId }, { enabled: Boolean(user) && Number.isInteger(conversationId), refetchInterval: 1800 });
  const sendText = trpc.messages.sendText.useMutation();
  const sendMedia = trpc.messages.upload.useMutation();
  const header = useMemo(() => ({ title: "Hội thoại riêng tư", subtitle: "Chỉ thành viên có thể xem tin nhắn" }), []);

  useEffect(() => {
    if (messages.data?.length) setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 20);
  }, [messages.data?.length]);

  if (loading) return <SafeAreaView style={styles.loading}><ActivityIndicator color="#2563EB" /></SafeAreaView>;
  if (!user) return <Redirect href={"/login" as never} />;
  if (!Number.isInteger(conversationId) || conversationId <= 0) return <Redirect href={"/(tabs)"} />;

  const refresh = () => { void utils.messages.list.invalidate({ conversationId }); void utils.conversations.list.invalidate(); };
  const send = async () => {
    const body = draft.trim();
    if (!body || sendText.isPending) return;
    setDraft("");
    try { await sendText.mutateAsync({ conversationId, body }); refresh(); }
    catch (error) { setDraft(body); Alert.alert("Không gửi được tin", error instanceof Error ? error.message : "Vui lòng thử lại."); }
  };
  const chooseMedia = async () => {
    if (uploading) return;
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsEditing: false, quality: 0.85, videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    const isVideo = asset.type === "video";
    const maxBytes = isVideo ? 24 * 1024 * 1024 : 8 * 1024 * 1024;
    if (asset.fileSize && asset.fileSize > maxBytes) { Alert.alert("Tệp quá lớn", isVideo ? "Video tối đa 24 MB." : "Ảnh tối đa 8 MB."); return; }
    const mimeType = asset.mimeType ?? (isVideo ? "video/mp4" : "image/jpeg");
    const filename = asset.fileName ?? `swiftchat-${Date.now()}.${isVideo ? "mp4" : "jpg"}`;
    if (!(mimeType.startsWith("image/") || mimeType === "video/mp4" || mimeType === "video/quicktime")) { Alert.alert("Định dạng chưa hỗ trợ", "Hãy chọn ảnh JPEG/PNG/WEBP/GIF hoặc video MP4/MOV."); return; }
    setUploading(true);
    try {
      const base64 = await readBase64(asset.uri);
      await sendMedia.mutateAsync({ conversationId, filename, mimeType: mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "video/mp4" | "video/quicktime", base64 });
      refresh();
    } catch (error) { Alert.alert("Không tải được tệp", error instanceof Error ? error.message : "Vui lòng thử lại bằng tệp nhỏ hơn."); }
    finally { setUploading(false); }
  };

  return <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
      <View style={styles.header}><Pressable onPress={() => router.back()} style={({pressed}) => [styles.back, pressed && styles.pressed]}><MaterialIcons name="arrow-back" size={22} color="#172554" /></Pressable><View style={styles.headerText}><Text style={styles.headerTitle}>{header.title}</Text><Text style={styles.headerSubtitle}>{header.subtitle}</Text></View><View style={styles.shield}><MaterialIcons name="shield" size={19} color="#16713B" /></View></View>
      <FlatList ref={listRef} data={(messages.data ?? []) as ChatMessage[]} keyExtractor={(item) => String(item.id)} style={styles.list} contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled" onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })} renderItem={({ item }) => {
        const mine = item.senderId === user.id;
        return <View style={[styles.messageRow, mine ? styles.mineRow : styles.theirRow]}><View style={[styles.bubble, mine ? styles.mineBubble : styles.theirBubble]}>{item.contentType === "image" && item.mediaUrl ? <Image source={item.mediaUrl} style={styles.image} contentFit="cover" transition={180} /> : null}{item.contentType === "video" && item.mediaUrl ? <VideoBubble uri={item.mediaUrl} /> : null}{item.body ? <Text style={[styles.messageText, mine && styles.mineText]}>{item.body}</Text> : null}<Text style={[styles.messageTime, mine && styles.mineTime]}>{relativeTime(item.createdAt)}</Text></View></View>;
      }} ListEmptyComponent={<View style={styles.empty}><View style={styles.emptyIcon}><MaterialIcons name="lock" size={26} color="#2563EB"/></View><Text style={styles.emptyTitle}>Không có tin nhắn nào</Text><Text style={styles.emptyText}>Bắt đầu cuộc trò chuyện riêng tư của bạn.</Text></View>} />
      <View style={styles.composer}><Pressable disabled={uploading} onPress={() => void chooseMedia()} style={({pressed}) => [styles.attach, (pressed || uploading) && styles.pressed]}>{uploading ? <ActivityIndicator color="#2563EB" size="small"/> : <MaterialIcons name="attach-file" size={23} color="#2563EB"/>}</Pressable><TextInput value={draft} onChangeText={setDraft} placeholder="Viết tin nhắn..." placeholderTextColor="#8A96A8" style={styles.input} multiline maxLength={2000} returnKeyType="send" onSubmitEditing={() => void send()} blurOnSubmit={false}/><Pressable disabled={!draft.trim() || sendText.isPending} onPress={() => void send()} style={({pressed}) => [styles.send, (!draft.trim() || sendText.isPending) && styles.sendDisabled, pressed && styles.pressed]}>{sendText.isPending ? <ActivityIndicator color="#FFF" size="small"/> : <MaterialIcons name="send" size={20} color="#FFF"/>}</Pressable></View>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:"#F6F8FC"}, loading:{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#F6F8FC"},keyboard:{flex:1},header:{height:68,paddingHorizontal:16,borderBottomWidth:1,borderBottomColor:"#E6EAF1",backgroundColor:"#F6F8FC",flexDirection:"row",alignItems:"center",gap:12},back:{height:42,width:42,borderRadius:14,alignItems:"center",justifyContent:"center",backgroundColor:"#E9EFFD"},headerText:{flex:1},headerTitle:{color:"#172554",fontSize:16,fontWeight:"800"},headerSubtitle:{marginTop:3,color:"#718096",fontSize:11.5},shield:{height:36,width:36,borderRadius:12,backgroundColor:"#ECFDF3",alignItems:"center",justifyContent:"center"},list:{flex:1},listContent:{paddingHorizontal:16,paddingVertical:14,gap:9,flexGrow:1},messageRow:{flexDirection:"row"},mineRow:{justifyContent:"flex-end"},theirRow:{justifyContent:"flex-start"},bubble:{maxWidth:"82%",borderRadius:18,paddingHorizontal:13,paddingVertical:9,overflow:"hidden"},mineBubble:{backgroundColor:"#2563EB",borderBottomRightRadius:5},theirBubble:{backgroundColor:"#E9EEF8",borderBottomLeftRadius:5},messageText:{color:"#1E293B",fontSize:15.5,lineHeight:21},mineText:{color:"#FFF"},messageTime:{color:"#718096",alignSelf:"flex-end",fontSize:10.5,marginTop:4},mineTime:{color:"#D9E5FF"},image:{width:220,height:190,borderRadius:12,marginBottom:3},video:{width:220,height:150,borderRadius:12,marginBottom:3,backgroundColor:"#172554"},empty:{flex:1,alignItems:"center",justifyContent:"center",paddingBottom:45},emptyIcon:{height:55,width:55,borderRadius:19,alignItems:"center",justifyContent:"center",backgroundColor:"#E9EFFD"},emptyTitle:{color:"#475569",fontSize:16,fontWeight:"800",marginTop:12},emptyText:{color:"#8190A5",fontSize:13,marginTop:5},composer:{paddingHorizontal:12,paddingVertical:10,borderTopWidth:1,borderColor:"#E3E8F0",backgroundColor:"#FFF",flexDirection:"row",alignItems:"flex-end",gap:8},attach:{height:43,width:43,borderRadius:14,backgroundColor:"#E9EFFD",alignItems:"center",justifyContent:"center"},input:{flex:1,maxHeight:94,minHeight:43,borderRadius:16,paddingHorizontal:14,paddingVertical:10,backgroundColor:"#F0F3F8",color:"#172554",fontSize:15.5},send:{height:43,width:43,borderRadius:14,backgroundColor:"#2563EB",alignItems:"center",justifyContent:"center"},sendDisabled:{backgroundColor:"#AAB4C5"},pressed:{opacity:.75,transform:[{scale:.97}]},
});
