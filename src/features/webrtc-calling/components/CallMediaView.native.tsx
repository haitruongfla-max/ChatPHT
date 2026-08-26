import { StyleSheet, View } from "react-native";
import { RTCView } from "react-native-webrtc";

import type { WebRTCMediaStream } from "../types";

/** Trình hiển thị stream native; không tự tạo hoặc dừng stream. */
export function CallMediaView({
  stream,
  mirror = false,
  style,
}: {
  stream: WebRTCMediaStream | null;
  mirror?: boolean;
  style?: object;
}) {
  if (!stream?.toURL) return <View style={[styles.empty, style]} />;
  return <RTCView streamURL={stream.toURL()} mirror={mirror} objectFit="cover" style={[styles.media, style]} />;
}

const styles = StyleSheet.create({
  empty: { backgroundColor: "#0F172A" },
  media: { backgroundColor: "#0F172A" },
});
