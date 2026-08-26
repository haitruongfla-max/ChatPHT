import { Modal, SafeAreaView, StyleSheet, Text, View } from "react-native";

import { CallControls } from "./CallControls";
import { CallConnectionMeta } from "./CallConnectionMeta";
import { CallMediaView } from "./CallMediaView";
import type { WebRTCController } from "../types";

/** Giao diện gọi video; remote toàn màn hình, local thu nhỏ và screen share qua cùng peer connection. */
export function VideoCall({ controller, peerName }: { controller: WebRTCController; peerName: string }) {
  const { state } = controller;
  return (
    <Modal visible animationType="fade" onRequestClose={() => void controller.endCall()}>
      <SafeAreaView style={styles.screen}>
        <CallMediaView stream={state.remoteStream} style={styles.remote} />
        {!state.remoteStream ? <View style={styles.waiting}><Text style={styles.waitingText}>{state.status === "connected" ? "Đang chờ video đối phương" : "Đang kết nối P2P…"}</Text></View> : null}
        <View style={styles.top}><Text style={styles.name}>{peerName}</Text><Text style={styles.status}>{state.isScreenSharing ? "Đang chia sẻ màn hình" : state.status === "connected" ? "Đã kết nối" : "Đang kết nối"}</Text><CallConnectionMeta controller={controller} light /></View>
        <View style={styles.local}><CallMediaView stream={state.localStream} mirror={!state.isScreenSharing} style={styles.localMedia} /></View>
        <View style={styles.bottom}><CallControls controller={controller} mode="video" /></View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: "#020617", flex: 1 },
  remote: { ...StyleSheet.absoluteFillObject },
  waiting: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  waitingText: { color: "#CBD5E1", fontSize: 15, fontWeight: "600" },
  top: { left: 20, position: "absolute", right: 20, top: 18 },
  name: { color: "#FFFFFF", fontSize: 19, fontWeight: "800", textAlign: "center" },
  status: { color: "#BFDBFE", fontSize: 13, marginTop: 4, textAlign: "center" },
  local: { backgroundColor: "#0F172A", borderColor: "rgba(255,255,255,0.54)", borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, height: 162, overflow: "hidden", position: "absolute", right: 18, top: 86, width: 112 },
  localMedia: { height: "100%", width: "100%" },
  bottom: { backgroundColor: "rgba(2,6,23,0.72)", bottom: 0, left: 0, position: "absolute", right: 0 },
});
