import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { CallMode, WebRTCController } from "../types";

function ControlButton({ label, icon, active, danger, onPress }: {
  label: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  active?: boolean;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.76} style={[styles.control, active && styles.controlActive, danger && styles.controlDanger]} accessibilityRole="button" accessibilityLabel={label}>
      <MaterialIcons name={icon} size={22} color="#FFFFFF" />
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Thanh điều khiển duy nhất cho cả ba chế độ; không chứa signaling hay WebRTC API. */
export function CallControls({ controller, mode }: { controller: WebRTCController; mode: CallMode }) {
  const { state } = controller;
  const canUseCamera = mode === "video";
  const canShare = mode === "video" || mode === "screen";
  return (
    <View style={styles.row}>
      <ControlButton label={state.isMuted ? "Bật mic" : "Tắt mic"} icon={state.isMuted ? "mic-off" : "mic"} active={state.isMuted} onPress={controller.toggleMute} />
      <ControlButton label={state.isSpeakerOn ? "Loa ngoài" : "Loa trong"} icon={state.isSpeakerOn ? "volume-up" : "hearing"} active={state.isSpeakerOn} onPress={() => void controller.toggleSpeaker()} />
      {canUseCamera ? <ControlButton label={state.isCameraEnabled ? "Tắt cam" : "Bật cam"} icon={state.isCameraEnabled ? "videocam" : "videocam-off"} active={!state.isCameraEnabled} onPress={() => void controller.toggleCamera()} /> : null}
      {canUseCamera ? <ControlButton label="Đổi camera" icon="flip-camera-android" onPress={() => void controller.switchCamera()} /> : null}
      {canShare ? <ControlButton label={state.isScreenSharing ? "Dừng chia sẻ" : "Chia sẻ"} icon={state.isScreenSharing ? "stop-screen-share" : "screen-share"} active={state.isScreenSharing} onPress={() => void (state.isScreenSharing ? controller.stopScreenShare() : controller.startScreenShare())} /> : null}
      <ControlButton label="Kết thúc" icon="call-end" danger onPress={() => void controller.endCall()} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", paddingHorizontal: 14, paddingVertical: 14 },
  control: { alignItems: "center", backgroundColor: "rgba(30,41,59,0.92)", borderColor: "rgba(255,255,255,0.17)", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, gap: 4, justifyContent: "center", minHeight: 58, minWidth: 62, paddingHorizontal: 8 },
  controlActive: { backgroundColor: "#1D4ED8" },
  controlDanger: { backgroundColor: "#DC2626" },
  label: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
});
