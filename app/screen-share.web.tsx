import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

export default function ScreenShareWebFallback() {
  return <View style={styles.root}><Text style={styles.title}>Chia sẻ màn hình dùng ứng dụng ChatPHT</Text><Text style={styles.body}>Tính năng MediaProjection chỉ hoạt động trên Android trong bản APK đã cài.</Text><Pressable onPress={() => router.back()} style={styles.button}><Text style={styles.buttonText}>Quay lại</Text></Pressable></View>;
}
const styles = StyleSheet.create({ root: { flex: 1, justifyContent: "center", alignItems: "center", padding: 28, gap: 12 }, title: { fontSize: 20, fontWeight: "800", textAlign: "center" }, body: { textAlign: "center", color: "#475569" }, button: { backgroundColor: "#2563EB", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12 }, buttonText: { color: "#FFFFFF", fontWeight: "800" } });
