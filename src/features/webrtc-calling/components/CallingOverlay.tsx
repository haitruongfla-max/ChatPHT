import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Modal, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { ScreenShare } from "./ScreenShare";
import { VideoCall } from "./VideoCall";
import { VoiceCall } from "./VoiceCall";
import type { CallMode, WebRTCController } from "../types";

function modeLabel(mode: CallMode | null) {
  if (mode === "video") return "Cuộc gọi video";
  if (mode === "screen") return "Chia sẻ màn hình";
  return "Cuộc gọi thoại";
}

/** Điểm vào UI duy nhất: nhận cuộc gọi, lỗi permission và điều phối ba màn hình riêng. */
export function CallingOverlay({ controller, peerName }: { controller: WebRTCController; peerName: string }) {
  const { state } = controller;
  if (state.status === "idle" || state.status === "ended") return null;
  if (state.status === "ringing") {
    const incoming = state.direction === "incoming";
    return <Modal visible transparent animationType="fade"><SafeAreaView style={styles.modal}><View style={styles.card}><MaterialIcons name="ring-volume" size={42} color="#2563EB" /><Text style={styles.title}>{incoming ? `${modeLabel(state.mode)} đến` : `Đang gọi ${modeLabel(state.mode).toLowerCase()}`}</Text><Text style={styles.name}>{peerName}</Text><Text style={styles.detail}>{incoming ? "Kết nối P2P được mã hóa giữa hai thiết bị." : "Đang đổ chuông. Kết nối P2P sẽ bắt đầu khi người nhận trả lời."}</Text><View style={styles.actions}>{incoming ? <><TouchableOpacity style={[styles.action, styles.reject]} onPress={() => void controller.rejectIncomingCall()}><Text style={styles.actionText}>Từ chối</Text></TouchableOpacity><TouchableOpacity style={[styles.action, styles.accept]} onPress={() => void controller.answerIncomingCall()}><Text style={styles.actionText}>Trả lời</Text></TouchableOpacity></> : <TouchableOpacity style={[styles.action, styles.reject]} onPress={() => void controller.endCall()}><Text style={styles.actionText}>Hủy cuộc gọi</Text></TouchableOpacity>}</View></View></SafeAreaView></Modal>;
  }
  if (state.status === "failed") {
    return <Modal visible transparent animationType="fade"><SafeAreaView style={styles.modal}><View style={styles.card}><MaterialIcons name="error-outline" size={42} color="#DC2626" /><Text style={styles.title}>Không thể thiết lập cuộc gọi</Text><Text style={styles.detail}>{state.error ?? "Hãy kiểm tra mạng và thử lại."}</Text><TouchableOpacity style={[styles.action, styles.accept]} onPress={() => void controller.endCall()}><Text style={styles.actionText}>Đóng</Text></TouchableOpacity></View></SafeAreaView></Modal>;
  }
  if (state.mode === "video") return <VideoCall controller={controller} peerName={peerName} />;
  if (state.mode === "screen") return <ScreenShare controller={controller} peerName={peerName} />;
  return <VoiceCall controller={controller} peerName={peerName} />;
}

const styles = StyleSheet.create({
  modal: { alignItems: "center", backgroundColor: "rgba(2,6,23,0.76)", flex: 1, justifyContent: "center", padding: 24 },
  card: { alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 26, gap: 10, maxWidth: 360, padding: 28, width: "100%" },
  title: { color: "#0F172A", fontSize: 20, fontWeight: "800", textAlign: "center" },
  name: { color: "#1E3A5F", fontSize: 17, fontWeight: "700", textAlign: "center" },
  detail: { color: "#64748B", fontSize: 14, lineHeight: 20, marginBottom: 12, textAlign: "center" },
  actions: { flexDirection: "row", gap: 12, width: "100%" },
  action: { alignItems: "center", borderRadius: 14, flex: 1, paddingVertical: 13 },
  reject: { backgroundColor: "#DC2626" },
  accept: { backgroundColor: "#2563EB" },
  actionText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
});
