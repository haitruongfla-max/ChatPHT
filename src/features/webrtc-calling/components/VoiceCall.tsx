import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { CallControls } from "./CallControls";
import { CallConnectionMeta } from "./CallConnectionMeta";
import type { WebRTCController } from "../types";

const STATUS = { preparing: "Đang chuẩn bị micro", connecting: "Đang kết nối P2P", connected: "Đã kết nối", failed: "Không thể kết nối" } as const;

/** Giao diện gọi thoại độc lập; audio routing và WebRTC nằm hoàn toàn trong core hook. */
export function VoiceCall({ controller, peerName }: { controller: WebRTCController; peerName: string }) {
  const status = STATUS[controller.state.status as keyof typeof STATUS] ?? "Đang gọi";
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => void controller.endCall()}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.avatar}><MaterialIcons name="person" size={58} color="#BFDBFE" /></View>
        <Text style={styles.name}>{peerName}</Text>
        <Text style={styles.status}>{status}</Text>
        <CallConnectionMeta controller={controller} />
        <View style={styles.spacer} />
        <CallControls controller={controller} mode="voice" />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", backgroundColor: "#0F172A", flex: 1, justifyContent: "center", padding: 24 },
  avatar: { alignItems: "center", backgroundColor: "#1E3A5F", borderColor: "rgba(255,255,255,0.18)", borderRadius: 70, borderWidth: StyleSheet.hairlineWidth, height: 140, justifyContent: "center", width: 140 },
  name: { color: "#F8FAFC", fontSize: 26, fontWeight: "800", marginTop: 24, textAlign: "center" },
  status: { color: "#93C5FD", fontSize: 15, marginTop: 10 },
  spacer: { flex: 1 },
});
