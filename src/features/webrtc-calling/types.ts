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

/** Minimal surface common to browser MediaStream and react-native-webrtc MediaStream. */
export type WebRTCMediaStream = {
  getTracks: () => Array<{ stop?: () => void; enabled?: boolean; kind?: string; applyConstraints?: (constraints: Record<string, unknown>) => Promise<void> | void; onended?: (() => void) | null }>;
  getAudioTracks: () => Array<{ stop?: () => void; enabled?: boolean; kind?: string }>;
  getVideoTracks: () => Array<{ stop?: () => void; enabled?: boolean; kind?: string; applyConstraints?: (constraints: Record<string, unknown>) => Promise<void> | void; onended?: (() => void) | null }>;
  addTrack?: (track: unknown) => void;
  toURL?: () => string;
};

export type WebRTCController = {
  state: {
    status: CallStatus;
    mode: CallMode | null;
    callId: string | null;
    localStream: WebRTCMediaStream | null;
    remoteStream: WebRTCMediaStream | null;
    isMuted: boolean;
    isCameraEnabled: boolean;
    isSpeakerOn: boolean;
    isScreenSharing: boolean;
    hasSystemAudio: boolean;
    error: string | null;
  };
  startCall: (mode: CallMode) => Promise<void>;
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
