import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { ScreenContainer } from "@/components/screen-container";

/**
 * Web preview deliberately does not import react-native-webrtc.
 * Voice P2P is validated only in the signed Android build that includes
 * the native WebRTC module.
 */
export default function VoiceCallWebFallback() {
  return (
    <ScreenContainer className="items-center justify-center p-6">
      <View style={styles.card}>
        <Text style={styles.title}>Gọi thoại P2P</Text>
        <Text style={styles.body}>
          Chức năng này chỉ chạy trong bản Android đã ký có WebRTC native.
          Bản xem trước web không tạo microphone hoặc kết nối cuộc gọi.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Quay lại cuộc trò chuyện"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Quay lại</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 20,
    padding: 24,
    backgroundColor: "#ffffff",
    borderColor: "#e5e7eb",
    borderWidth: 1,
  },
  title: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "700",
  },
  body: {
    marginTop: 12,
    color: "#4b5563",
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    alignItems: "center",
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: "#0a7ea4",
    paddingVertical: 13,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
