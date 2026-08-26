import { setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";

import { trpc } from "@/lib/trpc";

import { PEER_CONNECTION_CONFIG } from "../config/iceServers.js";
import { callSignaling } from "../services/callSignaling";
import { callToneManager } from "../services/callToneManager";
import { webrtcService } from "../services/webrtcService";
import type { CallLifecycleEvent, CallMode, CallSignal, CallStatus, WebRTCController, WebRTCMediaStream } from "../types";

type PeerConnectionLike = {
  addTrack: (track: unknown, stream: unknown) => unknown;
  removeTrack?: (sender: unknown) => void;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  close: () => void;
  createAnswer: () => Promise<RTCSessionDescriptionInit>;
  createOffer: (options?: RTCOfferOptions) => Promise<RTCSessionDescriptionInit>;
  getSenders: () => { track?: { kind?: string } | null; replaceTrack: (track: unknown) => Promise<void> }[];
  setLocalDescription: (description: unknown) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  remoteDescription?: unknown;
  connectionState?: string;
  getStats?: () => Promise<{ forEach: (callback: (report: unknown) => void) => void }>;
  onicecandidate: ((event: { candidate?: { toJSON?: () => Record<string, unknown> } | null }) => void) | null;
  ontrack: ((event: { track: unknown; streams?: WebRTCMediaStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
};

type ControllerState = WebRTCController["state"];

const INITIAL_STATE: ControllerState = {
  status: "idle",
  mode: null,
  callId: null,
  conversationId: null,
  direction: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraEnabled: true,
  isSpeakerOn: false,
  isScreenSharing: false,
  hasSystemAudio: false,
  durationSeconds: 0,
  pingMs: null,
  error: null,
};

function describeMediaError(error: unknown) {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Bạn đã từ chối quyền camera, micro hoặc chia sẻ màn hình.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Không tìm thấy camera hoặc micro phù hợp trên thiết bị này.";
  if (name === "NotReadableError") return "Camera hoặc micro đang được ứng dụng khác sử dụng.";
  return error instanceof Error ? error.message : "Không thể chuẩn bị cuộc gọi. Vui lòng thử lại.";
}

function stopStream(stream: WebRTCMediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop?.());
}

/**
 * Core WebRTC duy nhất của module. UI thoại/video/chia sẻ chỉ đọc state và gọi
 * các action ở đây; không có UI nào tự tạo peer connection hoặc socket riêng.
 */
export function useWebRTC({ userId }: { userId: number | undefined }): WebRTCController {
  const [state, setState] = useState<ControllerState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const peerRef = useRef<PeerConnectionLike | null>(null);
  const localStreamRef = useRef<WebRTCMediaStream | null>(null);
  const displayStreamRef = useRef<WebRTCMediaStream | null>(null);
  const remoteStreamRef = useRef<WebRTCMediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingOfferRef = useRef<CallSignal | null>(null);
  const isFrontCameraRef = useRef(true);
  const systemAudioSenderRef = useRef<unknown | null>(null);
  const didAttemptIceRestartRef = useRef(false);
  const outgoingOfferStartedRef = useRef(false);
  const connectedAtRef = useRef<number | null>(null);
  const startMutation = trpc.calling.start.useMutation();
  const acceptMutation = trpc.calling.accept.useMutation();
  const connectedMutation = trpc.calling.connected.useMutation();
  const declineMutation = trpc.calling.decline.useMutation();
  const endMutation = trpc.calling.end.useMutation();
  const heartbeatMutation = trpc.calling.heartbeat.useMutation();

  const updateState = useCallback((patch: Partial<ControllerState>) => {
    stateRef.current = { ...stateRef.current, ...patch };
    setState(stateRef.current);
  }, []);

  const flushCandidates = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer || !peer.remoteDescription) return;
    const queued = pendingCandidatesRef.current.splice(0);
    await Promise.all(queued.map((candidate) => peer.addIceCandidate(webrtcService.createIceCandidate(candidate))));
  }, []);

  const releaseResources = useCallback(async (nextStatus: CallStatus = "ended") => {
    if (peerRef.current && systemAudioSenderRef.current) {
      peerRef.current.removeTrack?.(systemAudioSenderRef.current);
    }
    peerRef.current?.close();
    peerRef.current = null;
    systemAudioSenderRef.current = null;
    didAttemptIceRestartRef.current = false;
    stopStream(localStreamRef.current);
    stopStream(displayStreamRef.current);
    localStreamRef.current = null;
    displayStreamRef.current = null;
    remoteStreamRef.current = null;
    incomingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    outgoingOfferStartedRef.current = false;
    connectedAtRef.current = null;
    try {
      await setAudioModeAsync({ allowsRecording: false, shouldRouteThroughEarpiece: false });
    } catch {
      // Việc dọn audio mode không được chặn cleanup WebRTC.
    }
    updateState({ ...INITIAL_STATE, status: nextStatus });
  }, [updateState]);

  const sendSignal = useCallback(async (signal: CallSignal) => {
    await callSignaling.send(signal);
  }, []);

  /** Một lỗi peer là lỗi lifecycle: phải đóng session server để không khóa lần gọi kế tiếp. */
  const failPeerCall = useCallback((callId: string, message: string) => {
    void endMutation.mutateAsync({ callId })
      .catch(() => undefined)
      .finally(() => {
        void releaseResources("failed").then(() => updateState({ error: message }));
      });
  }, [endMutation, releaseResources, updateState]);

  const createPeer = useCallback((callId: string, conversationId: number, mode: CallMode, localStream: WebRTCMediaStream) => {
    const peer = webrtcService.createPeerConnection(PEER_CONNECTION_CONFIG as unknown as RTCConfiguration) as unknown as PeerConnectionLike;
    peerRef.current = peer;
    remoteStreamRef.current = webrtcService.createRemoteStream();

    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidate = event.candidate.toJSON?.() ?? event.candidate;
      void sendSignal({ conversationId, callId, mode, type: "candidate", payload: { candidate } }).catch((error) => {
        updateState({ error: describeMediaError(error) });
      });
    };
    peer.ontrack = (event) => {
      const stream = event.streams?.[0] ?? remoteStreamRef.current;
      if (!stream) return;
      if (!event.streams?.[0]) remoteStreamRef.current?.addTrack?.(event.track);
      remoteStreamRef.current = stream;
      updateState({ remoteStream: stream });
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        connectedAtRef.current ??= Date.now();
        updateState({ status: "connected", error: null, durationSeconds: 0, pingMs: null });
        void connectedMutation.mutateAsync({ callId }).catch(() => {
          failPeerCall(callId, "Không thể xác nhận kết nối cuộc gọi. Phiên đã được giải phóng, vui lòng gọi lại.");
        });
      }
      if (peer.connectionState !== "failed") return;
      const currentCall = stateRef.current;
      if (!didAttemptIceRestartRef.current && currentCall.callId === callId && currentCall.mode === mode) {
        didAttemptIceRestartRef.current = true;
        updateState({ status: "connecting", error: "Đang thử kết nối dự phòng an toàn..." });
        void peer.createOffer({ iceRestart: true })
          .then(async (offer) => {
            await peer.setLocalDescription(offer);
            await sendSignal({ conversationId, callId, mode, type: "offer", payload: { description: offer, iceRestart: true } });
          })
          .catch(() => failPeerCall(callId, "Kết nối P2P không thành công. Phiên đã được giải phóng, vui lòng gọi lại."));
        return;
      }
      failPeerCall(callId, "Kết nối P2P không thành công. Phiên đã được giải phóng, vui lòng gọi lại.");
    };
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
    return peer;
  }, [connectedMutation, failPeerCall, sendSignal, updateState]);

  const prepareLocalMedia = useCallback(async (mode: CallMode) => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: mode === "voice" });
    const stream = await webrtcService.getUserMedia({
      audio: true,
      video: mode === "video" ? { facingMode: "user", frameRate: 30 } : false,
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const renegotiate = useCallback(async (callId: string, conversationId: number, mode: CallMode) => {
    const peer = peerRef.current;
    if (!peer) return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await sendSignal({ conversationId, callId, mode, type: "offer", payload: { description: offer } });
  }, [sendSignal]);

  const handleSignal = useCallback(async (signal: CallSignal) => {
    const current = stateRef.current;
    if (signal.conversationId !== current.conversationId || signal.fromUserId === userId) return;
    if (!signal.callId || !signal.type) return;

    if (signal.type === "offer") {
      const activePeer = peerRef.current;
      const isRenegotiation = Boolean(
        activePeer
          && stateRef.current.callId === signal.callId
          && (stateRef.current.status === "connecting" || stateRef.current.status === "connected"),
      );
      if (isRenegotiation && activePeer) {
        const description = signal.payload?.description as RTCSessionDescriptionInit | undefined;
        if (!description) return;
        await activePeer.setRemoteDescription(webrtcService.createSessionDescription(description));
        await flushCandidates();
        const answer = await activePeer.createAnswer();
        await activePeer.setLocalDescription(answer);
        await sendSignal({
          conversationId: current.conversationId,
          callId: signal.callId,
          mode: signal.mode,
          type: "answer",
          payload: { description: answer },
        });
        return;
      }
      if (stateRef.current.status !== "idle" && stateRef.current.status !== "ended") return;
      incomingOfferRef.current = signal;
      updateState({ ...INITIAL_STATE, status: "ringing", mode: signal.mode, callId: signal.callId });
      return;
    }

    const peer = peerRef.current;
    if (!peer || stateRef.current.callId !== signal.callId) return;
    if (signal.type === "candidate") {
      const candidate = signal.payload?.candidate as RTCIceCandidateInit | undefined;
      if (!candidate) return;
      if (!peer.remoteDescription) pendingCandidatesRef.current.push(candidate);
      else await peer.addIceCandidate(webrtcService.createIceCandidate(candidate));
      return;
    }
    if (signal.type === "answer") {
      const description = signal.payload?.description as RTCSessionDescriptionInit | undefined;
      if (!description) return;
      await peer.setRemoteDescription(webrtcService.createSessionDescription(description));
      await flushCandidates();
      return;
    }
    if (signal.type === "hangup") await releaseResources("ended");
  }, [flushCandidates, releaseResources, sendSignal, updateState, userId]);

  const addInitialScreenTracks = useCallback(async (peer: PeerConnectionLike) => {
    const display = await webrtcService.getDisplayMedia();
    displayStreamRef.current = display;
    const screenTrack = display.getVideoTracks()[0];
    if (!screenTrack) throw new Error("Thiết bị không trả về hình ảnh màn hình để chia sẻ.");
    peer.addTrack(screenTrack, display);
    const systemAudioTrack = display.getAudioTracks()[0];
    if (systemAudioTrack) systemAudioSenderRef.current = peer.addTrack(systemAudioTrack, display);
    screenTrack.onended = () => { void releaseResources("ended"); };
    updateState({ isScreenSharing: true, hasSystemAudio: display.getAudioTracks().length > 0, localStream: display });
  }, [releaseResources, updateState]);

  const beginOutgoingOffer = useCallback(async () => {
    const current = stateRef.current;
    if (outgoingOfferStartedRef.current || !current.callId || !current.conversationId || !current.mode) return;
    outgoingOfferStartedRef.current = true;
    updateState({ status: "preparing", error: null });
    try {
      await callSignaling.connect();
      const mediaMode: CallMode = current.mode === "video" ? "video" : "voice";
      const localStream = await prepareLocalMedia(mediaMode);
      const peer = createPeer(current.callId, current.conversationId, current.mode, localStream);
      if (current.mode === "screen") await addInitialScreenTracks(peer);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal({ conversationId: current.conversationId, callId: current.callId, mode: current.mode, type: "offer", payload: { description: offer } });
      updateState({ status: "connecting", localStream: current.mode === "screen" ? displayStreamRef.current : localStream });
    } catch (error) {
      await releaseResources("failed");
      updateState({ error: describeMediaError(error) });
    }
  }, [addInitialScreenTracks, createPeer, prepareLocalMedia, releaseResources, sendSignal, updateState]);

  const handleLifecycle = useCallback((event: CallLifecycleEvent) => {
    if (!userId) return;
    const current = stateRef.current;
    if (event.status === "ringing" && event.recipientId === userId && (current.status === "idle" || current.status === "ended")) {
      updateState({ ...INITIAL_STATE, status: "ringing", callId: event.callId, conversationId: event.conversationId, mode: event.mode, direction: "incoming" });
      return;
    }
    if (event.callId !== current.callId) return;
    if (event.status === "accepted") {
      if (event.callerId === userId) void beginOutgoingOffer();
      else if (current.status === "ringing") updateState({ status: "connecting", error: null });
      return;
    }
    if (event.status === "declined" || event.status === "ended" || event.status === "missed") {
      void releaseResources("ended").then(() => {
        if (event.status === "missed") updateState({ error: "Cuộc gọi đã nhỡ." });
        if (event.status === "declined") updateState({ error: "Người nhận đã từ chối cuộc gọi." });
      });
    }
  }, [beginOutgoingOffer, releaseResources, updateState, userId]);

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = callSignaling.subscribe({ onSignal: (signal) => void handleSignal(signal), onInvite: handleLifecycle, onLifecycle: handleLifecycle });
    void callSignaling.connect().catch((error) => updateState({ error: describeMediaError(error) }));
    return () => {
      unsubscribe();
      callSignaling.disconnect();
      void releaseResources("ended");
    };
  }, [handleLifecycle, handleSignal, releaseResources, updateState, userId]);

  useEffect(() => {
    const tone = state.status === "ringing" ? (state.direction === "incoming" ? "incoming" : "outgoing") : null;
    if (tone) void callToneManager.start(tone);
    else void callToneManager.stop();
    return () => { void callToneManager.stop(); };
  }, [state.direction, state.status]);

  useEffect(() => {
    if (state.status !== "connected") return;
    connectedAtRef.current ??= Date.now();
    let disposed = false;
    const refreshMetrics = async () => {
      const connectedAt = connectedAtRef.current;
      if (!connectedAt || disposed) return;
      const durationSeconds = Math.max(0, Math.floor((Date.now() - connectedAt) / 1_000));
      let pingMs: number | null = null;
      try {
        const stats = await peerRef.current?.getStats?.();
        stats?.forEach((report) => {
          if (!report || typeof report !== "object") return;
          const item = report as Record<string, unknown>;
          const candidatePair = item.type === "candidate-pair" && (item.nominated === true || item.state === "succeeded");
          const remoteInbound = item.type === "remote-inbound-rtp";
          const rttSeconds = typeof item.currentRoundTripTime === "number" ? item.currentRoundTripTime : null;
          if ((candidatePair || remoteInbound) && rttSeconds !== null && rttSeconds >= 0) pingMs = Math.round(rttSeconds * 1_000);
        });
      } catch {
        // Một số native engine không công bố stats; giao diện giữ trạng thái đang đo thay vì số giả.
      }
      if (!disposed) updateState({ durationSeconds, pingMs });
    };
    void refreshMetrics();
    const interval = setInterval(() => { void refreshMetrics(); }, 1_000);
    return () => { disposed = true; clearInterval(interval); };
  }, [state.status, updateState]);

  /** Báo sống khi phiên đang active để server chỉ dọn những cuộc thực sự bị bỏ dở. */
  useEffect(() => {
    if (!state.callId || (state.status !== "connecting" && state.status !== "connected")) return;
    let disposed = false;
    const heartbeat = async () => {
      try {
        await heartbeatMutation.mutateAsync({ callId: state.callId! });
      } catch {
        // Mất mạng tạm thời không được tự kết thúc media; server sẽ hoà giải theo timeout.
      }
    };
    void heartbeat();
    const interval = setInterval(() => { if (!disposed) void heartbeat(); }, 15_000);
    return () => { disposed = true; clearInterval(interval); };
  }, [heartbeatMutation, state.callId, state.status]);

  const startCall = useCallback(async (conversationId: number, mode: CallMode) => {
    if (stateRef.current.status !== "idle" && stateRef.current.status !== "ended") return;
    updateState({ ...INITIAL_STATE, status: "preparing", conversationId, mode, direction: "outgoing", isCameraEnabled: mode === "video" });
    try {
      await callSignaling.connect();
      const session = await startMutation.mutateAsync({ conversationId, mode });
      updateState({ status: "ringing", callId: session.id, conversationId, mode, direction: "outgoing", isCameraEnabled: mode === "video", error: null });
    } catch (error) {
      await releaseResources("failed");
      updateState({ error: describeMediaError(error) });
    }
  }, [releaseResources, startMutation, updateState]);

  const answerIncomingCall = useCallback(async () => {
    const incoming = stateRef.current;
    if (!incoming.callId || !incoming.conversationId || !incoming.mode || incoming.direction !== "incoming" || incoming.status !== "ringing") return;
    updateState({ status: "preparing", error: null });
    try {
      await callSignaling.connect();
      const mediaMode: CallMode = incoming.mode === "video" ? "video" : "voice";
      const localStream = await prepareLocalMedia(mediaMode);
      const peer = createPeer(incoming.callId, incoming.conversationId, incoming.mode, localStream);
      if (incoming.mode === "screen") await addInitialScreenTracks(peer);
      await acceptMutation.mutateAsync({ callId: incoming.callId });
      updateState({ status: "connecting", localStream: incoming.mode === "screen" ? displayStreamRef.current : localStream });
    } catch (error) {
      await releaseResources("failed");
      updateState({ error: describeMediaError(error) });
    }
  }, [acceptMutation, addInitialScreenTracks, createPeer, prepareLocalMedia, releaseResources, updateState]);

  const endCall = useCallback(async () => {
    const { callId } = stateRef.current;
    if (callId) {
      try {
        await endMutation.mutateAsync({ callId });
      } catch {
        // Cleanup cục bộ vẫn luôn phải hoàn thành dù signaling đã ngắt.
      }
    }
    await releaseResources("ended");
  }, [endMutation, releaseResources]);

  useEffect(() => {
    if (state.status !== "ringing" || state.direction !== "outgoing" || !state.callId) return;
    const timeout = setTimeout(() => { void endCall(); }, 46_000);
    return () => clearTimeout(timeout);
  }, [endCall, state.callId, state.direction, state.status]);

  useEffect(() => {
    if (state.status !== "connecting" || !state.callId) return;
    const timeout = setTimeout(() => {
      void endCall();
      updateState({ error: "Không thiết lập được kết nối WebRTC. Vui lòng thử lại." });
    }, 32_000);
    return () => clearTimeout(timeout);
  }, [endCall, state.callId, state.status, updateState]);

  const rejectIncomingCall = useCallback(async () => {
    const { callId, direction, status } = stateRef.current;
    if (callId && direction === "incoming" && status === "ringing") {
      try { await declineMutation.mutateAsync({ callId }); } catch { /* cleanup local vẫn phải chạy */ }
    }
    await releaseResources("ended");
  }, [declineMutation, releaseResources]);

  const toggleMute = useCallback(() => {
    const enabled = !stateRef.current.isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
    updateState({ isMuted: !enabled });
  }, [updateState]);

  const toggleCamera = useCallback(async () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    updateState({ isCameraEnabled: Boolean(track.enabled) });
  }, [updateState]);

  const switchCamera = useCallback(async () => {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    isFrontCameraRef.current = !isFrontCameraRef.current;
    await webrtcService.switchCamera(track, isFrontCameraRef.current ? "user" : "environment");
  }, []);

  const toggleSpeaker = useCallback(async () => {
    const nextSpeakerOn = !stateRef.current.isSpeakerOn;
    if (Platform.OS !== "web") {
      await setAudioModeAsync({ allowsRecording: true, shouldRouteThroughEarpiece: !nextSpeakerOn });
    }
    updateState({ isSpeakerOn: nextSpeakerOn });
  }, [updateState]);

  const startScreenShare = useCallback(async () => {
    const peer = peerRef.current;
    const { callId, mode, conversationId } = stateRef.current;
    if (!peer || !callId || !conversationId || !mode || displayStreamRef.current) return;
    try {
      const display = await webrtcService.getDisplayMedia();
      const screenTrack = display.getVideoTracks()[0];
      if (!screenTrack) throw new Error("Thiết bị không trả về hình ảnh màn hình để chia sẻ.");
      const videoSender = peer.getSenders().find((sender) => sender.track?.kind === "video");
      if (videoSender) await videoSender.replaceTrack(screenTrack);
      else {
        peer.addTrack(screenTrack, display);
      }
      const systemAudioTrack = display.getAudioTracks()[0];
      if (systemAudioTrack) systemAudioSenderRef.current = peer.addTrack(systemAudioTrack, display);
      // Thêm audio hệ thống (nếu trình duyệt/thiết bị cấp) cần renegotiate;
      // không tạo lại peer connection nên video đang gọi vẫn liên tục.
      if (!videoSender || systemAudioTrack) await renegotiate(callId, conversationId, mode);
      displayStreamRef.current = display;
      screenTrack.onended = () => { void stopScreenShare(); };
      updateState({ isScreenSharing: true, hasSystemAudio: display.getAudioTracks().length > 0, localStream: display });
    } catch (error) {
      updateState({ error: describeMediaError(error) });
    }
  // stopScreenShare is intentionally referenced after declaration by the callback lifecycle.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renegotiate, updateState]);

  const stopScreenShare = useCallback(async () => {
    const peer = peerRef.current;
    const display = displayStreamRef.current;
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] ?? null;
    if (!peer || !display) return;
    const sender = peer.getSenders().find((entry) => entry.track?.kind === "video");
    if (sender && cameraTrack) await sender.replaceTrack(cameraTrack);
    if (systemAudioSenderRef.current) peer.removeTrack?.(systemAudioSenderRef.current);
    systemAudioSenderRef.current = null;
    stopStream(display);
    displayStreamRef.current = null;
    updateState({ isScreenSharing: false, hasSystemAudio: false, localStream: localStreamRef.current });
  }, [updateState]);

  return {
    state,
    startCall,
    answerIncomingCall,
    rejectIncomingCall,
    endCall,
    toggleMute,
    toggleCamera,
    switchCamera,
    toggleSpeaker,
    startScreenShare,
    stopScreenShare,
  };
}
