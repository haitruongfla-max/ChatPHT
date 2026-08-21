import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Camera } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { LiveKitRoom, useTracks, VideoTrack } from "@livekit/react-native";
import { Track } from "livekit-client";

import { activeCall } from "@/lib/active-call";
import { createCallTonePlayer, stopCallTone } from "@/lib/call-sounds";
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
  const resumed = activeCall.get(callId);
  const [connected, setConnected] = useState(Boolean(resumed?.connected));
  const [muted, setMuted] = useState(resumed?.muted ?? false);
  const [speaker, setSpeaker] = useState(resumed?.speaker ?? true);
  const [cameraOn, setCameraOn] = useState(resumed?.cameraOn ?? kind === "video");
  const [isFrontCamera, setIsFrontCamera] = useState(resumed?.isFrontCamera ?? true);
  const [seconds, setSeconds] = useState(resumed?.seconds ?? 0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const call = useRef(resumed?.call ?? new LiveKitCall()).current;
  const ringingScale = useRef(new Animated.Value(1)).current;
  const ringbackTone = useRef<Awaited<ReturnType<typeof createCallTonePlayer>> | null>(null);
  const started = useRef(Boolean(resumed?.connected));
  const finalized = useRef(false);
  const details = trpc.calls.get.useQuery({ callId }, { enabled: Boolean(callId), refetchInterval: 900 });
  const answer = trpc.calls.answer.useMutation();
  const join = trpc.calls.join.useMutation();
  const decline = trpc.calls.decline.useMutation();
  const end = trpc.calls.end.useMutation();
  const answeredAt = details.data?.answeredAt ? new Date(details.data.answeredAt).getTime() : null;
  const isAnswered = details.data?.status === "active";
  const isFullVideo = connected && kind === "video";
  const showCallChrome = !isFullVideo || controlsVisible;

  useEffect(() => () => {
    if (!activeCall.isMinimized(callId)) void call.disconnect();
    stopCallTone(ringbackTone.current);
  }, [call, callId]);

  useEffect(() => {
    const shouldPlayRingback = direction === "outgoing" && connected && !isAnswered;
    if (!shouldPlayRingback) {
      stopCallTone(ringbackTone.current);
      ringbackTone.current = null;
      return;
    }
    let active = true;
    void createCallTonePlayer().then((player) => {
      if (!active || isAnswered) return stopCallTone(player);
      ringbackTone.current = player;
      player.play();
    }).catch(() => undefined);
    return () => {
      active = false;
      stopCallTone(ringbackTone.current);
      ringbackTone.current = null;
    };
  }, [connected, direction, isAnswered]);

  useEffect(() => {
    const status = details.data?.status;
    if (!status || !["ended", "declined", "missed"].includes(status) || finalized.current) return;
    finalized.current = true;
    activeCall.clear(callId);
    void call.disconnect().catch(() => undefined);
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [call, callId, details.data?.status]);

  useEffect(() => {
    if (connected && isAnswered && answeredAt) {
      const updateDuration = () => {
        const next = Math.max(0, Math.floor((Date.now() - answeredAt) / 1000));
        setSeconds(next);
        activeCall.update(callId, { seconds: next });
      };
      updateDuration();
      const timer = setInterval(updateDuration, 1000);
      return () => clearInterval(timer);
    }
    if (connected) return;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(ringingScale, { toValue: 1.06, duration: 850, useNativeDriver: true }),
      Animated.timing(ringingScale, { toValue: 1, duration: 850, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [answeredAt, callId, connected, isAnswered, ringingScale]);

  useEffect(() => {
    if (direction !== "outgoing" || started.current || !callId || activeCall.get(callId)?.connected) return;
    started.current = true;
    void enterCall(false);
    // An outgoing screen requests its joining token once only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, direction]);

  async function requestPermissions() {
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

  function publishActiveState(next: { muted?: boolean; speaker?: boolean; cameraOn?: boolean; isFrontCamera?: boolean; seconds?: number } = {}) {
    activeCall.activate({
      callId,
      kind,
      direction,
      name,
      call,
      connected: true,
      muted: next.muted ?? muted,
      speaker: next.speaker ?? speaker,
      cameraOn: next.cameraOn ?? cameraOn,
      isFrontCamera: next.isFrontCamera ?? isFrontCamera,
      seconds: next.seconds ?? seconds,
    });
  }

  async function enterCall(isAnswer: boolean) {
    if (!callId || isConnecting || !(await requestPermissions())) return;
    setIsConnecting(true);
    try {
      if (isAnswer) {
        const result = await answer.mutateAsync({ callId });
        await call.connect(result.session, kind);
      } else {
        const session = await join.mutateAsync({ callId });
        await call.connect(session, kind);
      }
      setConnected(true);
      publishActiveState({ seconds: 0 });
    } catch (error) {
      if (isAnswer) {
        void end.mutateAsync({ callId }).catch(() => undefined);
      }
      await call.disconnect().catch(() => undefined);
      Alert.alert("Chưa thể kết nối", error instanceof Error ? error.message : "Hãy thử lại khi mạng ổn định hơn.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function finish(status: "ended" | "declined") {
    finalized.current = true;
    try {
      if (status === "declined") await decline.mutateAsync({ callId });
      else await end.mutateAsync({ callId });
    } catch {
      // The local WebRTC connection must always be released even if the status request times out.
    } finally {
      activeCall.clear(callId);
      await call.disconnect().catch(() => undefined);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    }
  }

  function minimize() {
    if (!connected) {
      void finish("ended");
      return;
    }
    publishActiveState();
    activeCall.minimize(callId);
    router.back();
  }

  async function toggleMicrophone() {
    const next = !muted;
    try {
      await call.setMicrophoneEnabled(!next);
      setMuted(next);
      activeCall.update(callId, { muted: next });
    } catch {
      Alert.alert("Chưa thể đổi micro", "Vui lòng thử lại sau giây lát.");
    }
  }

  async function toggleSpeaker() {
    const next = !speaker;
    try {
      await call.setSpeakerEnabled(next);
      setSpeaker(next);
      activeCall.update(callId, { speaker: next });
    } catch {
      Alert.alert("Chưa thể đổi loa", "Vui lòng thử lại sau giây lát.");
    }
  }

  async function toggleCamera() {
    const next = !cameraOn;
    try {
      await call.setCameraEnabled(next);
      setCameraOn(next);
      activeCall.update(callId, { cameraOn: next });
    } catch {
      Alert.alert("Chưa thể đổi trạng thái camera", "Vui lòng thử lại sau giây lát.");
    }
  }

  async function switchCamera() {
    try {
      const nextIsFrontCamera = await call.switchCamera();
      setIsFrontCamera(nextIsFrontCamera);
      activeCall.update(callId, { isFrontCamera: nextIsFrontCamera });
    } catch (error) {
      Alert.alert("Chưa thể đổi camera", error instanceof Error ? error.message : "Vui lòng thử lại sau giây lát.");
    }
  }

  const subtitle = useMemo(() => {
    if (connected && isAnswered) return callDuration(seconds);
    if (direction === "incoming") return kind === "video" ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến";
    return kind === "video" ? "Đang mời tham gia video…" : "Đang gọi…";
  }, [connected, direction, isAnswered, kind, seconds]);

  if (details.isLoading && !connected) return <SafeAreaView style={styles.safe}><View style={styles.center}><Text style={styles.mutedText}>Đang chuẩn bị cuộc gọi…</Text></View></SafeAreaView>;

  if (!connected && direction === "incoming") {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.incoming}>
          <Text style={styles.eyebrow}>{kind === "video" ? "CUỘC GỌI VIDEO ĐẾN" : "CUỘC GỌI THOẠI ĐẾN"}</Text>
          <Animated.View style={[styles.avatar, { transform: [{ scale: ringingScale }] }]}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></Animated.View>
          <Text style={styles.name}>{name}</Text><Text style={styles.mutedText}>{isConnecting ? "Đang kết nối…" : subtitle}</Text>
          <View style={styles.incomingActions}><RoundAction label="Từ chối" icon="call-end" color="#EF5B65" onPress={() => void finish("declined")} /><RoundAction label={isConnecting ? "Đang kết nối" : "Nhận"} icon={kind === "video" ? "videocam" : "phone"} color="#2FC978" onPress={() => void enterCall(true)} /></View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, isFullVideo && styles.videoContainer]}>
        {isFullVideo ? <LiveKitRoom room={call.getRoom()} serverUrl={undefined} token={undefined} connect={false}><VideoStage /></LiveKitRoom> : null}
        {isFullVideo ? <Pressable style={styles.videoTapArea} onPress={() => setControlsVisible((visible) => !visible)} accessibilityRole="button" accessibilityLabel="Ẩn hoặc hiện điều khiển cuộc gọi" /> : null}
        {showCallChrome ? <View style={styles.top}>
          <Pressable onPress={minimize} style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={connected ? "Thu nhỏ cuộc gọi" : "Hủy cuộc gọi"}><MaterialIcons name={connected ? "keyboard-arrow-down" : "close"} size={28} color="#E9F0FF" /></Pressable>
          <View style={styles.secure}><MaterialIcons name="lock" size={13} color="#A9CBFF" /><Text style={styles.secureText}>Kết nối bảo mật</Text></View><View style={styles.dismissPlaceholder} />
        </View> : null}
        {showCallChrome ? <View style={[styles.identity, isFullVideo && styles.videoIdentity]}><View style={styles.avatar}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View><Text style={styles.name}>{name}</Text><Text style={styles.mutedText}>{isConnecting ? "Đang kết nối…" : subtitle}</Text>{connected ? <Text style={styles.quality}>Kết nối qua Internet</Text> : null}</View> : null}
        {showCallChrome ? <View style={[styles.controls, isFullVideo && styles.videoControls]}>
          {connected ? <><View style={styles.controlRow}><Control label={muted ? "Bật micro" : "Tắt micro"} icon={muted ? "mic-off" : "mic"} active={muted} onPress={() => void toggleMicrophone()} /><Control label={speaker ? "Loa ngoài" : "Tai nghe"} icon={speaker ? "volume-up" : "hearing"} active={speaker} onPress={() => void toggleSpeaker()} />{kind === "video" ? <Control label={cameraOn ? "Tắt camera" : "Bật camera"} icon={cameraOn ? "videocam" : "videocam-off"} active={!cameraOn} onPress={() => void toggleCamera()} /> : null}</View>{kind === "video" && cameraOn ? <View style={styles.secondaryControls}><Control label={isFrontCamera ? "Camera trước" : "Camera sau"} icon="flip-camera-android" active={false} onPress={() => void switchCamera()} /></View> : null}<RoundAction label="Kết thúc" icon="call-end" color="#EF5B65" onPress={() => void finish("ended")} /></> : <View style={styles.pending}><RoundAction label="Hủy cuộc gọi" icon="call-end" color="#EF5B65" onPress={() => void finish("ended")} /></View>}
        </View> : null}
      </View>
    </SafeAreaView>
  );
}

function VideoStage() {
  const tracks = useTracks([Track.Source.Camera]);
  const remoteTrack = tracks.find((item) => !item.participant.isLocal && item.publication?.track);
  const localTrack = tracks.find((item) => item.participant.isLocal && item.publication?.track);
  return (
    <View style={styles.video}>
      {remoteTrack ? <VideoTrack trackRef={remoteTrack} style={styles.videoTrack} mirror={false} zOrder={0} /> : <Text style={styles.mutedText}>Đang chờ hình ảnh từ người bên kia…</Text>}
      {localTrack ? <View style={styles.localPreview}><VideoTrack trackRef={localTrack} style={styles.videoTrack} mirror zOrder={1} /></View> : null}
    </View>
  );
}

function Control({ label, icon, active, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.control, pressed && styles.pressed]}><View style={[styles.controlIcon, active && styles.controlActive]}><MaterialIcons name={icon} size={23} color="#FFF" /></View><Text style={styles.controlLabel}>{label}</Text></Pressable>; }
function RoundAction({ label, icon, color, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; color: string; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}><View style={[styles.actionIcon, { backgroundColor: color }]}><MaterialIcons name={icon} size={29} color="#FFF" /></View><Text style={styles.actionLabel}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0B1220" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  incoming: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  eyebrow: { color: "#9CBFFE", fontSize: 12, fontWeight: "800", letterSpacing: 1.2, marginBottom: 38 },
  avatar: { width: 144, height: 144, borderRadius: 72, alignItems: "center", justifyContent: "center", backgroundColor: "#467CE4", shadowColor: "#6B9DFF", shadowOpacity: 0.4, shadowRadius: 22, elevation: 8 },
  avatarText: { color: "#FFF", fontSize: 54, fontWeight: "800" },
  name: { color: "#F7FAFF", fontSize: 28, fontWeight: "800", marginTop: 25 },
  mutedText: { color: "#B4C2D9", fontSize: 15, marginTop: 8, textAlign: "center" },
  incomingActions: { position: "absolute", bottom: 48, left: 40, right: 40, flexDirection: "row", justifyContent: "space-between" },
  container: { flex: 1, padding: 22, paddingBottom: 26 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  dismiss: { width: 42, height: 42, borderRadius: 21, backgroundColor: "#16233A", justifyContent: "center", alignItems: "center" },
  dismissPlaceholder: { width: 42, height: 42 },
  secure: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: "#152846" },
  secureText: { color: "#B4D0FF", fontSize: 12, fontWeight: "700" },
  identity: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 38 },
  quality: { color: "#6EE8A4", marginTop: 12, fontSize: 13, fontWeight: "700" },
  controls: { alignItems: "center", gap: 18 },
  controlRow: { flexDirection: "row", gap: 24 },
  secondaryControls: { alignItems: "center", marginTop: -4 },
  control: { width: 78, alignItems: "center" },
  controlIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", backgroundColor: "#233452" },
  controlActive: { backgroundColor: "#6B7E9E" },
  controlLabel: { color: "#CAD8EC", fontSize: 11, marginTop: 7, textAlign: "center" },
  action: { alignItems: "center" },
  actionIcon: { width: 66, height: 66, borderRadius: 33, alignItems: "center", justifyContent: "center" },
  actionLabel: { color: "#E6EDF8", fontSize: 13, fontWeight: "700", marginTop: 8 },
  pending: { alignItems: "center" },
  videoContainer: { padding: 0, overflow: "hidden" },
  videoTapArea: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  video: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#101B30", alignItems: "center", justifyContent: "center" },
  videoTrack: { flex: 1, width: "100%" },
  localPreview: { position: "absolute", right: 18, top: 88, width: 112, height: 158, borderRadius: 16, overflow: "hidden", backgroundColor: "#182641", borderWidth: 2, borderColor: "#A9CBFF", zIndex: 1 },
  videoIdentity: { position: "absolute", zIndex: 2, top: 62, alignSelf: "center", paddingVertical: 12 },
  videoControls: { position: "absolute", zIndex: 2, left: 0, right: 0, bottom: 12, paddingBottom: 4, backgroundColor: "rgba(4, 10, 22, 0.62)", paddingTop: 14, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.12)" },
  pressed: { opacity: 0.72 },
});
