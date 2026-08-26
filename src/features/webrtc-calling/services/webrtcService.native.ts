import {
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
  mediaDevices,
} from "react-native-webrtc";

import type { WebRTCMediaStream } from "../types";

export const webrtcService = {
  createPeerConnection: (config: RTCConfiguration) => new RTCPeerConnection(config as never),
  createSessionDescription: (description: RTCSessionDescriptionInit) => new RTCSessionDescription(description as never),
  createIceCandidate: (candidate: RTCIceCandidateInit) => new RTCIceCandidate(candidate as never),
  createRemoteStream: () => new MediaStream() as unknown as WebRTCMediaStream,
  getUserMedia: (constraints: MediaStreamConstraints) =>
    mediaDevices.getUserMedia(constraints as never) as unknown as Promise<WebRTCMediaStream>,
  getDisplayMedia: () =>
    mediaDevices.getDisplayMedia() as unknown as Promise<WebRTCMediaStream>,
  switchCamera: async (track: unknown, _facingMode: "user" | "environment") => {
    const nativeTrack = track as { _switchCamera?: () => void } | null;
    if (!nativeTrack?._switchCamera) throw new Error("Camera hiện tại không hỗ trợ chuyển ống kính.");
    nativeTrack._switchCamera();
  },
};
