import type { WebRTCMediaStream } from "../types";

type BrowserPeer = RTCPeerConnection;

function requireMediaDevices() {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    throw new Error("Trình duyệt này không hỗ trợ WebRTC media devices.");
  }
  return navigator.mediaDevices;
}

export const webrtcService = {
  createPeerConnection: (config: RTCConfiguration) => new RTCPeerConnection(config) as unknown as BrowserPeer,
  createSessionDescription: (description: RTCSessionDescriptionInit) => new RTCSessionDescription(description),
  createIceCandidate: (candidate: RTCIceCandidateInit) => new RTCIceCandidate(candidate),
  createRemoteStream: () => new MediaStream() as unknown as WebRTCMediaStream,
  getUserMedia: (constraints: MediaStreamConstraints) =>
    requireMediaDevices().getUserMedia(constraints) as unknown as Promise<WebRTCMediaStream>,
  getDisplayMedia: () =>
    requireMediaDevices().getDisplayMedia({ video: true, audio: true }) as unknown as Promise<WebRTCMediaStream>,
  switchCamera: async (track: unknown, facingMode: "user" | "environment") => {
    const videoTrack = track as MediaStreamTrack | null;
    if (!videoTrack?.applyConstraints) throw new Error("Camera hiện tại không hỗ trợ chuyển ống kính.");
    await videoTrack.applyConstraints({ facingMode });
  },
};
