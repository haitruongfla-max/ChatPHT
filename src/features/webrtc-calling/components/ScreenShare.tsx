import { Modal, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { CallControls } from "./CallControls";
import { CallConnectionMeta } from "./CallConnectionMeta";
import { CallMediaView } from "./CallMediaView";
import type { WebRTCController } from "../types";

/** Giao diện chia sẻ: stream người kia ưu tiên lớn, gọi video có thể bật chia sẻ đồng thời. */
export function ScreenShare({ controller, peerName }: { controller: WebRTCController; peerName: string }) {
  const { state } = controller;
  return (
    <Modal visible animationType="fade" onRequestClose={() => void controller.endCall()}>
      <SafeAreaView style={styles.screen}>
        <CallMediaView stream={state.remoteStream} style={styles.remote} />
        {!state.remoteStream ? <View style={styles.waiting}><Text style={styles.waitingText}>Đang chờ nội dung được chia sẻ…</Text></View> : null}
        <View style={styles.top}><Text style={styles.name}>{peerName}</Text><Text style={styles.status}>{state.hasSystemAudio ? "Chia sẻ màn hình kèm âm thanh hệ thống" : "Đang chia sẻ màn hình"}</Text><CallConnectionMeta controller={controller} light /></View>
        <View style={styles.preview}><CallMediaView stream={state.localStream} style={styles.previewMedia} /></View>
        <View style={styles.bottom}><CallControls controller={controller} mode="screen" /></View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#020617", flex: 1 },
  remote: { ...StyleSheet.absoluteFillObject },
  waiting: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  waitingText: { color: "#CBD5E1", fontSize: 15, fontWeight: "600" },
  top: { backgroundColor: "rgba(2,6,23,0.64)", left: 0, paddingHorizontal: 20, paddingVertical: 12, position: "absolute", right: 0, top: 0 },
  name: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", textAlign: "center" },
  status: { color: "#BFDBFE", fontSize: 12, marginTop: 4, textAlign: "center" },
  preview: { backgroundColor: "#0F172A", borderColor: "rgba(255,255,255,0.54)", borderRadius: 15, borderWidth: StyleSheet.hairlineWidth, height: 108, overflow: "hidden", position: "absolute", right: 18, top: 94, width: 132 },
  previewMedia: { height: "100%", width: "100%" },
  bottom: { backgroundColor: "rgba(2,6,23,0.72)", bottom: 0, left: 0, position: "absolute", right: 0 },
});
