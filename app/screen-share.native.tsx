import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { LiveKitRoom, useTracks, VideoTrack } from "@livekit/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, View } from "react-native";
import { Room, Track } from "livekit-client";

import { ScreenShareSession } from "@/lib/screen-share-session";
import { trpc } from "@/lib/trpc";

type Role = "host" | "viewer";

function ScreenStage({ room, role }: { room: Room; role: Role }) {
  const tracks = useTracks([Track.Source.ScreenShare], { room, onlySubscribed: true });
  const screenTrack = tracks.find((track) => track.publication?.track && (role === "host" ? track.participant.isLocal : !track.participant.isLocal))
    ?? tracks.find((track) => track.publication?.track);

  if (!screenTrack) {
    return <View style={styles.waiting}>
      <MaterialIcons name="screen-share" size={44} color="#BFDBFE" />
      <Text style={styles.waitingTitle}>{role === "host" ? "Sẵn sàng trình chiếu" : "Đang chờ người chia sẻ bắt đầu"}</Text>
      <Text style={styles.waitingText}>{role === "host" ? "Bấm Bắt đầu để mở hộp thoại ghi màn hình Android." : "Bạn sẽ thấy màn hình ngay khi host cho phép ghi màn hình."}</Text>
    </View>;
  }

  return <View style={styles.stage}>
    <VideoTrack trackRef={screenTrack} style={styles.track} mirror={false} zOrder={0} />
    <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>ĐANG TRÌNH CHIẾU</Text></View>
  </View>;
}

function SessionMiniChat({ conversationId }: { conversationId: number }) {
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();
  const messages = trpc.messages.list.useQuery({ conversationId }, { refetchInterval: 1_000 });
  const sendText = trpc.messages.sendText.useMutation();
  const latest = messages.data?.slice(-3) ?? [];

  const submit = async () => {
    const body = draft.trim();
    if (!body || sendText.isPending) return;
    setDraft("");
    try {
      await sendText.mutateAsync({ conversationId, body, replyToMessageId: null });
      await utils.messages.list.invalidate({ conversationId });
    } catch {
      setDraft(body);
      Alert.alert("Chưa gửi được tin nhắn", "Vui lòng kiểm tra kết nối rồi thử lại.");
    }
  };

  return <View style={styles.miniChat}>
    <View style={styles.miniChatTitle}>
      <MaterialIcons name="chat-bubble-outline" size={15} color="#BFDBFE" />
      <Text style={styles.miniChatHeading}>Chat trong phiên</Text>
    </View>
    <View style={styles.miniMessages}>
      {latest.length
        ? latest.map((message) => <Text key={message.id} numberOfLines={1} style={styles.miniMessage}>{message.body || "Tin nhắn không có nội dung"}</Text>)
        : <Text style={styles.miniEmpty}>Chưa có tin nhắn mới</Text>}
    </View>
    <View style={styles.miniComposer}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={() => void submit()}
        returnKeyType="send"
        placeholder="Nhắn trong cuộc trò chuyện"
        placeholderTextColor="#86A9D7"
        style={styles.miniInput}
        maxLength={2_000}
      />
      <Pressable
        onPress={() => void submit()}
        disabled={!draft.trim() || sendText.isPending}
        style={[styles.miniSend, (!draft.trim() || sendText.isPending) && styles.miniSendDisabled]}
        accessibilityLabel="Gửi tin nhắn"
      ><MaterialIcons name="send" size={18} color="#FFFFFF" /></Pressable>
    </View>
  </View>;
}

export default function ScreenShareScreen() {
  const params = useLocalSearchParams<{ sessionId?: string; role?: Role; serverUrl?: string; token?: string }>();
  const sessionId = params.sessionId ?? "";
  const role: Role = params.role === "host" ? "host" : "viewer";
  const session = useRef(new ScreenShareSession()).current;
  const [connected, setConnected] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [speaker, setSpeaker] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hostActivatedRef = useRef(false);
  const sessionEndRequestedRef = useRef(false);
  const get = trpc.screenShares.get.useQuery({ sessionId }, { enabled: Boolean(sessionId), refetchInterval: 1_500 });
  const join = trpc.screenShares.join.useMutation();
  const activate = trpc.screenShares.activate.useMutation();
  const end = trpc.screenShares.end.useMutation();
  const endMutationRef = useRef(end);
  endMutationRef.current = end;

  useEffect(() => () => {
    if (role !== "host" || !sessionId || !hostActivatedRef.current || sessionEndRequestedRef.current) return;
    sessionEndRequestedRef.current = true;
    void endMutationRef.current.mutateAsync({ sessionId }).catch(() => undefined);
  }, [role, sessionId]);

  useEffect(() => {
    let mounted = true;
    const establish = async () => {
      try {
        const connection = role === "host" && params.serverUrl && params.token
          ? { serverUrl: params.serverUrl, token: params.token }
          : (await join.mutateAsync({ sessionId })).connection;
        await session.connect(connection);
        if (mounted) setConnected(true);
      } catch (reason) {
        if (mounted) setError(reason instanceof Error ? reason.message : "Không thể tham gia phiên chia sẻ.");
      }
    };
    if (sessionId) void establish();
    return () => { mounted = false; void session.disconnect(); };
  }, [join, params.serverUrl, params.token, role, session, sessionId]);

  useEffect(() => {
    if (role !== "host" || !sharing || !sessionId) return;
    const monitor = setInterval(() => {
      const hasPublishedScreen = Boolean(session.getRoom().localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track);
      if (hasPublishedScreen || sessionEndRequestedRef.current) return;
      sessionEndRequestedRef.current = true;
      void endMutationRef.current.mutateAsync({ sessionId })
        .catch(() => undefined)
        .finally(() => {
          setSharing(false);
          void session.disconnect();
          Alert.alert("Chia sẻ đã dừng", "Ghi màn hình Android đã kết thúc. Phiên chia sẻ đã được đóng an toàn.", [
            { text: "Quay lại chat", onPress: () => router.back() },
          ]);
        });
    }, 1_000);
    return () => clearInterval(monitor);
  }, [role, session, sessionId, sharing]);

  const start = async () => {
    if (busy || !connected) return;
    setBusy(true);
    try {
      await session.startScreenShare();
      await activate.mutateAsync({ sessionId });
      hostActivatedRef.current = true;
      setSharing(true);
    } catch (reason) {
      await session.stopScreenShare().catch(() => undefined);
      const detail = reason instanceof Error ? reason.message : "Hãy thử lại sau giây lát.";
      Alert.alert("Chưa thể bắt đầu", `${detail}\n\nTrên Xiaomi/MIUI, hãy chấp nhận hộp thoại ghi màn hình Android và tắt hạn chế pin cho ChatPHT nếu cần.`);
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (role === "host") {
        await session.stopScreenShare().catch(() => undefined);
        sessionEndRequestedRef.current = true;
        await end.mutateAsync({ sessionId });
      }
      await session.disconnect();
      router.back();
    } catch (reason) {
      Alert.alert("Chưa thể kết thúc", reason instanceof Error ? reason.message : "Hãy thử lại.");
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = async () => {
    try {
      const next = !micEnabled;
      await session.setMicrophoneEnabled(next);
      setMicEnabled(next);
    } catch (reason) {
      Alert.alert("Chưa thể bật micro", reason instanceof Error ? reason.message : "Hãy kiểm tra quyền micro.");
    }
  };

  const toggleSpeaker = async () => {
    try {
      const next = !speaker;
      await session.setSpeakerEnabled(next);
      setSpeaker(next);
    } catch {
      Alert.alert("Chưa thể đổi loa", "Vui lòng thử lại sau giây lát.");
    }
  };

  const heading = role === "host" ? "Chia sẻ màn hình" : "Đang xem màn hình";
  return <SafeAreaView style={styles.safe}>
    <StatusBar barStyle="light-content" backgroundColor="#09172E" />
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable onPress={() => void finish()} style={styles.back} accessibilityLabel="Rời phiên chia sẻ"><MaterialIcons name="arrow-back" size={25} color="#E7F0FF" /></Pressable>
        <View style={styles.titleWrap}><Text style={styles.title}>{heading}</Text><Text style={styles.subTitle}>{get.data?.status === "live" ? "Kết nối bảo mật · LiveKit" : connected ? "Đã kết nối, chờ bắt đầu" : "Đang kết nối…"}</Text></View>
        <View style={styles.lock}><MaterialIcons name="lock" size={15} color="#BFDBFE" /></View>
      </View>
      <LiveKitRoom room={session.getRoom() as unknown as Room} serverUrl={undefined} token={undefined} connect={false}>
        <ScreenStage room={session.getRoom() as unknown as Room} role={role} />
      </LiveKitRoom>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {get.data?.conversationId ? <SessionMiniChat conversationId={get.data.conversationId} /> : null}
      <View style={styles.controls}>
        {role === "host" && !sharing ? <Pressable disabled={!connected || busy} onPress={() => void start()} style={[styles.primary, (!connected || busy) && styles.disabled]}><MaterialIcons name="screen-share" size={22} color="#FFFFFF" /><Text style={styles.primaryText}>{busy ? "Đang mở ghi màn hình" : "Bắt đầu trình chiếu"}</Text></Pressable> : null}
        <View style={styles.row}>
          <Pressable onPress={() => void toggleMic()} style={[styles.circle, micEnabled && styles.circleActive]} accessibilityLabel={micEnabled ? "Tắt micro" : "Bật micro để hỏi"}><MaterialIcons name={micEnabled ? "mic" : "mic-off"} size={22} color="#E7F0FF" /></Pressable>
          <Pressable onPress={() => void toggleSpeaker()} style={[styles.circle, speaker && styles.circleActive]} accessibilityLabel={speaker ? "Tắt loa ngoài" : "Bật loa ngoài"}><MaterialIcons name={speaker ? "volume-up" : "hearing"} size={22} color="#E7F0FF" /></Pressable>
          <Pressable onPress={() => void finish()} style={[styles.circle, styles.end]} accessibilityLabel={role === "host" ? "Dừng chia sẻ" : "Rời phiên xem"}><MaterialIcons name={role === "host" ? "stop-screen-share" : "logout"} size={22} color="#FFFFFF" /></Pressable>
        </View>
        {role === "viewer" ? <Text style={styles.viewerHint}>Bạn chỉ nhận màn hình; bật micro khi muốn hỏi. Camera và chia sẻ màn hình của người xem bị token chặn.</Text> : null}
      </View>
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#09172E" },
  root: { flex: 1, backgroundColor: "#09172E" },
  top: { height: 70, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#1E3A5F" },
  back: { padding: 8 },
  titleWrap: { flex: 1, marginLeft: 8 },
  title: { color: "#F8FBFF", fontSize: 17, fontWeight: "800" },
  subTitle: { color: "#9FC2F5", fontSize: 12, marginTop: 2 },
  lock: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#10294B" },
  stage: { flex: 1, backgroundColor: "#020814" },
  track: { flex: 1 },
  waiting: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 36, backgroundColor: "#0B203E" },
  waitingTitle: { color: "#E7F0FF", fontSize: 20, fontWeight: "800", marginTop: 15 },
  waitingText: { color: "#AAC4EA", textAlign: "center", lineHeight: 20, marginTop: 8 },
  liveBadge: { position: "absolute", top: 14, left: 14, backgroundColor: "rgba(149, 26, 39, 0.92)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#FFFFFF" },
  liveText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900", letterSpacing: 0.4 },
  miniChat: { backgroundColor: "#0C1E38", borderTopWidth: 1, borderTopColor: "#1E3A5F", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
  miniChatTitle: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  miniChatHeading: { color: "#BFDBFE", fontSize: 12, fontWeight: "800" },
  miniMessages: { gap: 3, minHeight: 22, justifyContent: "center" },
  miniMessage: { color: "#E7F0FF", fontSize: 12, lineHeight: 16 },
  miniEmpty: { color: "#86A9D7", fontSize: 12 },
  miniComposer: { height: 38, borderRadius: 19, backgroundColor: "#17375F", marginTop: 8, paddingLeft: 13, paddingRight: 3, flexDirection: "row", alignItems: "center" },
  miniInput: { flex: 1, color: "#F8FBFF", fontSize: 13, paddingVertical: 0 },
  miniSend: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#2563EB" },
  miniSendDisabled: { opacity: 0.45 },
  controls: { padding: 18, backgroundColor: "#0F2545", gap: 14 },
  primary: { height: 52, borderRadius: 15, backgroundColor: "#2563EB", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  primaryText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  row: { flexDirection: "row", justifyContent: "center", gap: 18 },
  circle: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "#17375F" },
  circleActive: { backgroundColor: "#2563EB" },
  end: { backgroundColor: "#D94151" },
  viewerHint: { color: "#9FC2F5", textAlign: "center", fontSize: 12, lineHeight: 17 },
  error: { color: "#FCA5A5", fontSize: 12, textAlign: "center", paddingHorizontal: 18, paddingTop: 8 },
});
