import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Camera } from "expo-camera";
import ExpoPip from "expo-pip";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Platform, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, View } from "react-native";
import { LiveKitRoom, useSpeakingParticipants, useTracks, VideoTrack } from "@livekit/react-native";
import { Room, Track } from "livekit-client";
import { RTCView, type MediaStream } from "@livekit/react-native-webrtc";

import { activeCall } from "@/lib/active-call";
import { getCallConnectionStatus, type CallConnectionStatus } from "@/lib/call-connection-status";
import { getCallNetworkQuality, type LiveKitConnectionQuality } from "@/lib/call-network-quality";
import { createCallTonePlayer, stopAllCallAlerts, stopCallTone } from "@/lib/call-sounds";
import { P2P_FALLBACK_TIMEOUT_MS, selectInitialCallTransport, shouldFallbackToLiveKit, type CallTransport } from "@/lib/call-transport-policy";
import { LiveKitCall, type VideoQualityMode } from "@/lib/livekit-call";
import { P2pCall, type P2pConnectionState, type P2pSignal } from "@/lib/p2p-call";
import { trpc } from "@/lib/trpc";

type CallKind = "audio" | "video";
type Direction = "incoming" | "outgoing";

function callDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  return `${minutes}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export default function CallScreen() {
  const params = useLocalSearchParams<{ callId?: string; kind?: CallKind; direction?: Direction; name?: string; group?: string }>();
  const callId = params.callId ?? "";
  const kind = params.kind === "video" ? "video" : "audio";
  const direction = params.direction === "incoming" ? "incoming" : "outgoing";
  const name = params.name || "Liên hệ ChatPHT";
  const resumed = activeCall.get(callId);
  const [connected, setConnected] = useState(Boolean(resumed?.connected));
  const [muted, setMuted] = useState(resumed?.muted ?? false);
  const [speaker, setSpeaker] = useState(resumed?.speaker ?? kind === "video");
  const [cameraOn, setCameraOn] = useState(resumed?.cameraOn ?? kind === "video");
  const [isFrontCamera, setIsFrontCamera] = useState(resumed?.isFrontCamera ?? true);
  const [videoQuality, setVideoQuality] = useState<VideoQualityMode>(resumed?.videoQuality ?? "hd");
  const [seconds, setSeconds] = useState(resumed?.seconds ?? 0);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [networkStats, setNetworkStats] = useState<{ pingMs: number | null; connectionQuality: LiveKitConnectionQuality }>({ pingMs: null, connectionQuality: "unknown" });
  const [controlsVisible, setControlsVisible] = useState(true);
  const [transport, setTransport] = useState<CallTransport>(params.group === "true" || params.group === "1" || resumed?.isGroup === true ? "livekit" : "p2p");
  const [p2pState, setP2pState] = useState<P2pConnectionState>("idle");
  const [p2pRemoteStream, setP2pRemoteStream] = useState<MediaStream | null>(null);
  const [p2pLocalStream, setP2pLocalStream] = useState<MediaStream | null>(null);
  const call = useRef(resumed?.call ?? new LiveKitCall()).current;
  const p2p = useRef(new P2pCall()).current;
  const ringingScale = useRef(new Animated.Value(1)).current;
  const ringbackTone = useRef<Awaited<ReturnType<typeof createCallTonePlayer>> | null>(null);
  const started = useRef(Boolean(resumed?.connected));
  const finalized = useRef(false);
  const details = trpc.calls.get.useQuery({ callId }, { enabled: Boolean(callId), refetchInterval: 900 });
  const answer = trpc.calls.answer.useMutation();
  const join = trpc.calls.join.useMutation();
  const joinGroup = trpc.calls.joinGroup.useMutation();
  const leaveGroup = trpc.calls.leaveGroup.useMutation();
  const fallbackToLiveKit = trpc.calls.fallbackToLiveKit.useMutation();
  const sendP2pSignal = trpc.calls.p2pSignal.send.useMutation();
  const decline = trpc.calls.decline.useMutation();
  const end = trpc.calls.end.useMutation();
  const answeredAt = details.data?.answeredAt ? new Date(details.data.answeredAt).getTime() : null;
  const isAnswered = details.data?.status === "active";
  const isGroup = params.group === "true" || params.group === "1" || resumed?.isGroup === true || details.data?.isGroup === true;
  const isCaller = details.data?.isCaller === true || direction === "outgoing";
  const p2pAttempting = !isGroup && transport === "p2p" && p2pState !== "idle" && p2pState !== "closed";
  const p2pSignals = trpc.calls.p2pSignal.drain.useQuery({ callId }, { enabled: Boolean(callId) && p2pAttempting, refetchInterval: p2pAttempting ? 350 : false });
  const p2pIceConfig = trpc.calls.p2pIceConfig.useQuery(
    { callId },
    { enabled: Boolean(callId) && !isGroup && transport === "p2p" && isAnswered },
  );
  const handledP2pSignals = useRef(new Set<number>());
  const isFullVideo = connected && kind === "video";
  const showCallChrome = !isFullVideo || controlsVisible;

  useEffect(() => () => {
    if (!activeCall.isMinimized(callId)) void call.disconnect();
    void p2p.disconnect();
    stopAllCallAlerts();
    stopCallTone(ringbackTone.current);
  }, [call, callId, p2p]);

  useEffect(() => {
    (p2pSignals.data ?? []).forEach((signal) => {
      if (handledP2pSignals.current.has(signal.id)) return;
      handledP2pSignals.current.add(signal.id);
      void p2p.handleSignal({ type: signal.type, payload: signal.payload }).catch(() => undefined);
    });
  }, [p2p, p2pSignals.data]);

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
    if (!connected || transport !== "livekit") {
      setNetworkStats({ pingMs: null, connectionQuality: "unknown" });
      return;
    }
    let active = true;
    const refreshNetworkStats = () => {
      try {
        const stats = call.getNetworkStats();
        if (active) setNetworkStats(stats);
      } catch {
        // A room can disconnect while the interval is queued; never crash the incoming-call screen.
        if (active) setNetworkStats({ pingMs: null, connectionQuality: "unknown" });
      }
    };
    refreshNetworkStats();
    const timer = setInterval(refreshNetworkStats, 3000);
    return () => { active = false; clearInterval(timer); };
  }, [call, connected, transport]);

  useEffect(() => {
    if (Platform.OS !== "android" || kind !== "video" || !connected || !ExpoPip.isAvailable()) return;
    ExpoPip.setPictureInPictureParams({ width: 16, height: 9, title: "ChatPHT", subtitle: "Cuộc gọi video đang diễn ra", seamlessResizeEnabled: true, autoEnterEnabled: true });
  }, [connected, kind]);

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

  function publishActiveState(next: { muted?: boolean; speaker?: boolean; cameraOn?: boolean; isFrontCamera?: boolean; videoQuality?: VideoQualityMode; seconds?: number } = {}) {
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
      videoQuality: next.videoQuality ?? videoQuality,
      seconds: next.seconds ?? seconds,
      isGroup,
      provider: transport,
    });
  }

  async function switchToLiveKit() {
    if (isGroup || transport === "livekit") return;
    try {
      setIsConnecting(true);
      const result = await fallbackToLiveKit.mutateAsync({ callId });
      await p2p.disconnect();
      setP2pRemoteStream(null);
      setP2pLocalStream(null);
      setTransport("livekit");
      await call.connect(result.session, kind);
      setConnected(true);
      publishActiveState({ seconds: 0 });
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : "Không thể chuyển sang LiveKit.");
    } finally {
      setIsConnecting(false);
    }
  }

  async function startP2p(isAnswer: boolean) {
    const policy = selectInitialCallTransport({ isGroup: false, participantCount: 2, p2pSupported: Platform.OS !== "web" });
    if (policy.transport !== "p2p") return switchToLiveKit();
    setTransport("p2p");
    setP2pState("connecting");
    const iceConfig = p2pIceConfig.data ?? (await p2pIceConfig.refetch()).data;
    await p2p.start({
      isCaller: !isAnswer,
      kind,
      iceServers: iceConfig?.iceServers,
      onSignal: async (signal: P2pSignal) => { await sendP2pSignal.mutateAsync({ callId, ...signal }); },
      onState: (state) => {
        setP2pState(state);
        if (state === "connected") {
          setConnected(true);
          setConnectionError(null);
        } else if (state === "failed") {
          void switchToLiveKit();
        }
      },
      onRemoteStream: setP2pRemoteStream,
    });
    setP2pLocalStream(p2p.getLocalStream());
  }

  useEffect(() => {
    if (!p2pAttempting || p2pState === "connected") return;
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      if (shouldFallbackToLiveKit({ elapsedMs: Date.now() - startedAt, p2pConnected: p2p.isConnected() })) void switchToLiveKit();
    }, P2P_FALLBACK_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2pAttempting, p2pState]);

  useEffect(() => {
    const shouldStartCallerP2p =
      !isGroup &&
      isCaller &&
      details.data?.provider === "p2p" &&
      details.data.status === "active" &&
      p2pState === "idle" &&
      !isConnecting &&
      !finalized.current;
    if (!shouldStartCallerP2p) return;
    void startP2p(false).catch((error) => {
      setConnectionError(error instanceof Error ? error.message : "Không thể thiết lập P2P.");
      void switchToLiveKit();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details.data?.provider, details.data?.status, isCaller, isConnecting, isGroup, p2pState]);

  async function enterCall(isAnswer: boolean) {
    if (!callId || isConnecting) return;
    setConnectionError(null);
    if (!(await requestPermissions())) return;
    // The global watcher remains mounted on this screen; stop feedback before waiting for the API response.
    stopAllCallAlerts();
    setIsConnecting(true);
    try {
      const callProvider = isGroup ? "livekit" : (details.data?.provider ?? "p2p");
      if (isGroup) {
        const result = await joinGroup.mutateAsync({ callId });
        await call.connect(result.session, kind);
        setTransport("livekit");
      } else if (isAnswer) {
        const result = await answer.mutateAsync({ callId });
        if (callProvider === "p2p") await startP2p(true);
        else {
          if (!result.session) throw new Error("Không nhận được phiên LiveKit cho cuộc gọi.");
          setTransport("livekit");
          await call.connect(result.session, kind);
        }
      } else {
        if (callProvider === "p2p") {
          // The caller waits for the recipient to accept before creating an offer.
          // This makes the five-second fallback window measure connection setup only,
          // never the user-facing ringing period.
          setConnected(true);
        }
        else {
          const session = await join.mutateAsync({ callId });
          setTransport("livekit");
          await call.connect(session, kind);
        }
      }
      setConnectionError(null);
      if (callProvider === "livekit") {
        setConnected(true);
        publishActiveState({ seconds: 0 });
      }
    } catch (error) {
      if (isAnswer && !isGroup) void end.mutateAsync({ callId }).catch(() => undefined);
      await call.disconnect().catch(() => undefined);
      await p2p.disconnect().catch(() => undefined);
      const message = error instanceof Error ? error.message : "Hãy thử lại khi mạng ổn định hơn.";
      setConnectionError(message);
      Alert.alert("Chưa thể kết nối", message);
    } finally {
      setIsConnecting(false);
    }
  }

  async function finish(status: "ended" | "declined") {
    finalized.current = true;
    stopAllCallAlerts();
    stopCallTone(ringbackTone.current);
    ringbackTone.current = null;
    try {
      if (isGroup) {
        if (isCaller && status === "ended") await end.mutateAsync({ callId });
        else await leaveGroup.mutateAsync({ callId });
      } else if (status === "declined") await decline.mutateAsync({ callId });
      else await end.mutateAsync({ callId });
    } catch {
      // The local WebRTC connection must always be released even if the status request times out.
    } finally {
      activeCall.clear(callId);
      await call.disconnect().catch(() => undefined);
      await p2p.disconnect().catch(() => undefined);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    }
  }

  function minimize() {
    if (!connected) {
      void finish("ended");
      return;
    }
    if (Platform.OS === "android" && kind === "video" && ExpoPip.isAvailable()) {
      try {
        ExpoPip.enterPipMode({ width: 16, height: 9, title: "ChatPHT", subtitle: "Cuộc gọi video đang diễn ra", seamlessResizeEnabled: true });
        return;
      } catch {
        // Older Android devices or OEM builds can reject PiP; keep the existing in-app overlay as a safe fallback.
      }
    }
    publishActiveState();
    activeCall.minimize(callId);
    router.back();
  }

  async function toggleMicrophone() {
    const next = !muted;
    try {
      if (transport === "p2p") await p2p.setMicrophoneEnabled(!next);
      else await call.setMicrophoneEnabled(!next);
      setMuted(next);
      activeCall.update(callId, { muted: next });
    } catch (error) {
      Alert.alert("Chưa thể đổi micro", error instanceof Error ? error.message : "Hãy kiểm tra quyền micro rồi thử lại.");
    }
  }

  async function toggleSpeaker() {
    const next = !speaker;
    try {
      if (transport === "p2p") await p2p.setSpeakerEnabled(next);
      else await call.setSpeakerEnabled(next);
      setSpeaker(next);
      activeCall.update(callId, { speaker: next });
    } catch {
      Alert.alert("Chưa thể đổi loa", "Vui lòng thử lại sau giây lát.");
    }
  }

  async function toggleCamera() {
    const next = !cameraOn;
    try {
      if (transport === "p2p") await p2p.setCameraEnabled(next);
      else await call.setCameraEnabled(next);
      setCameraOn(next);
      activeCall.update(callId, { cameraOn: next });
    } catch (error) {
      Alert.alert("Chưa thể đổi trạng thái camera", error instanceof Error ? error.message : "Hãy kiểm tra quyền camera rồi thử lại.");
    }
  }

  async function switchCamera() {
    try {
      const nextIsFrontCamera = transport === "p2p" ? !isFrontCamera : await call.switchCamera();
      if (transport === "p2p") await p2p.switchCamera();
      setIsFrontCamera(nextIsFrontCamera);
      activeCall.update(callId, { isFrontCamera: nextIsFrontCamera });
    } catch (error) {
      Alert.alert("Chưa thể đổi camera", error instanceof Error ? error.message : "Vui lòng thử lại sau giây lát.");
    }
  }

  async function toggleVideoQuality() {
    const next: VideoQualityMode = videoQuality === "hd" ? "sd" : "hd";
    try {
      if (transport === "p2p") await p2p.setVideoQuality(next);
      else await call.setVideoQuality(next);
      setVideoQuality(next);
      activeCall.update(callId, { videoQuality: next });
    } catch (error) {
      Alert.alert("Chưa thể đổi chất lượng", error instanceof Error ? error.message : "Vui lòng thử lại sau giây lát.");
    }
  }

  const connectionStatus = getCallConnectionStatus({
    kind,
    direction,
    detailsLoading: details.isLoading,
    isConnecting,
    connected,
    isAnswered,
    error: connectionError,
  });
  const subtitle = connected && isAnswered ? callDuration(seconds) : connectionStatus.title;
  const networkQuality = getCallNetworkQuality(networkStats);

  if (details.isLoading && !connected) {
    return <SafeAreaView style={styles.safe}><StatusBar barStyle="dark-content" /><View style={styles.center}><ConnectionStatus status={connectionStatus} /></View></SafeAreaView>;
  }

  if (!connected && direction === "incoming") {
    return (
      <SafeAreaView style={[styles.safe, styles.incomingSafe]}>
        <StatusBar barStyle="light-content" backgroundColor="#0D2145" />
        <View style={styles.incoming}>
          <View style={styles.incomingGlowOne} /><View style={styles.incomingGlowTwo} />
          <View style={[styles.brandPill, styles.incomingBrandPill]}><MaterialIcons name="lock" size={14} color="#D7E8FF" /><Text style={styles.incomingBrandPillText}>{isGroup ? "NHÓM · LIVEKIT" : "KẾT NỐI RIÊNG TƯ"}</Text></View>
          <Text style={styles.eyebrow}>{isGroup ? (kind === "video" ? "CUỘC GỌI VIDEO NHÓM" : "CUỘC GỌI THOẠI NHÓM") : (kind === "video" ? "CUỘC GỌI VIDEO ĐẾN" : "CUỘC GỌI THOẠI ĐẾN")}</Text>
          <Animated.View style={[styles.avatar, { transform: [{ scale: ringingScale }] }]}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></Animated.View>
          <Text style={[styles.name, styles.incomingName]}>{name}</Text>{isConnecting || connectionError ? <ConnectionStatus status={connectionStatus} /> : <Text style={[styles.mutedText, styles.incomingSubtext]}>{subtitle}</Text>}
          <View style={styles.incomingActions}><RoundAction label="Từ chối" icon="call-end" color="#E8505B" inverse onPress={() => void finish("declined")} /><RoundAction label={isConnecting ? "Đang kết nối" : "Nhận"} icon={kind === "video" ? "videocam" : "phone"} color="#20A86B" inverse disabled={isConnecting} onPress={() => void enterCall(true)} /></View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, isFullVideo && styles.videoSafe]}>
      <StatusBar barStyle={isFullVideo ? "light-content" : "dark-content"} />
      <View style={[styles.container, isFullVideo && styles.videoContainer]}>
        {isFullVideo ? transport === "livekit" ? <LiveKitRoom room={call.getRoom() as unknown as Room} serverUrl={undefined} token={undefined} connect={false}><VideoStage room={call.getRoom() as unknown as Room} isGroup={isGroup} /></LiveKitRoom> : <P2pVideoStage localStream={p2pLocalStream} remoteStream={p2pRemoteStream} /> : null}
        {isFullVideo ? <Pressable style={styles.videoTapArea} onPress={() => setControlsVisible((visible) => !visible)} accessibilityRole="button" accessibilityLabel="Ẩn hoặc hiện điều khiển cuộc gọi" /> : null}
        {showCallChrome ? <View style={[styles.top, isFullVideo && styles.videoTop]}>
          <Pressable onPress={minimize} style={({ pressed }) => [styles.dismiss, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={connected && kind === "video" && Platform.OS === "android" ? "Thu nhỏ thành cửa sổ PiP" : connected ? "Thu nhỏ cuộc gọi" : "Hủy cuộc gọi"}><MaterialIcons name={connected ? "keyboard-arrow-down" : "close"} size={28} color={isFullVideo ? "#FFFFFF" : "#183053"} /></Pressable>
          <View style={[styles.secure, isFullVideo && styles.videoSecure]}><MaterialIcons name="lock" size={13} color={isFullVideo ? "#D8E7FF" : "#2563EB"} /><Text style={[styles.secureText, isFullVideo && styles.videoSecureText]}>{isGroup ? "Nhóm · LiveKit" : transport === "p2p" ? "P2P · bảo mật" : "LiveKit · bảo mật"}</Text></View><View style={styles.dismissPlaceholder} />
        </View> : null}
        {showCallChrome ? <View style={[styles.identity, isFullVideo && styles.videoIdentity]}><View style={[styles.avatar, styles.callAvatar, isFullVideo && styles.videoAvatar]}><Text style={styles.avatarText}>{name.slice(0, 1).toUpperCase()}</Text></View><Text style={[styles.name, isFullVideo && styles.videoText]}>{name}</Text>{connected ? <><Text style={[styles.mutedText, isFullVideo && styles.videoSubtext]}>{subtitle}</Text><Text style={[styles.quality, isFullVideo && styles.videoQuality]}>{isGroup ? "Phòng nhóm LiveKit tối đa 8 người" : transport === "p2p" ? `P2P trực tiếp · ${videoQuality.toUpperCase()}` : "LiveKit · kết nối dự phòng"}</Text>{transport === "livekit" ? <NetworkQualityBadge quality={networkQuality} inverse={isFullVideo} /> : null}</> : <ConnectionStatus status={connectionStatus} />}</View> : null}
        {showCallChrome ? <View style={[styles.controls, isFullVideo && styles.videoControls]}>
          {connected ? <><View style={styles.controlRow}><Control label={muted ? "Bật micro" : "Tắt micro"} icon={muted ? "mic-off" : "mic"} active={muted} inverse={isFullVideo} onPress={() => void toggleMicrophone()} /><Control label={speaker ? "Loa ngoài" : "Tai nghe"} icon={speaker ? "volume-up" : "hearing"} active={speaker} inverse={isFullVideo} onPress={() => void toggleSpeaker()} />{kind === "video" ? <Control label={cameraOn ? "Tắt camera" : "Bật camera"} icon={cameraOn ? "videocam" : "videocam-off"} active={!cameraOn} inverse={isFullVideo} onPress={() => void toggleCamera()} /> : null}</View>{kind === "video" && cameraOn ? <View style={styles.secondaryControls}><Control label={isFrontCamera ? "Camera trước" : "Camera sau"} icon="flip-camera-android" active={false} inverse={isFullVideo} onPress={() => void switchCamera()} /><Control label={videoQuality === "hd" ? "HD" : "SD"} icon="high-quality" active={videoQuality === "hd"} inverse={isFullVideo} onPress={() => void toggleVideoQuality()} /></View> : null}<RoundAction label={isGroup && !isCaller ? "Rời nhóm" : "Kết thúc"} icon="call-end" color="#E8505B" inverse={isFullVideo} onPress={() => void finish("ended")} /></> : <View style={styles.pending}><RoundAction label={isGroup ? "Rời nhóm" : "Hủy cuộc gọi"} icon="call-end" color="#E8505B" onPress={() => void finish("ended")} /></View>}
        </View> : null}
      </View>
    </SafeAreaView>
  );
}

function P2pVideoStage({ localStream, remoteStream }: { localStream: MediaStream | null; remoteStream: MediaStream | null }) {
  return (
    <View style={styles.video}>
      {remoteStream ? <RTCView streamURL={remoteStream.toURL()} style={styles.videoTrack} objectFit="cover" /> : <View style={styles.videoWaiting}><MaterialIcons name="videocam-off" size={30} color="#D9E6FF" /><Text style={styles.videoWaitingText}>Đang thiết lập hình ảnh P2P…</Text></View>}
      {localStream ? <View style={styles.localPreview}><RTCView streamURL={localStream.toURL()} style={styles.videoTrack} objectFit="cover" mirror /></View> : <View style={styles.localPreviewPlaceholder}><MaterialIcons name="videocam" size={19} color="#BFDBFE" /><Text style={styles.localPreviewText}>Đang mở camera</Text></View>}
    </View>
  );
}

function VideoStage({ room, isGroup }: { room: Room; isGroup: boolean }) {
  const tracks = useTracks([Track.Source.Camera], { room, onlySubscribed: false });
  const speakers = useSpeakingParticipants({ room });
  const speakingIdentities = new Set(speakers.map((participant) => participant.identity));
  const videoTracks = tracks.filter((item) => item.publication?.track).slice(0, 8);
  const remoteTrack = videoTracks.find((item) => !item.participant.isLocal);
  const localTrack = videoTracks.find((item) => item.participant.isLocal);
  if (isGroup) {
    return <View style={styles.video}><View style={styles.groupVideoGrid}>{videoTracks.length ? videoTracks.map((item) => <View key={`${item.participant.identity}-${item.source}`} style={[styles.groupTile, speakingIdentities.has(item.participant.identity) && styles.groupTileSpeaking]}><VideoTrack trackRef={item} style={styles.videoTrack} mirror={item.participant.isLocal} zOrder={0} /><View style={styles.groupTileLabel}><MaterialIcons name={speakingIdentities.has(item.participant.identity) ? "graphic-eq" : "person"} size={13} color="#F5FAFF" /><Text numberOfLines={1} style={styles.groupTileName}>{item.participant.name || item.participant.identity}</Text></View></View>) : <View style={styles.videoWaiting}><MaterialIcons name="groups" size={32} color="#D9E6FF" /><Text style={styles.videoWaitingText}>Đang chờ thành viên bật camera…</Text></View>}</View><Text style={styles.groupCapacity}>{videoTracks.length}/8 camera đang hiển thị</Text></View>;
  }
  return (
    <View style={styles.video}>
      {remoteTrack ? <VideoTrack trackRef={remoteTrack} style={styles.videoTrack} mirror={false} zOrder={0} /> : <View style={styles.videoWaiting}><MaterialIcons name="videocam-off" size={30} color="#D9E6FF" /><Text style={styles.videoWaitingText}>Đang chờ hình ảnh từ người bên kia…</Text></View>}
      {localTrack ? <View style={styles.localPreview}><VideoTrack trackRef={localTrack} style={styles.videoTrack} mirror zOrder={1} /></View> : <View style={styles.localPreviewPlaceholder}><MaterialIcons name="videocam" size={19} color="#BFDBFE" /><Text style={styles.localPreviewText}>Đang mở camera</Text></View>}
    </View>
  );
}

function ConnectionStatus({ status }: { status: CallConnectionStatus }) {
  const isError = status.phase === "error";
  return <View style={[styles.connectionStatus, isError && styles.connectionStatusError]} accessibilityLiveRegion="polite" accessibilityLabel={`${status.title}. ${status.description}`}><View style={styles.connectionStatusIcon}>{isError ? <MaterialIcons name="error-outline" size={22} color="#D6404B" /> : <ActivityIndicator size="small" color="#2563EB" />}</View><View style={styles.connectionStatusContent}><Text style={[styles.connectionStatusTitle, isError && styles.connectionStatusTitleError]}>{status.title}</Text><Text style={[styles.connectionStatusDetail, isError && styles.connectionStatusDetailError]}>{status.description}</Text></View></View>;
}

function NetworkQualityBadge({ quality, inverse }: { quality: ReturnType<typeof getCallNetworkQuality>; inverse: boolean }) {
  return <View style={[styles.networkBadge, inverse && styles.networkBadgeInverse]} accessibilityLabel={`${quality.label}. ${quality.detail}`}><MaterialIcons name={quality.icon} size={16} color={quality.color} /><Text style={[styles.networkLabel, inverse && styles.networkLabelInverse, { color: inverse ? "#E5F0FF" : quality.color }]}>{quality.label}</Text><Text style={[styles.networkDetail, inverse && styles.networkDetailInverse]}>{quality.detail}</Text></View>;
}

function Control({ label, icon, active, inverse, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; active: boolean; inverse?: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.control, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label}><View style={[styles.controlIcon, active && styles.controlActive, inverse && styles.inverseControlIcon]}><MaterialIcons name={icon} size={22} color={active ? "#FFFFFF" : inverse ? "#FFFFFF" : "#1D4ED8"} /></View><Text style={[styles.controlLabel, inverse && styles.inverseLabel]}>{label}</Text></Pressable>;
}

function RoundAction({ label, icon, color, inverse, disabled = false, onPress }: { label: string; icon: React.ComponentProps<typeof MaterialIcons>["name"]; color: string; inverse?: boolean; disabled?: boolean; onPress: () => void }) {
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, disabled && styles.actionDisabled, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}><View style={[styles.actionIcon, { backgroundColor: color }]}><MaterialIcons name={icon} size={29} color="#FFF" /></View><Text style={[styles.actionLabel, inverse && styles.inverseLabel]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F5F8FF" },
  incomingSafe: { backgroundColor: "#0D2145" },
  videoSafe: { backgroundColor: "#0D1B33" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  incoming: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28, paddingBottom: 42, overflow: "hidden", backgroundColor: "#0D2145" },
  incomingGlowOne: { position: "absolute", width: 390, height: 390, borderRadius: 195, top: -145, right: -125, backgroundColor: "rgba(42, 109, 213, 0.3)" },
  incomingGlowTwo: { position: "absolute", width: 300, height: 300, borderRadius: 150, bottom: -125, left: -100, backgroundColor: "rgba(21, 151, 126, 0.2)" },
  brandPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: "#E7F0FF", marginBottom: 30 },
  brandPillText: { color: "#2563EB", fontSize: 11, fontWeight: "800", letterSpacing: 0.7 },
  incomingBrandPill: { backgroundColor: "rgba(214, 231, 255, 0.14)" },
  incomingBrandPillText: { color: "#D7E8FF", fontSize: 11, fontWeight: "800", letterSpacing: 0.7 },
  eyebrow: { color: "#2563EB", fontSize: 12, fontWeight: "800", letterSpacing: 1.05, marginBottom: 30 },
  avatar: { width: 132, height: 132, borderRadius: 66, alignItems: "center", justifyContent: "center", backgroundColor: "#3775E8", shadowColor: "#2563EB", shadowOpacity: 0.24, shadowRadius: 20, elevation: 6 },
  callAvatar: { width: 96, height: 96, borderRadius: 48, shadowOpacity: 0.16, shadowRadius: 14 },
  videoAvatar: { width: 58, height: 58, borderRadius: 29, shadowOpacity: 0 },
  avatarText: { color: "#FFF", fontSize: 48, fontWeight: "800" },
  name: { color: "#172554", fontSize: 27, fontWeight: "800", marginTop: 22 },
  incomingName: { color: "#FFFFFF" },
  incomingSubtext: { color: "#D7E8FF" },
  mutedText: { color: "#62718D", fontSize: 15, marginTop: 7, textAlign: "center" },
  connectionStatus: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 10, maxWidth: 310, marginTop: 14, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 16, backgroundColor: "#EAF2FF" },
  connectionStatusError: { backgroundColor: "#FFF0F1" },
  connectionStatusIcon: { width: 24, alignItems: "center" },
  connectionStatusContent: { flex: 1 },
  connectionStatusTitle: { color: "#1E3A8A", fontSize: 14, fontWeight: "800" },
  connectionStatusTitleError: { color: "#B4232C" },
  connectionStatusDetail: { color: "#53647F", fontSize: 12, lineHeight: 17, marginTop: 2 },
  connectionStatusDetailError: { color: "#9F2D35" },
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
  networkBadge: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 10, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 14, backgroundColor: "#F0F7FF" },
  networkBadgeInverse: { backgroundColor: "rgba(15, 38, 77, 0.72)" },
  networkLabel: { fontSize: 12, fontWeight: "800" },
  networkLabelInverse: { color: "#E5F0FF" },
  networkDetail: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  networkDetailInverse: { color: "#C9DCFA" },
  controls: { alignItems: "center", gap: 18, backgroundColor: "#FFFFFF", borderRadius: 28, paddingVertical: 16, shadowColor: "#1E3A8A", shadowOpacity: 0.11, shadowRadius: 16, elevation: 4 },
  controlRow: { flexDirection: "row", gap: 20 },
  secondaryControls: { flexDirection: "row", justifyContent: "center", gap: 20, marginTop: -4 },
  control: { width: 78, alignItems: "center" },
  controlIcon: { width: 56, height: 56, borderRadius: 28, justifyContent: "center", alignItems: "center", backgroundColor: "#E7F0FF" },
  inverseControlIcon: { backgroundColor: "rgba(255,255,255,0.2)" },
  controlActive: { backgroundColor: "#60718F" },
  controlLabel: { color: "#3C4B68", fontSize: 11, fontWeight: "600", marginTop: 7, textAlign: "center" },
  inverseLabel: { color: "#F7FAFF" },
  action: { alignItems: "center" },
  actionDisabled: { opacity: 0.58 },
  actionIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" },
  actionLabel: { color: "#334155", fontSize: 13, fontWeight: "800", marginTop: 7 },
  pending: { alignItems: "center" },
  videoContainer: { padding: 0, overflow: "hidden" },
  videoTapArea: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  video: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: "#0D1B33", alignItems: "center", justifyContent: "center" },
  videoTrack: { flex: 1, width: "100%" },
  groupVideoGrid: { flex: 1, width: "100%", flexDirection: "row", flexWrap: "wrap", alignContent: "center", justifyContent: "center", gap: 4, padding: 4 },
  groupTile: { width: "49%", aspectRatio: 0.74, overflow: "hidden", backgroundColor: "#1B2E50", borderWidth: 2, borderColor: "transparent" },
  groupTileSpeaking: { borderColor: "#4DE0A2", shadowColor: "#4DE0A2", shadowOpacity: 0.55, shadowRadius: 8, elevation: 5 },
  groupTileLabel: { position: "absolute", left: 7, right: 7, bottom: 7, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 5, borderRadius: 10, backgroundColor: "rgba(8, 20, 42, 0.72)" },
  groupTileName: { flex: 1, color: "#F5FAFF", fontSize: 11, fontWeight: "700" },
  groupCapacity: { position: "absolute", top: 64, alignSelf: "center", color: "#DCEBFF", fontSize: 11, fontWeight: "700", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(8, 20, 42, 0.68)" },
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
