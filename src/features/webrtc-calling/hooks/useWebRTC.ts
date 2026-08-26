import { setAudioModeAsync } from "expo-audio";
import { Platform } from "react-native";
import { useCallback, useEffect, useRef, useState } from "react";

import { PEER_CONNECTION_CONFIG } from "../config/iceServers.js";
import { createCallSignaling } from "../services/callSignaling";
import { webrtcService } from "../services/webrtcService";
import type { CallMode, CallSignal, CallStatus, WebRTCController, WebRTCMediaStream } from "../types";

type PeerConnectionLike = {
  addTrack: (track: unknown, stream: unknown) => unknown;
  removeTrack?: (sender: unknown) => void;
  addIceCandidate: (candidate: unknown) => Promise<void>;
  close: () => void;
  createAnswer: () => Promise<RTCSessionDescriptionInit>;
  createOffer: (options?: RTCOfferOptions) => Promise<RTCSessionDescriptionInit>;
  getSenders: () => Array<{ track?: { kind?: string } | null; replaceTrack: (track: unknown) => Promise<void> }>;
  setLocalDescription: (description: unknown) => Promise<void>;
  setRemoteDescription: (description: unknown) => Promise<void>;
  remoteDescription?: unknown;
  connectionState?: string;
  onicecandidate: ((event: { candidate?: { toJSON?: () => Record<string, unknown> } | null }) => void) | null;
  ontrack: ((event: { track: unknown; streams?: WebRTCMediaStream[] }) => void) | null;
  onconnectionstatechange: (() => void) | null;
};

type ControllerState = WebRTCController["state"];

const INITIAL_STATE: ControllerState = {
  status: "idle",
  mode: null,
  callId: null,
  localStream: null,
  remoteStream: null,
  isMuted: false,
  isCameraEnabled: true,
  isSpeakerOn: false,
  isScreenSharing: false,
  hasSystemAudio: false,
  error: null,
};

function describeMediaError(error: unknown) {
  const name = typeof error === "object" && error && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "Bạn đã từ chối quyền camera, micro hoặc chia sẻ màn hình.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Không tìm thấy camera hoặc micro phù hợp trên thiết bị này.";
  if (name === "NotReadableError") return "Camera hoặc micro đang được ứng dụng khác sử dụng.";
  return error instanceof Error ? error.message : "Không thể chuẩn bị cuộc gọi. Vui lòng thử lại.";
}

function randomCallId() {
  return globalThis.crypto?.randomUUID?.() ?? `call-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stopStream(stream: WebRTCMediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop?.());
}

/**
 * Core WebRTC duy nhất của module. UI thoại/video/chia sẻ chỉ đọc state và gọi
 * các action ở đây; không có UI nào tự tạo peer connection hoặc socket riêng.
 */
export function useWebRTC({ conversationId, userId }: { conversationId: number; userId: number | undefined }): WebRTCController {
  const [state, setState] = useState<ControllerState>(INITIAL_STATE);
  const stateRef = useRef(state);
  const peerRef = useRef<PeerConnectionLike | null>(null);
  const signalingRef = useRef<ReturnType<typeof createCallSignaling> | null>(null);
  const localStreamRef = useRef<WebRTCMediaStream | null>(null);
  const displayStreamRef = useRef<WebRTCMediaStream | null>(null);
  const remoteStreamRef = useRef<WebRTCMediaStream | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const incomingOfferRef = useRef<CallSignal | null>(null);
  const isFrontCameraRef = useRef(true);
  const systemAudioSenderRef = useRef<unknown | null>(null);
  const didAttemptIceRestartRef = useRef(false);

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
    try {
      await setAudioModeAsync({ allowsRecording: false, shouldRouteThroughEarpiece: false });
    } catch {
      // Việc dọn audio mode không được chặn cleanup WebRTC.
    }
    updateState({ ...INITIAL_STATE, status: nextStatus });
  }, [updateState]);

  const sendSignal = useCallback(async (signal: CallSignal) => {
    await signalingRef.current?.send(signal);
  }, []);

  const createPeer = useCallback((callId: string, mode: CallMode, localStream: WebRTCMediaStream) => {
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
      if (peer.connectionState === "connected") updateState({ status: "connected", error: null });
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
          .catch(() => updateState({ status: "failed", error: "Kết nối P2P không thành công. Vui lòng kết thúc và gọi lại." }));
        return;
      }
      updateState({ status: "failed", error: "Kết nối P2P không thành công. Vui lòng kết thúc và gọi lại." });
    };
    localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
    return peer;
  }, [sendSignal, updateState]);

  const prepareLocalMedia = useCallback(async (mode: CallMode) => {
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: mode === "voice" });
    const stream = await webrtcService.getUserMedia({
      audio: true,
      video: mode === "video" ? { facingMode: "user", frameRate: 30 } : false,
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const renegotiate = useCallback(async (callId: string, mode: CallMode) => {
    const peer = peerRef.current;
    if (!peer) return;
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await sendSignal({ conversationId, callId, mode, type: "offer", payload: { description: offer } });
  }, [conversationId, sendSignal]);

  const handleSignal = useCallback(async (signal: CallSignal) => {
    if (signal.conversationId !== conversationId || signal.fromUserId === userId) return;
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
          conversationId,
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
  }, [conversationId, flushCandidates, releaseResources, updateState, userId]);

  useEffect(() => {
    if (!Number.isInteger(conversationId) || !userId) return;
    const signaling = createCallSignaling({ conversationId, onSignal: (signal) => void handleSignal(signal) });
    signalingRef.current = signaling;
    void signaling.connect().catch((error) => updateState({ error: describeMediaError(error) }));
    return () => {
      signaling.disconnect();
      signalingRef.current = null;
      void releaseResources("ended");
    };
  }, [conversationId, handleSignal, releaseResources, updateState, userId]);

  const startCall = useCallback(async (mode: CallMode) => {
    if (stateRef.current.status !== "idle" && stateRef.current.status !== "ended") return;
    const callId = randomCallId();
    updateState({ ...INITIAL_STATE, status: "preparing", mode, callId, isCameraEnabled: mode === "video" });
    try {
      await signalingRef.current?.connect();
      const mediaMode: CallMode = mode === "video" ? "video" : "voice";
      const localStream = await prepareLocalMedia(mediaMode);
      const peer = createPeer(callId, mode, localStream);
      if (mode === "screen") await (async () => {
        const display = await webrtcService.getDisplayMedia();
        displayStreamRef.current = display;
        const screenTrack = display.getVideoTracks()[0];
        if (!screenTrack) throw new Error("Thiết bị không trả về hình ảnh màn hình để chia sẻ.");
        peer.addTrack(screenTrack, display);
        const systemAudioTrack = display.getAudioTracks()[0];
        if (systemAudioTrack) systemAudioSenderRef.current = peer.addTrack(systemAudioTrack, display);
        screenTrack.onended = () => { void releaseResources("ended"); };
        updateState({ isScreenSharing: true, hasSystemAudio: display.getAudioTracks().length > 0, localStream: display });
      })();
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      await sendSignal({ conversationId, callId, mode, type: "offer", payload: { description: offer } });
      updateState({ status: "connecting", localStream: mode === "screen" ? displayStreamRef.current : localStream });
    } catch (error) {
      await releaseResources("failed");
      updateState({ error: describeMediaError(error) });
    }
  }, [conversationId, createPeer, prepareLocalMedia, releaseResources, sendSignal, updateState]);

  const answerIncomingCall = useCallback(async () => {
    const incoming = incomingOfferRef.current;
    if (!incoming) return;
    updateState({ status: "preparing", error: null });
    try {
      await signalingRef.current?.connect();
      const mediaMode: CallMode = incoming.mode === "video" ? "video" : "voice";
      const localStream = await prepareLocalMedia(mediaMode);
      const peer = createPeer(incoming.callId, incoming.mode, localStream);
      const description = incoming.payload?.description as RTCSessionDescriptionInit | undefined;
      if (!description) throw new Error("Lời mời gọi không chứa offer hợp lệ.");
      await peer.setRemoteDescription(webrtcService.createSessionDescription(description));
      await flushCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await sendSignal({ conversationId, callId: incoming.callId, mode: incoming.mode, type: "answer", payload: { description: answer } });
      updateState({ status: "connecting", mode: incoming.mode, callId: incoming.callId, localStream });
      incomingOfferRef.current = null;
    } catch (error) {
      await releaseResources("failed");
      updateState({ error: describeMediaError(error) });
    }
  }, [conversationId, createPeer, flushCandidates, prepareLocalMedia, releaseResources, sendSignal, updateState]);

  const endCall = useCallback(async () => {
    const { callId, mode } = stateRef.current;
    if (callId && mode) {
      try {
        await sendSignal({ conversationId, callId, mode, type: "hangup" });
      } catch {
        // Cleanup cục bộ vẫn luôn phải hoàn thành dù signaling đã ngắt.
      }
    }
    await releaseResources("ended");
  }, [conversationId, releaseResources, sendSignal]);

  const rejectIncomingCall = useCallback(async () => {
    await endCall();
  }, [endCall]);

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
    const { callId, mode } = stateRef.current;
    if (!peer || !callId || !mode || displayStreamRef.current) return;
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
      if (!videoSender || systemAudioTrack) await renegotiate(callId, mode);
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
