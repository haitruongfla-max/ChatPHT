import { StyleSheet, Text, View } from "react-native";

import type { WebRTCController } from "../types";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function CallConnectionMeta({ controller, light = false }: { controller: WebRTCController; light?: boolean }) {
  const { state } = controller;
  if (state.status !== "connected") return <Text style={[styles.pending, light && styles.lightText]}>Đang thiết lập kết nối P2P…</Text>;
  return (
    <View style={styles.row}>
      <Text style={[styles.value, light && styles.lightText]}>{formatDuration(state.durationSeconds)}</Text>
      <Text style={[styles.dot, light && styles.lightText]}>•</Text>
      <Text style={[styles.value, light && styles.lightText]}>{state.pingMs === null ? "Đang đo kết nối" : `Ping ${state.pingMs} ms`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "center", flexDirection: "row", justifyContent: "center", marginTop: 8 },
  value: { color: "#93C5FD", fontSize: 14, fontWeight: "700" },
  dot: { color: "#64748B", fontSize: 14, marginHorizontal: 8 },
  pending: { color: "#93C5FD", fontSize: 14, fontWeight: "600", marginTop: 8, textAlign: "center" },
  lightText: { color: "#E0F2FE" },
});
