import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Camera } from "expo-camera";
import ExpoPip from "expo-pip";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { RTCView, type MediaStream } from "react-native-webrtc";

import { activeCall } from "@/lib/active-call";
import { getCallConnectionStatus, getP2pNetworkQuality, type P2pNetworkQuality } from "@/lib/call-connection-status";
import { createCallTonePlayer, stopAllCallAlerts, stopCallTone } from "@/lib/call-sounds";
import { P2pCall, type P2pConnectionState, type P2pSignal } from "@/lib/p2p-call";
import { callKindForP2pMode, toP2pCallMode, type P2pCallMode } from "@/lib/p2p-call-mode";
import { trpc } from "@/lib/trpc";

type CallKind = "audio" | "video";
type Direction = "incoming" | "outgoing";

function callDuration(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

function modeLabel(mode: P2pCallMode) {
  return mode === "video" ? "Cuộc gọi video" : mode === "screen" ? "Chia sẻ màn hình" : "Cuộc gọi thoại";
}

function CallerAvatar({ name, avatarUrl, style }: { name: string; avatarUrl: string | null; style: StyleProp<ViewStyle> }) {
  return <View style={style}>{avatarUrl ? <Image source={{ uri: avatarUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>}</View>;
}

export default function CallScreen() {
  const params = useLocalSearchParams<{ callId?: string; kind?: CallKind; p2pMode?: P2pCallMode; direction?: Direction; name?: string; avatar?: string }>();
  const callId = params.callId ?? "";
  const routeMode = toP2pCallMode(params.p2pMode ?? params.kind);
  const direction = params.direction === "incoming" ? "incoming" : "outgoing";
  const resumed = activeCall.get(callId);
  const p2p = useRef(resumed?.call ?? new P2pCall()).current;
  const details = trpc.calls.get.useQuery({ callId }, { enabled: Boolean(callId), refetchInterval: 800 });
  const mode = toP2pCallMode(details.data?.p2pMode ?? routeMode);
  const kind = callKindForP2pMode(mode);
  const [connected, setConnected] = useState(Boolean(resumed?.connected));
  const [muted, setMuted] = useState(resumed?.muted ?? false);
  const [speaker, setSpeaker] = useState(resumed?.speaker ?? kind === "video");
  const [cameraOn, setCameraOn] = useState(resumed?.cameraOn ?? mode === "video");
  const [isFrontCamera, setIsFrontCamera] = useState(resumed?.isFrontCamera ?? true);
  const [videoQuality, setVideoQuality] = useState<"sd" | "hd">(resumed?.videoQuality ?? "hd");
  const [seconds, setSeconds] = useState(resumed?.seconds ?? 0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [p2pState, setP2pState] = useState<P2pConnectionState>("idle");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const ringbackTone = useRef<Awaited<ReturnType<typeof createCallTonePlayer>> | null>(null);
  const started = useRef(Boolean(resumed?.connected));
  const finalized = useRef(false);
  const answerInFlight = useRef(false);
  const handledSignals = useRef(new Set<number>());
  const answer = trpc.calls.answer.useMutation();
  const end = trpc.calls.end.useMutation();
  const decline = trpc.calls.decline.useMutation();
  const sendSignal = trpc.calls.p2pSignal.send.useMutation();
  const isGroup = details.data?.isGroup === true;
  const isCaller = details.data?.isCaller === true || direction === "outgoing";
  const isAnswered = details.data?.status === "active";
  const p2pActive = p2pState !== "idle" && p2pState !== "closed";
  const incomingSignals = trpc.calls.p2pSignal.drain.useQuery({ callId }, { enabled: Boolean(callId) && p2pActive, refetchInterval: p2pActive ? 300 : false });
  const iceConfig = trpc.calls.p2pIceConfig.useQuery({ callId }, { enabled: Boolean(callId) && isAnswered });
  const name = details.data?.peer?.displayName || params.name?.trim() || "Người dùng ChatPHT";
  const avatarUrl = details.data?.peer?.avatarUrl ?? (params.avatar?.trim() || null);
  const answeredAt = details.data?.answeredAt ? new Date(details.data.answeredAt).getTime() : null;
  const isVisualMode = mode === "video" || mode === "screen";
  const fullVideo = connected && isVisualMode;
  const showChrome = !fullVideo || controlsVisible;
  const networkQuality = getP2pNetworkQuality(p2pState);

  useEffect(() => () => {
    if (!activeCall.isMinimized(callId)) void p2p.disconnect();
    stopAllCallAlerts();
    stopCallTone(ringbackTone.current);
  }, [callId, p2p]);

  useEffect(() => {
    for (const signal of incomingSignals.data ?? []) {
      if (handledSignals.current.has(signal.id)) continue;
      handledSignals.current.add(signal.id);
      if (signal.type !== "offer" && signal.type !== "answer" && signal.type !== "ice") continue;
      void p2p.handleSignal({ type: signal.type, payload: signal.payload }).catch((error) => {
        setConnectionError(error instanceof Error ? error.message : "Không xử lý được tín hiệu P2P.");
      });
    }
  }, [incomingSignals.data, p2p]);

  useEffect(() => {
    const status = details.data?.status;
    if (!status || !["ended", "declined", "missed"].includes(status) || finalized.current) return;
    finalized.current = true;
    activeCall.clear(callId);
    void p2p.disconnect();
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [callId, details.data?.status, p2p]);

  useEffect(() => {
    const shouldPlay = direction === "outgoing" && details.data?.status === "ringing" && !isAnswered;
    if (!shouldPlay) { stopCallTone(ringbackTone.current); ringbackTone.current = null; return; }
    let active = true;
    void createCallTonePlayer().then((player) => {
      if (!active || isAnswered) return stopCallTone(player);
      ringbackTone.current = player;
      player.play();
    }).catch(() => undefined);
    return () => { active = false; stopCallTone(ringbackTone.current); ringbackTone.current = null; };
  }, [details.data?.status, direction, isAnswered]);

  useEffect(() => {
    if (!connected || !isAnswered || !answeredAt) return;
    const tick = () => {
      const next = Math.max(0, Math.floor((Date.now() - answeredAt) / 1000));
      setSeconds(next);
      activeCall.update(callId, { seconds: next });
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [answeredAt, callId, connected, isAnswered]);

  useEffect(() => {
    if (Platform.OS !== "android" || mode !== "video" || !connected || !ExpoPip.isAvailable()) return;
    ExpoPip.setPictureInPictureParams({ width: 16, height: 9, title: "ChatPHT", subtitle: "Cuộc gọi P2P đang diễn ra", seamlessResizeEnabled: true, autoEnterEnabled: true });
  }, [connected, mode]);

  useEffect(() => {
    if (direction !== "outgoing" || started.current || !callId) return;
    started.current = true;
    void enterCall(false);
  // The caller rings first; media starts only after the recipient accepts.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId, direction]);

  useEffect(() => {
    const shouldStart = !isGroup && isAnswered && p2pState === "idle" && !isConnecting && !finalized.current;
    if (!shouldStart) return;
    void startP2p(!isCaller).catch((error) => {
      setP2pState("failed");
      setConnectionError(error instanceof Error ? error.message : "Không thể khởi tạo P2P.");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnswered, isCaller, isConnecting, isGroup, p2pState]);

  async function requestPermissions() {
    if (mode === "screen") return true;
    const microphone = await Camera.requestMicrophonePermissionsAsync();
    if (!microphone.granted) { Alert.alert("Cần quyền micro", "Hãy cấp quyền micro để gọi."); return false; }
    if (mode === "video") {
      const camera = await Camera.requestCameraPermissionsAsync();
      if (!camera.granted) { Alert.alert("Cần quyền camera", "Hãy cấp quyền camera để gọi video."); return false; }
    }
    return true;
  }

  function publishActiveState(next: Partial<{ muted: boolean; speaker: boolean; cameraOn: boolean; isFrontCamera: boolean; videoQuality: "sd" | "hd"; seconds: number }> = {}) {
    activeCall.activate({ callId, kind, p2pMode: mode, direction, name, call: p2p, connected: true, muted: next.muted ?? muted, speaker: next.speaker ?? speaker, cameraOn: next.cameraOn ?? cameraOn, isFrontCamera: next.isFrontCamera ?? isFrontCamera, videoQuality: next.videoQuality ?? videoQuality, seconds: next.seconds ?? seconds, isGroup: false, provider: "p2p" });
  }

  async function startP2p(isAnswer: boolean) {
    setP2pState("connecting");
    const result = iceConfig.data ?? (await iceConfig.refetch()).data;
    await p2p.start({
      isCaller: !isAnswer,
      kind,
      mode,
      iceServers: result?.iceServers,
      onSignal: async (signal: P2pSignal) => { await sendSignal.mutateAsync({ callId, ...signal }); },
      onState: (state) => {
        setP2pState(state);
        setConnected(state === "connected");
        if (state === "connected") { setConnectionError(null); publishActiveState({ seconds: 0 }); }
        if (state === "recovering") setConnectionError(null);
        if (state === "failed") setConnectionError("Không thiết lập được P2P trực tiếp. Hãy kiểm tra mạng rồi thử lại.");
      },
      onRemoteStream: setRemoteStream,
    });
    setLocalStream(p2p.getLocalStream());
  }

  async function enterCall(isAnswer: boolean) {
    if (!callId || isConnecting || (isAnswer && answerInFlight.current)) return;
    if (isGroup) { Alert.alert("Đã dừng gọi nhóm", "ChatPHT hiện chỉ hỗ trợ gọi và chia sẻ màn hình P2P 1:1."); return; }
    setConnectionError(null);
    if (!(await requestPermissions())) return;
    stopAllCallAlerts();
    if (isAnswer) answerInFlight.current = true;
    setIsConnecting(true);
    try {
      if (isAnswer) await answer.mutateAsync({ callId });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hãy thử lại khi mạng ổn định hơn.";
      setConnectionError(message);
      Alert.alert("Chưa thể kết nối", message);
    } finally {
      answerInFlight.current = false;
      setIsConnecting(false);
    }
  }

  async function finish(status: "ended" | "declined") {
    finalized.current = true;
    stopAllCallAlerts();
    stopCallTone(ringbackTone.current);
    try {
      if (status === "declined") await decline.mutateAsync({ callId });
      else await end.mutateAsync({ callId });
    } catch { /* Release local media even if the server is unavailable. */ }
    finally {
      activeCall.clear(callId);
      await p2p.disconnect().catch(() => undefined);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    }
  }

  function minimize() {
    if (!connected) { void finish("ended"); return; }
    if (Platform.OS === "android" && mode === "video" && ExpoPip.isAvailable()) {
      try { ExpoPip.enterPipMode({ width: 16, height: 9, title: "ChatPHT", subtitle: "Cuộc gọi P2P đang diễn ra", seamlessResizeEnabled: true }); return; } catch { /* In-app overlay remains available. */ }
    }
    publishActiveState();
    activeCall.minimize(callId);
    router.back();
  }

  async function toggleMicrophone() { const next = !muted; try { await p2p.setMicrophoneEnabled(!next); setMuted(next); activeCall.update(callId, { muted: next }); } catch { Alert.alert("Chưa thể đổi micro", "Hãy kiểm tra quyền micro rồi thử lại."); } }
  async function toggleSpeaker() { const next = !speaker; try { await p2p.setSpeakerEnabled(next); setSpeaker(next); activeCall.update(callId, { speaker: next }); } catch { Alert.alert("Chưa thể đổi loa", "Vui lòng thử lại sau giây lát."); } }
  async function toggleCamera() { const next = !cameraOn; try { await p2p.setCameraEnabled(next); setCameraOn(next); activeCall.update(callId, { cameraOn: next }); } catch { Alert.alert("Chưa thể đổi camera", "Hãy kiểm tra quyền camera rồi thử lại."); } }
  async function switchCamera() { try { await p2p.switchCamera(); setIsFrontCamera((current) => !current); activeCall.update(callId, { isFrontCamera: !isFrontCamera }); } catch (error) { Alert.alert("Chưa thể đổi camera", error instanceof Error ? error.message : "Vui lòng thử lại."); } }
  async function toggleVideoQuality() { const next = videoQuality === "hd" ? "sd" : "hd"; try { await p2p.setVideoQuality(next); setVideoQuality(next); activeCall.update(callId, { videoQuality: next }); } catch { Alert.alert("Chưa thể đổi chất lượng", "Vui lòng thử lại."); } }

  const connectionStatus = getCallConnectionStatus({ kind, direction, detailsLoading: details.isLoading, isConnecting, connected, isAnswered, error: connectionError, networkState: p2pState });
  const subtitle = connected && isAnswered ? callDuration(seconds) : connectionStatus.title;
  if (details.isLoading && !connected) return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><View style={styles.center}><ActivityIndicator color="#2563EB" /><Text style={styles.statusText}>Đang chuẩn bị P2P…</Text></View></SafeAreaView>;
  if (isGroup) return <SafeAreaView style={styles.safe}><View style={styles.center}><MaterialIcons name="groups" size={42} color="#64748B" /><Text style={styles.groupTitle}>Gọi nhóm đã được dừng</Text><Text style={styles.groupBody}>ChatPHT hiện chỉ dùng gọi và chia sẻ màn hình P2P cho một người với một người.</Text><Pressable style={styles.primaryButton} onPress={() => router.back()}><Text style={styles.primaryButtonText}>Quay lại</Text></Pressable></View></SafeAreaView>;
  if (!connected && direction === "incoming" && !isAnswered) return <SafeAreaView style={[styles.safe, styles.incomingSafe]}><StatusBar barStyle="light-content" backgroundColor="#0D2145" /><View style={styles.incoming}><Text style={styles.secureLabel}>P2P · BẢO MẬT</Text><CallerAvatar name={name} avatarUrl={avatarUrl} style={styles.avatar} /><Text style={styles.nameLight}>{name}</Text>{isConnecting || connectionError ? <Text style={styles.incomingError}>{connectionStatus.title}</Text> : <Text style={styles.incomingSub}>{modeLabel(mode)} đến</Text>}<View style={styles.incomingActions}><RoundAction label="Từ chối" icon="call-end" color="#E8505B" onPress={() => void finish("declined")} /><RoundAction label={isConnecting ? "Đang kết nối" : "Nhận"} icon={mode === "video" ? "videocam" : mode === "screen" ? "screen-share" : "phone"} color="#20A86B" disabled={isConnecting} onPress={() => void enterCall(true)} /></View></View></SafeAreaView>;

  return <SafeAreaView style={[styles.safe, fullVideo && styles.videoSafe]}><StatusBar barStyle={fullVideo ? "light-content" : "dark-content"} /><View style={[styles.container, fullVideo && styles.videoContainer]}>{fullVideo ? <P2pVisualStage mode={mode} localStream={localStream} remoteStream={remoteStream} /> : null}{fullVideo ? <Pressable style={styles.videoTap} onPress={() => setControlsVisible((value) => !value)} /> : null}{showChrome ? <><View style={[styles.top, fullVideo && styles.videoTop]}><Pressable onPress={minimize} style={styles.dismiss}><MaterialIcons name={connected ? "keyboard-arrow-down" : "close"} size={28} color={fullVideo ? "#FFFFFF" : "#183053"} /></Pressable><View style={[styles.secure, fullVideo && styles.secureDark]}><MaterialIcons name="lock" size={13} color={fullVideo ? "#D8E7FF" : "#2563EB"} /><Text style={[styles.secureText, fullVideo && styles.secureTextDark]}>P2P · bảo mật</Text></View><View style={styles.dismiss} /></View><View style={[styles.identity, fullVideo && styles.videoIdentity]}><CallerAvatar name={name} avatarUrl={avatarUrl} style={[styles.avatar, styles.callAvatar]} /><Text style={[styles.name, fullVideo && styles.nameLight]}>{name}</Text><Text style={[styles.statusText, fullVideo && styles.statusLight]}>{subtitle}</Text>{connected ? <Text style={[styles.p2pLabel, fullVideo && styles.statusLight]}>{mode === "screen" ? "P2P · MediaProjection" : `P2P trực tiếp · ${mode === "video" ? videoQuality.toUpperCase() : "Âm thanh"}`}</Text> : <Text style={styles.errorText}>{connectionStatus.description}</Text>}{(isAnswered || direction === "outgoing") ? <NetworkQualityBadge quality={networkQuality} inverse={fullVideo} /> : null}</View><View style={[styles.controls, fullVideo && styles.videoControls]}>{connected ? <>{mode !== "screen" ? <View style={styles.controlRow}><Control label={muted ? "Bật micro" : "Tắt micro"} icon={muted ? "mic-off" : "mic"} active={muted} inverse={fullVideo} onPress={() => void toggleMicrophone()} /><Control label={speaker ? "Loa ngoài" : "Tai nghe"} icon={speaker ? "volume-up" : "hearing"} active={speaker} inverse={fullVideo} onPress={() => void toggleSpeaker()} />{mode === "video" ? <Control label={cameraOn ? "Tắt camera" : "Bật camera"} icon={cameraOn ? "videocam" : "videocam-off"} active={!cameraOn} inverse={fullVideo} onPress={() => void toggleCamera()} /> : null}</View> : <Text style={[styles.screenOnlyHint, fullVideo && styles.statusLight]}>{isCaller ? "Bạn đang phát màn hình cho người nhận." : "Bạn đang xem màn hình được chia sẻ."}</Text>}{mode === "video" && cameraOn ? <View style={styles.controlRow}><Control label="Đổi camera" icon="flip-camera-android" inverse={fullVideo} onPress={() => void switchCamera()} /><Control label={videoQuality === "hd" ? "HD" : "SD"} icon="high-quality" active={videoQuality === "hd"} inverse={fullVideo} onPress={() => void toggleVideoQuality()} /></View> : null}<RoundAction label="Kết thúc" icon="call-end" color="#E8505B" onPress={() => void finish("ended")} /></> : <View style={styles.pending}><RoundAction label="Hủy cuộc gọi" icon="call-end" color="#E8505B" onPress={() => void finish("ended")} /></View>}</View></> : null}</View></SafeAreaView>;
}

function P2pVisualStage({ mode, localStream, remoteStream }: { mode: P2pCallMode; localStream: MediaStream | null; remoteStream: MediaStream | null }) {
  const main = remoteStream;
  return <View style={styles.video}>{main ? <RTCView streamURL={main.toURL()} style={styles.videoTrack} objectFit={mode === "screen" ? "contain" : "cover"} /> : <View style={styles.waiting}>{mode === "screen" ? <><MaterialIcons name="screen-share" size={42} color="#BFDBFE" /><Text style={styles.waitingText}>Bạn đang phát màn hình cho người nhận.</Text></> : <><MaterialIcons name="videocam-off" size={32} color="#D9E6FF" /><Text style={styles.waitingText}>Đang thiết lập hình ảnh P2P…</Text></>}</View>}{mode === "video" && localStream ? <View style={styles.localPreview}><RTCView streamURL={localStream.toURL()} style={styles.videoTrack} objectFit="cover" /></View> : null}</View>;
}

const NETWORK_QUALITY_ICON: Record<P2pNetworkQuality["level"], React.ComponentProps<typeof MaterialIcons>["name"]> = { connecting: "sync", good: "wifi", weak: "wifi", offline: "wifi-off" };
const NETWORK_QUALITY_STYLE: Record<P2pNetworkQuality["level"], { container: ViewStyle; text: TextStyle; iconColor: string }> = {
  connecting: { container: { backgroundColor: "#E7F0FF" }, text: { color: "#1D4ED8" }, iconColor: "#2563EB" },
  good: { container: { backgroundColor: "#DCFCE7" }, text: { color: "#167A44" }, iconColor: "#168043" },
  weak: { container: { backgroundColor: "#FFF0CF" }, text: { color: "#975B00" }, iconColor: "#A86700" },
  offline: { container: { backgroundColor: "#FEE2E2" }, text: { color: "#B91C1C" }, iconColor: "#C53030" },
};

function NetworkQualityBadge({ quality, inverse = false }: { quality: P2pNetworkQuality; inverse?: boolean }) {
  const palette = NETWORK_QUALITY_STYLE[quality.level];
  return <View accessibilityLabel={quality.description} style={[styles.networkBadge, palette.container, inverse && styles.networkBadgeInverse]}><MaterialIcons name={NETWORK_QUALITY_ICON[quality.level]} size={15} color={palette.iconColor} /><Text style={[styles.networkBadgeText, palette.text, inverse && styles.networkBadgeTextInverse]}>{quality.label}</Text></View>;
}

function Control({ label, icon, active = false, inverse = false, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; active?: boolean; inverse?: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={({ pressed }) => [styles.control, inverse && styles.controlInverse, active && styles.controlActive, pressed && styles.pressed]}><MaterialIcons name={icon} size={24} color={inverse ? "#FFFFFF" : "#1E4E91"} /><Text style={[styles.controlText, inverse && styles.controlTextInverse]}>{label}</Text></Pressable>; }
function RoundAction({ label, icon, color, disabled, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; color: string; disabled?: boolean; onPress: () => void }) { return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.roundWrap, disabled && { opacity: 0.55 }, pressed && styles.pressed]}><View style={[styles.round, { backgroundColor: color }]}><MaterialIcons name={icon} size={30} color="#FFFFFF" /></View><Text style={styles.roundText}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F8FF" }, videoSafe: { backgroundColor: "#061426" }, container: { flex: 1, alignItems: "center", padding: 20 }, videoContainer: { backgroundColor: "#061426", padding: 0 }, center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 14 }, top: { width: "100%", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, videoTop: { position: "absolute", top: 14, zIndex: 5, paddingHorizontal: 18 }, dismiss: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#FFFFFFCC", alignItems: "center", justifyContent: "center" }, secure: { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#E7F0FF", borderRadius: 20 }, secureDark: { backgroundColor: "#0F274BCC" }, secureText: { fontSize: 12, fontWeight: "800", color: "#2563EB" }, secureTextDark: { color: "#D8E7FF" }, identity: { alignItems: "center", flex: 1, justifyContent: "center", gap: 10 }, videoIdentity: { position: "absolute", top: 94, alignSelf: "center", zIndex: 4 }, avatar: { width: 104, height: 104, borderRadius: 52, backgroundColor: "#1E4E91", overflow: "hidden", alignItems: "center", justifyContent: "center" }, callAvatar: { width: 88, height: 88, borderRadius: 44 }, avatarImage: { width: "100%", height: "100%" }, avatarText: { color: "#FFFFFF", fontWeight: "800", fontSize: 42 }, name: { fontSize: 26, fontWeight: "800", color: "#183053" }, nameLight: { color: "#FFFFFF", fontSize: 26, fontWeight: "800" }, statusText: { color: "#64748B", fontSize: 15, textAlign: "center" }, statusLight: { color: "#D7E8FF" }, p2pLabel: { color: "#2563EB", fontSize: 13, fontWeight: "700" }, networkBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14 }, networkBadgeInverse: { backgroundColor: "#0F274BCC" }, networkBadgeText: { fontSize: 12, fontWeight: "800" }, networkBadgeTextInverse: { color: "#EAF3FF" }, controls: { width: "100%", gap: 18, paddingBottom: 18 }, videoControls: { position: "absolute", bottom: 22, width: "100%", paddingHorizontal: 20, zIndex: 5 }, controlRow: { flexDirection: "row", justifyContent: "center", gap: 18 }, control: { minWidth: 76, maxWidth: 96, alignItems: "center", gap: 6, paddingVertical: 10 }, controlInverse: { backgroundColor: "#102A4FCC", borderRadius: 20 }, controlActive: { backgroundColor: "#DBEAFE", borderRadius: 20 }, controlText: { color: "#183053", fontSize: 11, fontWeight: "700", textAlign: "center" }, controlTextInverse: { color: "#FFFFFF" }, roundWrap: { alignItems: "center", alignSelf: "center", gap: 6 }, round: { width: 62, height: 62, borderRadius: 31, alignItems: "center", justifyContent: "center" }, roundText: { fontSize: 13, fontWeight: "700", color: "#183053" }, pending: { alignItems: "center" }, incomingSafe: { backgroundColor: "#0D2145" }, incoming: { flex: 1, alignItems: "center", justifyContent: "center", gap: 18, padding: 24 }, secureLabel: { color: "#BFD9FF", fontWeight: "800", letterSpacing: 1 }, incomingSub: { color: "#D7E8FF", fontSize: 16 }, incomingError: { color: "#FECACA", fontSize: 14, textAlign: "center" }, incomingActions: { flexDirection: "row", gap: 72, marginTop: 32 }, errorText: { color: "#B91C1C", fontSize: 14, textAlign: "center" }, groupTitle: { fontSize: 22, fontWeight: "800", color: "#183053" }, groupBody: { fontSize: 15, lineHeight: 22, color: "#64748B", textAlign: "center" }, primaryButton: { marginTop: 10, backgroundColor: "#2563EB", paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14 }, primaryButtonText: { color: "#FFFFFF", fontWeight: "800" }, video: { ...StyleSheet.absoluteFillObject, backgroundColor: "#061426" }, videoTrack: { width: "100%", height: "100%" }, waiting: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }, waitingText: { color: "#D9E6FF", fontSize: 15, textAlign: "center", paddingHorizontal: 28 }, localPreview: { position: "absolute", right: 16, top: 76, width: 112, height: 164, borderRadius: 15, overflow: "hidden", borderWidth: 2, borderColor: "#FFFFFFAA", backgroundColor: "#0F274B" }, screenOnlyHint: { textAlign: "center", color: "#183053", fontSize: 14, fontWeight: "700", paddingHorizontal: 22 }, videoTap: { ...StyleSheet.absoluteFillObject, zIndex: 2 }, pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
