import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Camera } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { LiveKitRoom, useTracks, VideoTrack } from "@livekit/react-native";
import { Room, Track } from "livekit-client";

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
      Animated.timing(ringingScale, { toValue: 1.045, duration: 850, useNativeDriver: true }),
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
      if (isAnswer) void end.mutateAsync({ callId }).catch(() => undefined);
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

  if (details.isLoading && !connected) {
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><View style={styles.center}><Text style={styles.mutedText}>Đang chuẩn bị cuộc gọi…</Text></View></SafeAreaView>;
  }

  if (!connected && direction === "incoming") {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.incoming}>
          <View style={styles.brandPill}><MaterialIcons name="lock" size={14} color="#2563EB" /><Text style={styles.brandPillText}>KẾT NỐI RIÊNG TƯ</Text></View>
          <Text style={styles.eyebrow}>{kind === "video" ? "CUỘC GỌI VIDEO ĐẾN" : "CUỘC GỌI THOẠI ĐẾN"}</Text>
          <Animated.View style={[styles.avatar, { transform: [{ scale: ringingScale }] }]}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></Animated.View>
          <Text style={styles.name}>{name}</Text><Text style={styles.mutedText}>{isConnecting ? "Đang kết nối…" : subtitle}</Text>
          <View style={styles.incomingActions}><RoundAction label="Từ chối" icon="call-end" color="#E8505B" onPress={() => void finish("declined")} /><RoundAction label={isConnecting ? "Đang kết nối" : "Nhận"} icon={kind === "video" ? "videocam" : "phone"} color="#20A86B" onPress={() => void enterCall(true)} /></View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, isFullVideo && styles.videoSafe]}>
      <StatusBar barStyle={isFullVideo ? "light-content" : "dark-content"} />
      <View style={[styles.container, isFullVideo && styles.videoContainer]}>
        {isFullVideo ? <LiveKitRoom room={call.getRoom() as unknown as Room} serverUrl={undefined} token={undefined} connect={false}><VideoStage room={call.getRoom() as unknown as Room} /></LiveKitRoom> : null}
        {isFullVideo ? <Pressable style={styles.videoTapArea} onPress={() => setControlsVisible((visible) => !visible)} accessibilityRole="button" accessibilityLabel="Ẩn hoặc hiện điều khiển cuộc gọi" /> : null}
        {showCallChrome ? <View style={[styles.top, isFullVideo && styles.videoTop]}>
          <Pressable onPress={minimize} style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={connected ? "Thu nhỏ cuộc gọi" : "Hủy cuộc gọi"}><MaterialIcons name={connected ? "keyboard-arrow-down" : "close"} size={28} color={isFullVideo ? "#FFFFFF" : "#183053"} /></Pressable>
          <View style={[styles.secure, isFullVideo && styles.videoSecure]}><MaterialIcons name="lock" size={13} color={isFullVideo ? "#D8E7FF" : "#2563EB"} /><Text style={[styles.secureText, isFullVideo && styles.videoSecureText]}>Kết nối bảo mật</Text></View><View style={styles.dismissPlaceholder} />
        </View> : null}
        {showCallChrome ? <View style={[styles.identity, isFullVideo && styles.videoIdentity]}><View style={[styles.avatar, styles.callAvatar, isFullVideo && styles.videoAvatar]}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View><Text style={[styles.name, isFullVideo && styles.videoText]}>{name}</Text><Text style={[styles.mutedText, isFullVideo && styles.videoSubtext]}>{isConnecting ? "Đang kết nối…" : subtitle}</Text>{connected ? <Text style={[styles.quality, isFullVideo && styles.videoQuality]}>Kết nối qua Internet</Text> : null}</View> : null}
        {showCallChrome ? <View style={[styles.controls, isFullVideo && styles.videoControls]}>
          {connected ? <><View style={styles.controlRow}><Control label={muted ? "Bật micro" : "Tắt micro"} icon={muted ? "mic-off" : "mic"} active={muted} inverse={isFullVideo} onPress={() => void toggleMicrophone()} /><Control label={speaker ? "Loa ngoài" : "Tai nghe"} icon={speaker ? "volume-up" : "hearing"} active={speaker} inverse={isFullVideo} onPress={() => void toggleSpeaker()} />{kind === "video" ? <Control label={cameraOn ? "Tắt camera" : "Bật camera"} icon={cameraOn ? "videocam" : "videocam-off"} active={!cameraOn} inverse={isFullVideo} onPress={() => void toggleCamera()} /> : null}</View>{kind === "video" && cameraOn ? <View style={styles.secondaryControls}><Control label={isFrontCamera ? "Camera trước" : "Camera sau"} icon="flip-camera-android" active={false} inverse={isFullVideo} onPress={() => void switchCamera()} /></View> : null}<RoundAction label="Kết thúc" icon="call-end" color="#E8505B" inverse={isFullVideo} onPress={() => void finish("ended")} /></> : <View style={styles.pending}><RoundAction label="Hủy cuộc gọi" icon="call-end" color="#E8505B" onPress={() => void finish("ended")} /></View>}
        </View> : null}
      </View>
    </SafeAreaView>
  );
}

function VideoStage({ room }: { room: Room }) {
  const tracks = useTracks([Track.Source.Camera], { room, onlySubscribed: false });
  const remoteTrack = tracks.find((item) => !item.participant.isLocal && item.publication?.track);
  const localTrack = tracks.find((item) => item.participant.isLocal && item.publication?.track);
  return (
    <View style={styles.video}>
      {remoteTrack ? <VideoTrack trackRef={remoteTrack} style={styles.videoTrack} mirror={false} zOrder={0} /> : <View style={styles.videoWaiting}><MaterialIcons name="videocam-off" size={30} color="#D9E6FF" /><Text style={styles.videoWaitingText}>Đang chờ hình ảnh từ người bên kia…</Text></View>}
      {localTrack ? <View style={styles.localPreview}><VideoTrack trackRef={localTrack} style={styles.videoTrack} mirror zOrder={1} /></View> : <View style={styles.localPreviewPlaceholder}><MaterialIcons name="videocam" size={19} color="#BFDBFE" /><Text style={styles.localPreviewText}>Đang mở camera</Text></View>}
    </View>
  );
}

function Control({ label, icon, active, inverse, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; active: boolean; inverse?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.control, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}><View style={[styles.controlIcon, active && styles.controlActive, inverse && styles.inverseControlIcon]}><MaterialIcons name={icon} size={22} color={active ? "#FFFFFF" : inverse ? "#FFFFFF" : "#1D4ED8"} /></View><Text style={[styles.controlLabel, inverse && styles.inverseLabel]}>{label}</Text></Pressable>;
}

function RoundAction({ label, icon, color, inverse, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; color: string; inverse?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}><View style={[styles.actionIcon, { backgroundColor: color }]}><MaterialIcons name={icon} size={29} color="#FFF" /></View><Text style={[styles.actionLabel, inverse && styles.inverseLabel]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F8FF" },
  videoSafe: { backgroundColor: "#0D1B33" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  incoming: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingBottom: 42 },
  brandPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: "#E7F0FF", marginBottom: 30 },
  brandPillText: { color: "#2563EB", fontSize: 11, fontWeight: "800", letterSpacing: 0.7 },
  eyebrow: { color: "#2563EB", fontSize: 12, fontWeight: "800", letterSpacing: 1.05, marginBottom: 30 },
  avatar: { width: 132, height: 132, borderRadius: 66, alignItems: "center", justifyContent: "center", backgroundColor: "#3775E8", shadowColor: "#2563EB", shadowOpacity: 0.24, shadowRadius: 20, elevation: 6 },
  callAvatar: { width: 96, height: 96, borderRadius: 48, shadowOpacity: 0.16, shadowRadius: 14 },
  videoAvatar: { width: 58, height: 58, borderRadius: 29, shadowOpacity: 0 },
  avatarText: { color: "#FFF", fontSize: 48, fontWeight: "800" },
  name: { color: "#172554", fontSize: 27, fontWeight: "800", marginTop: 22 },
  mutedText: { color: "#62718D", fontSize: 15, marginTop: 7, textAlign: "center" },
  incomingActions: { position: "absolute", bottom: 24, left: 46, right: 46, flexDirection: "row", justifyContent: "space-between" },
  container: { flex: 1, padding: 20, paddingBottom: 20 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  videoTop: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: "rgba(8, 20, 42, 0.36)" },
  dismiss: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFF", justifyContent: "center", alignItems: "center", shadowColor: "#1E3A8A", shadowOpacity: 0.1, shadowRadius: 8, elevation: 2 },
  dismissPlaceholder: { width: 44, height: 44 },
  secure: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 18, backgroundColor: "#E7F0FF" },
  videoSecure: { backgroundColor: "rgba(15, 38, 77, 0.7)" },
  secureText: { color: "#2563EB", fontSize: 12, fontWeight: "700" },
  videoSecureText: { color: "#E5F0FF" },
  identity: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 36 },
  quality: { color: "#168759", marginTop: 12, fontSize: 13, fontWeight: "700" },
  controls: { alignItems: "center", gap: 18, backgroundColor: "#FFFFFF", borderRadius: 28, paddingVertical: 16, shadowColor: "#1E3A8A", shadowOpacity: 0.11, shadowRadius: 16, elevation: 4 },
  controlRow: { flexDirection: "row", gap: 20 },
  secondaryControls: { alignItems: "center", marginTop: -4 },
  control: { width: 78, alignItems: "center" },
  controlIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", backgroundColor: "#E7F0FF" },
  inverseControlIcon: { backgroundColor: "rgba(255,255,255,0.2)" },
  controlActive: { backgroundColor: "#60718F" },
  controlLabel: { color: "#3C4B68", fontSize: 11, fontWeight: "600", marginTop: 7, textAlign: "center" },
  inverseLabel: { color: "#F7FAFF" },
  action: { alignItems: "center" },
  actionIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  actionLabel: { color: "#334155", fontSize: 13, fontWeight: "800", marginTop: 7 },
  pending: { alignItems: "center" },
  videoContainer: { padding: 0, overflow: "hidden" },
  videoTapArea: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  video: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#0D1B33", alignItems: "center", justifyContent: "center" },
  videoTrack: { flex: 1, width: "100%" },
  videoWaiting: { alignItems: "center", gap: 12, paddingHorizontal: 32 },
  videoWaitingText: { color: "#E5EEFF", fontSize: 15, fontWeight: "600", textAlign: "center" },
  localPreview: { position: "absolute", right: 16, top: 84, width: 112, height: 158, borderRadius: 18, overflow: "hidden", backgroundColor: "#1B2E50", borderWidth: 2, borderColor: "#D6E7FF", zIndex: 1, elevation: 4 },
  localPreviewPlaceholder: { position: "absolute", right: 16, top: 84, width: 112, height: 64, borderRadius: 16, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(15, 38, 77, 0.88)", gap: 4, zIndex: 1 },
  localPreviewText: { color: "#DCEBFF", fontSize: 10, fontWeight: "700" },
  videoIdentity: { position: "absolute", zIndex: 2, top: 86, alignSelf: "center", paddingVertical: 10, paddingHorizontal: 18, borderRadius: 22, backgroundColor: "rgba(8, 20, 42, 0.58)" },
  videoText: { color: "#FFFFFF", fontSize: 20, marginTop: 8 },
  videoSubtext: { color: "#E2EAFE", fontSize: 14 },
  videoQuality: { color: "#9DF0C5", marginTop: 7 },
  videoControls: { position: "absolute", zIndex: 2, left: 0, right: 0, bottom: 0, borderRadius: 0, paddingTop: 15, paddingBottom: 18, backgroundColor: "rgba(8, 20, 42, 0.82)", shadowOpacity: 0 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
