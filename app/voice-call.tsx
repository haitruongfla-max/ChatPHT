import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { trpc } from "@/lib/trpc";
import { VoiceP2pPeer, type VoiceConnectionState, type VoiceSignal } from "@/lib/voice-p2p.native";

const STATE_LABEL: Record<VoiceConnectionState, string> = {
  new: "Đang chuẩn bị micro",
  connecting: "Đang thiết lập kênh thoại bảo mật",
  connected: "Đã kết nối · P2P",
  recovering: "Đang kết nối lại",
  failed: "Không thể kết nối · hãy thử lại",
  closed: "Đã kết thúc",
};

export default function VoiceCallScreen() {
  const { callId } = useLocalSearchParams<{ callId: string }>();
  const utils = trpc.useUtils();
  const call = trpc.voice.get.useQuery({ callId: callId ?? "00000000-0000-0000-0000-000000000000" }, { enabled: Boolean(callId), refetchInterval: 800 });
  const iceConfig = trpc.voice.iceConfig.useQuery(
    { callId: callId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(callId && (call.data?.status === "active" || (call.data?.isCaller && call.data?.status === "ringing"))), retry: 1 },
  );
  const drain = trpc.voice.signal.drain.useQuery(
    { callId: callId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(callId && (call.data?.status === "active" || (call.data?.isCaller && call.data?.status === "ringing"))), refetchInterval: 450 },
  );
  const answer = trpc.voice.answer.useMutation();
  const decline = trpc.voice.decline.useMutation();
  const end = trpc.voice.end.useMutation();
  const sendSignal = trpc.voice.signal.send.useMutation();
  const peerRef = useRef<VoiceP2pPeer | null>(null);
  const handledSignals = useRef(new Set<number>());
  const pendingSignals = useRef<VoiceSignal[]>([]);
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>("new");
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);

  const voiceCall = call.data;
  const shouldStart = Boolean(voiceCall && iceConfig.data && (voiceCall.status === "active" || (voiceCall.isCaller && voiceCall.status === "ringing")));

  const emitSignal = useCallback(async (signal: VoiceSignal) => {
    if (!callId) return;
    await sendSignal.mutateAsync({ callId, ...signal });
  }, [callId, sendSignal]);

  useEffect(() => {
    const voiceIceServers = iceConfig.data?.iceServers;
    if (!voiceCall || !shouldStart || !voiceIceServers || peerRef.current) return;
    const peer = new VoiceP2pPeer(voiceCall.isCaller, emitSignal, setConnectionState, voiceIceServers);
    peerRef.current = peer;
    void peer.start()
      .then(async () => {
        const queued = pendingSignals.current.splice(0);
        for (const signal of queued) await peer.handleSignal(signal);
      })
      .catch((error) => {
        console.warn("[voice] peer start failed", error instanceof Error ? error.message : "unknown");
        setConnectionState("failed");
      });
    return () => {
      if (peerRef.current === peer) peerRef.current = null;
      void peer.stop();
    };
  }, [emitSignal, iceConfig.data, shouldStart, voiceCall?.id, voiceCall?.isCaller]);

  useEffect(() => {
    if (!drain.data) return;
    for (const signal of drain.data) {
      if (signal.type !== "offer" && signal.type !== "answer" && signal.type !== "ice") continue;
      if (handledSignals.current.has(signal.id)) continue;
      handledSignals.current.add(signal.id);
      const safeSignal = { type: signal.type, payload: signal.payload } as VoiceSignal;
      const peer = peerRef.current;
      if (!peer) {
        pendingSignals.current.push(safeSignal);
        continue;
      }
      void peer.handleSignal(safeSignal).catch(() => setConnectionState("failed"));
    }
  }, [drain.data]);

  useEffect(() => () => {
    void peerRef.current?.stop();
    peerRef.current = null;
    pendingSignals.current = [];
  }, []);

  const leave = async (kind: "decline" | "end") => {
    if (!callId) return router.back();
    try {
      if (kind === "decline") await decline.mutateAsync({ callId });
      else await end.mutateAsync({ callId });
    } catch {
      // The other participant may have ended first; local cleanup still matters.
    } finally {
      await peerRef.current?.stop();
      peerRef.current = null;
      pendingSignals.current = [];
      router.back();
    }
  };

  const accept = async () => {
    if (!callId) return;
    try {
      await answer.mutateAsync({ callId });
      await utils.voice.get.invalidate({ callId });
      await utils.voice.signal.drain.invalidate({ callId });
    } catch (error) {
      Alert.alert("Không thể nhận cuộc gọi", error instanceof Error ? error.message : "Vui lòng thử lại.");
    }
  };

  const toggleMicrophone = () => {
    const next = !microphoneEnabled;
    peerRef.current?.setMicrophoneEnabled(next);
    setMicrophoneEnabled(next);
  };

  if (!voiceCall) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" color="#2563EB" /><Text style={styles.loadingText}>Đang mở cuộc gọi thoại…</Text></SafeAreaView>;
  }

  const isIncomingRinging = !voiceCall.isCaller && voiceCall.status === "ringing";
  const displayState = isIncomingRinging ? "Cuộc gọi đến" : STATE_LABEL[connectionState];

  return (
    <SafeAreaView style={styles.screen} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.content}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{voiceCall.peer.displayName.trim().slice(0, 1).toUpperCase()}</Text></View>
        <Text style={styles.name}>{voiceCall.peer.displayName}</Text>
        <Text style={styles.handle}>@{voiceCall.peer.username}</Text>
        <View style={styles.statusPill}><View style={[styles.statusDot, connectionState === "connected" && styles.statusDotConnected]} /><Text style={styles.status}>{displayState}</Text></View>
      </View>
      {isIncomingRinging ? (
        <View style={styles.incomingActions}>
          <Pressable onPress={() => void leave("decline")} style={({ pressed }) => [styles.roundAction, styles.decline, pressed && styles.pressed]} accessibilityLabel="Từ chối gọi thoại"><MaterialIcons name="call-end" size={30} color="#FFFFFF" /></Pressable>
          <Pressable onPress={() => void accept()} style={({ pressed }) => [styles.roundAction, styles.accept, pressed && styles.pressed]} accessibilityLabel="Nhận gọi thoại"><MaterialIcons name="call" size={30} color="#FFFFFF" /></Pressable>
        </View>
      ) : (
        <View style={styles.activeActions}>
          <Pressable onPress={toggleMicrophone} style={({ pressed }) => [styles.control, !microphoneEnabled && styles.controlMuted, pressed && styles.pressed]} accessibilityLabel={microphoneEnabled ? "Tắt micro" : "Bật micro"}><MaterialIcons name={microphoneEnabled ? "mic" : "mic-off"} size={27} color="#FFFFFF" /><Text style={styles.controlText}>{microphoneEnabled ? "Micro" : "Đã tắt"}</Text></Pressable>
          <Pressable onPress={() => void leave("end")} style={({ pressed }) => [styles.roundAction, styles.decline, pressed && styles.pressed]} accessibilityLabel="Kết thúc gọi thoại"><MaterialIcons name="call-end" size={30} color="#FFFFFF" /></Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0F1C38" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F8FAFC" },
  loadingText: { marginTop: 14, color: "#475569", fontSize: 15 },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  avatar: { width: 132, height: 132, borderRadius: 66, alignItems: "center", justifyContent: "center", backgroundColor: "#2563EB", borderWidth: 5, borderColor: "#60A5FA" },
  avatarText: { fontSize: 54, fontWeight: "800", color: "#FFFFFF" },
  name: { marginTop: 28, color: "#FFFFFF", fontSize: 26, fontWeight: "800", textAlign: "center" },
  handle: { marginTop: 8, color: "#AFC3EE", fontSize: 15 },
  statusPill: { marginTop: 26, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, backgroundColor: "#1D315A", paddingHorizontal: 14, paddingVertical: 9 },
  statusDot: { height: 8, width: 8, borderRadius: 4, backgroundColor: "#FBBF24" },
  statusDotConnected: { backgroundColor: "#4ADE80" },
  status: { color: "#E5EEFF", fontSize: 13, fontWeight: "600" },
  incomingActions: { paddingHorizontal: 66, paddingBottom: 52, flexDirection: "row", justifyContent: "space-between" },
  activeActions: { paddingHorizontal: 64, paddingBottom: 52, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  roundAction: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center" },
  decline: { backgroundColor: "#DC2626" },
  accept: { backgroundColor: "#16A34A" },
  control: { minWidth: 82, alignItems: "center", gap: 6 },
  controlMuted: { opacity: 0.65 },
  controlText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
  pressed: { opacity: 0.74, transform: [{ scale: 0.97 }] },
});
