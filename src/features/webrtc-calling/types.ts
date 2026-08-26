export type CallMode = "voice" | "video" | "screen";

export type CallStatus = "idle" | "preparing" | "ringing" | "connecting" | "connected" | "ended" | "failed";

export type CallSignalType = "offer" | "answer" | "candidate" | "hangup";

export type CallSignal = {
  conversationId: number;
  callId: string;
  mode: CallMode;
  type: CallSignalType;
  payload?: Record<string, unknown>;
  fromUserId?: number;
};

export type CallLifecycleEvent = {
  callId: string;
  conversationId: number;
  callerId: number;
  recipientId: number;
  mode: CallMode;
  status: "ringing" | "accepted" | "active" | "declined" | "ended" | "missed";
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
};

/** Minimal surface common to browser MediaStream and react-native-webrtc MediaStream. */
export type WebRTCMediaStream = {
  getTracks: () => { stop?: () => void; enabled?: boolean; kind?: string; applyConstraints?: (constraints: Record<string, unknown>) => Promise<void> | void; onended?: (() => void) | null }[];
  getAudioTracks: () => { stop?: () => void; enabled?: boolean; kind?: string }[];
  getVideoTracks: () => { stop?: () => void; enabled?: boolean; kind?: string; applyConstraints?: (constraints: Record<string, unknown>) => Promise<void> | void; onended?: (() => void) | null }[];
  addTrack?: (track: unknown) => void;
  toURL?: () => string;
};

export type WebRTCController = {
  state: {
    status: CallStatus;
    mode: CallMode | null;
    callId: string | null;
    conversationId: number | null;
    direction: "incoming" | "outgoing" | null;
    localStream: WebRTCMediaStream | null;
    remoteStream: WebRTCMediaStream | null;
    isMuted: boolean;
    isCameraEnabled: boolean;
    isSpeakerOn: boolean;
    isScreenSharing: boolean;
    hasSystemAudio: boolean;
    durationSeconds: number;
    pingMs: number | null;
    error: string | null;
  };
  startCall: (conversationId: number, mode: CallMode) => Promise<void>;
  answerIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  toggleCamera: () => Promise<void>;
  switchCamera: () => Promise<void>;
  toggleSpeaker: () => Promise<void>;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
};
