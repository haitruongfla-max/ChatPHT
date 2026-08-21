import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Image } from "expo-image";
import * as FileSystem from "expo-file-system/legacy";
import * as MediaLibrary from "expo-media-library";
import { VideoView, useVideoPlayer } from "expo-video";
import { saveChatMediaToDevice, type MediaSaveItem } from "@/lib/save-chat-media";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export type ChatMediaPreview = MediaSaveItem;

function FullScreenVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri, useCaching: true }, (instance) => {
    instance.pause();
  });

  return <VideoView style={styles.video} player={player} nativeControls allowsFullscreen allowsPictureInPicture contentFit="contain" surfaceType="textureView" />;
}

export function ChatMediaViewer({ item, onClose }: { item: ChatMediaPreview | null; onClose: () => void }) {
  const [saving, setSaving] = useState(false);

  const saveToDevice = async () => {
    if (!item || saving) return;
    setSaving(true);
    try {
      const result = await saveChatMediaToDevice(item, {
        isWeb: Platform.OS === "web",
        cacheDirectory: FileSystem.cacheDirectory,
        documentDirectory: FileSystem.documentDirectory,
        requestPermission: MediaLibrary.requestPermissionsAsync,
        download: FileSystem.downloadAsync,
        saveToLibrary: MediaLibrary.saveToLibraryAsync,
      });
      if (result === "unsupported") {
        Alert.alert("Lưu về điện thoại", "Tính năng này hoạt động trên ứng dụng iOS và Android.");
      } else if (result === "permission-denied") {
        Alert.alert("Cần quyền lưu media", "Hãy cho phép SwiftChat thêm ảnh và video vào thư viện điện thoại của bạn.");
      } else {
        Alert.alert("Đã lưu", item.type === "image" ? "Ảnh đã được lưu vào thư viện." : "Video đã được lưu vào thư viện.");
      }
    } catch (error) {
      Alert.alert("Không thể lưu media", error instanceof Error ? error.message : "Vui lòng thử lại.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={Boolean(item)} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
          <View style={styles.topBar}>
            <Pressable accessibilityRole="button" accessibilityLabel="Đóng trình xem media" onPress={onClose} style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
              <MaterialIcons name="close" size={25} color="#FFFFFF" />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Lưu media về điện thoại" disabled={saving} onPress={() => void saveToDevice()} style={({ pressed }) => [styles.saveButton, (pressed || saving) && styles.pressed]}>
              {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> : <MaterialIcons name="download" size={22} color="#FFFFFF" />}
              <Text style={styles.saveLabel}>Lưu</Text>
            </Pressable>
          </View>
          <View style={styles.mediaFrame}>{item?.type === "image" ? <Image source={{ uri: item.uri, cacheKey: `viewer-${item.uri.split("?")[0]}` }} cachePolicy="memory-disk" style={styles.image} contentFit="contain" transition={120} /> : item ? <FullScreenVideo uri={item.uri} /> : null}</View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#060B18" },
  safe: { flex: 1 },
  topBar: { minHeight: 58, paddingHorizontal: 16, alignItems: "center", justifyContent: "space-between", flexDirection: "row" },
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  saveButton: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(37,99,235,0.9)" },
  saveLabel: { color: "#FFFFFF", fontSize: 14, fontWeight: "800" },
  mediaFrame: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  video: { width: "100%", height: "100%", backgroundColor: "#000000" },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
