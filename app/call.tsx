import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Camera } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { LiveKitRoom, useTracks, VideoTrack } from "@livekit/react-native";
import { Track } from "livekit-client";

import { LiveKitCall } from "@/lib/livekit-call";
import { trpc } from "@/lib/trpc";

type CallKind = "audio" | "video";
type Direction = "incoming" | "outgoing";

function callDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export default function CallScreen() {
  const params = useLocalSearchParams<{ callId?: string; kind?: CallKind; direction?: Direction; name?: string }>();
  const callId = params.callId ?? "";
  const kind = params.kind === "video" ? "video" : "audio";
  const direction = params.direction === "incoming" ? "incoming" : "outgoing";
  const name = params.name || "Liên hệ ChatPHT";
  const [connected, setConnected] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [cameraOn, setCameraOn] = useState(kind === "video");
  const [seconds, setSeconds] = useState(0);
  const call = useRef(new LiveKitCall()).current;
  const ringingScale = useRef(new Animated.Value(1)).current;
  const started = useRef(false);
  const details = trpc.calls.get.useQuery({ callId }, { enabled: Boolean(callId), refetchInterval: connected ? false : 900 });
  const answer = trpc.calls.answer.useMutation();
  const join = trpc.calls.join.useMutation();
  const decline = trpc.calls.decline.useMutation();
  const end = trpc.calls.end.useMutation();

  useEffect(() => () => { void call.disconnect(); }, [call]);
  useEffect(() => {
    if (connected) {
      const timer = setInterval(() => setSeconds((value) => value + 1), 1000);
      return () => clearInterval(timer);
    }
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(ringingScale, { toValue: 1.06, duration: 850, useNativeDriver: true }),
      Animated.timing(ringingScale, { toValue: 1, duration: 850, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [connected, ringingScale]);

  useEffect(() => {
    if (direction !== "outgoing" || started.current || !callId) return;
    started.current = true;
    void enterCall(false);
    // An outgoing screen requests its joining token once only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, direction]);

  async function requestPermissions() {
    if (Platform.OS === "web") return true;
    const microphone = await Camera.requestMicrophonePermissionsAsync();
    if (!microphone.granted) {
      Alert.alert("Cần quyền micro", "Hãy cấp quyền micro để gọi thoại.");
      return false;
    }
    if (kind === "video") {
      const camera = await Camera.requestCameraPermissionsAsync();
      if (!camera.granted) {
        Alert.alert("Cần quyền camera", "Hãy cấp quyền camera để gọi video.");
        return false;
      }
    }
    return true;
  }

  async function enterCall(isAnswer: boolean) {
    if (!callId || !(await requestPermissions())) return;
    try {
      if (isAnswer) {
        const result = await answer.mutateAsync({ callId });
        await call.connect(result.session, kind);
      } else {
        const session = await join.mutateAsync({ callId });
        await call.connect(session, kind);
      }
      setConnected(true);
    } catch (error) {
      Alert.alert("Chưa thể kết nối", error instanceof Error ? error.message : "Hãy thử lại khi mạng ổn định hơn.");
    }
  }

  async function finish(status: "ended" | "declined") {
    try {
      if (status === "declined") await decline.mutateAsync({ callId });
      else await end.mutateAsync({ callId });
    } catch {
      // The local WebRTC connection must always be released even if the status request times out.
    } finally {
      await call.disconnect().catch(() => undefined);
      router.back();
    }
  }

  const subtitle = useMemo(() => {
    if (connected) return callDuration(seconds);
    if (direction === "incoming") return kind === "video" ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến";
    return kind === "video" ? "Đang mời tham gia video…" : "Đang gọi…";
  }, [connected, direction, kind, seconds]);

  if (details.isLoading) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.muted}>Đang chuẩn bị cuộc gọi…</Text></View></SafeAreaView>;

  if (!connected && direction === "incoming") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.incoming}>
          <Text style={styles.eyebrow}>{kind === "video" ? "CUỘC GỌI VIDEO ĐẾN" : "CUỘC GỌI THOẠI ĐẾN"}</Text>
          <Animated.View style={[styles.avatar, { transform: [{ scale: ringingScale }] }]}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></Animated.View>
          <Text style={styles.name}>{name}</Text><Text style={styles.muted}>{subtitle}</Text>
          <View style={styles.incomingActions}><RoundAction label="Từ chối" icon="call-end" color="#EF5B65" onPress={() => void finish("declined")} /><RoundAction label="Nhận" icon={kind === "video" ? "videocam" : "phone"} color="#2FC978" onPress={() => void enterCall(true)} /></View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.top}><Pressable onPress={() => void finish("ended")} style={styles.dismiss}><MaterialIcons name="keyboard-arrow-down" size={28} color="#E9F0FF" /></Pressable><View style={styles.secure}><MaterialIcons name="lock" size={13} color="#A9CBFF" /><Text style={styles.secureText}>Kết nối bảo mật</Text></View><View style={styles.dismiss} /></View>
        {connected && kind === "video" ? <LiveKitRoom room={call.getRoom()} serverUrl={undefined} token={undefined} connect={false}><VideoStage /></LiveKitRoom> : null}
        <View style={[styles.identity, connected && kind === "video" && styles.videoIdentity]}><View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View><Text style={styles.name}>{name}</Text><Text style={styles.muted}>{subtitle}</Text>{connected ? <Text style={styles.quality}>Kết nối qua Internet</Text> : null}</View>
        <View style={styles.controls}>
          {connected ? <><View style={styles.controlRow}><Control label={muted ? "Bật micro" : "Tắt micro"} icon={muted ? "mic-off" : "mic"} active={muted} onPress={() => { const next = !muted; void call.setMicrophoneEnabled(!next).then(() => setMuted(next)); }} /><Control label={speaker ? "Loa ngoài" : "Tai nghe"} icon={speaker ? "volume-up" : "hearing"} active={speaker} onPress={() => { const next = !speaker; void call.setSpeakerEnabled(next).then(() => setSpeaker(next)); }} />{kind === "video" ? <Control label={cameraOn ? "Tắt camera" : "Bật camera"} icon={cameraOn ? "videocam" : "videocam-off"} active={!cameraOn} onPress={() => { const next = !cameraOn; void call.setCameraEnabled(next).then(() => setCameraOn(next)); }} /> : null}</View><RoundAction label="Kết thúc" icon="call-end" color="#EF5B65" onPress={() => void finish("ended")} /></> : <View style={styles.pending}><RoundAction label="Hủy cuộc gọi" icon="call-end" color="#EF5B65" onPress={() => void finish("ended")} /></View>}
        </View>
      </View>
    </SafeAreaView>
  );
}

function VideoStage() {
  const tracks = useTracks([Track.Source.Camera]);
  const track = tracks.find((item) => item.publication?.track);
  return <View style={styles.video}>{track ? <VideoTrack trackRef={track} style={styles.videoTrack} mirror={track.participant.isLocal} zOrder={0} /> : <Text style={styles.muted}>Đang chờ hình ảnh video…</Text>}</View>;
}

function Control({ label, icon, active, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.control}><View style={[styles.controlIcon, active && styles.controlActive]}><MaterialIcons name={icon} size={23} color="#FFF" /></View><Text style={styles.controlLabel}>{label}</Text></Pressable>; }
function RoundAction({ label, icon, color, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; color: string; onPress: () => void }) { return <Pressable onPress={onPress} style={styles.action}><View style={[styles.actionIcon, { backgroundColor: color }]}><MaterialIcons name={icon} size={29} color="#FFF" /></View><Text style={styles.actionLabel}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, incoming: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 }, eyebrow: { color: "#9CBFFE", fontSize: 12, fontWeight: "800", letterSpacing: 1.2, marginBottom: 38 }, avatar: { width: 144, height: 144, borderRadius: 72, alignItems: "center", justifyContent: "center", backgroundColor: "#467CE4", shadowColor: "#6B9DFF", shadowOpacity: 0.4, shadowRadius: 22, elevation: 8 }, avatarText: { color: "#FFF", fontSize: 54, fontWeight: "800" }, name: { color: "#F7FAFF", fontSize: 28, fontWeight: "800", marginTop: 25 }, muted: { color: "#B4C2D9", fontSize: 15, marginTop: 8, textAlign: "center" }, incomingActions: { position: "absolute", bottom: 48, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" }, container: { flex: 1, padding: 22, paddingBottom: 26 }, top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, dismiss: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#16233A", justifyContent: "center", alignItems: "center" }, secure: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: "#152846" }, secureText: { color: "#B4D0FF", fontSize: 12, fontWeight: "700" }, identity: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 38 }, videoIdentity: { flex: 0, paddingVertical: 18 }, quality: { color: "#6EE8A4", marginTop: 12, fontSize: 13, fontWeight: "700" }, controls: { alignItems: "center", gap: 24 }, controlRow: { flexDirection: "row", gap: 24 }, control: { width: 74, alignItems: "center" }, controlIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", backgroundColor: "#233452" }, controlActive: { backgroundColor: "#6B7E9E" }, controlLabel: { color: "#CAD8EC", fontSize: 11, marginTop: 7, textAlign: "center" }, action: { alignItems: "center" }, actionIcon: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" }, actionLabel: { color: "#E6EDF8", fontSize: 13, fontWeight: "700", marginTop: 8 }, pending: { alignItems: "center" }, video: { height: 265, marginTop: 18, borderRadius: 22, overflow: "hidden", backgroundColor: "#101B30", alignItems: "center", justifyContent: "center" }, videoTrack: { flex: 1, width: "100%" },
});
