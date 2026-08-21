import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

/**
 * WebRTC for ChatPHT is provided by the native LiveKit integration.  The web
 * preview intentionally stays out of that bundle, so it can remain a reliable
 * place to use chat, media, security settings, and the AI assistant.
 */
export default function CallWebScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.icon}>
          <MaterialIcons name="phone-in-talk" size={40} color="#2563EB" />
        </View>
        <Text style={styles.title}>Gọi trên ứng dụng di động</Text>
        <Text style={styles.description}>
          Cuộc gọi thoại và video 1:1 của ChatPHT sử dụng quyền micro, camera và kết nối WebRTC gốc của iOS hoặc Android. Hãy mở ChatPHT trên điện thoại để thực hiện cuộc gọi an toàn qua Internet.
        </Text>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          accessibilityRole="button"
          accessibilityLabel="Quay lại hội thoại"
        >
          <MaterialIcons name="arrow-back" size={19} color="#FFFFFF" />
          <Text style={styles.buttonText}>Quay lại hội thoại</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F8FC" },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  icon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F0FF",
    marginBottom: 24,
  },
  title: { color: "#172554", fontSize: 23, lineHeight: 30, fontWeight: "800", textAlign: "center" },
  description: { color: "#64748B", fontSize: 15, lineHeight: 23, textAlign: "center", marginTop: 12, maxWidth: 410 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#2563EB",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 28,
  },
  buttonPressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
