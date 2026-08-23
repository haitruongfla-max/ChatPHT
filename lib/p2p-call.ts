export type P2pSignalType = "offer" | "answer" | "ice";
export type P2pSignal = { type: P2pSignalType; payload: string };
export type P2pConnectionState = "idle" | "connecting" | "connected" | "failed" | "closed";
export type P2pIceServer = { urls: string[]; username?: string; credential?: string };
export type P2pStartOptions = {
  isCaller: boolean;
  kind: "audio" | "video";
  iceServers?: P2pIceServer[];
  onSignal: (signal: P2pSignal) => Promise<void> | void;
  onState: (state: P2pConnectionState) => void;
  onRemoteStream: (stream: import("@livekit/react-native-webrtc").MediaStream | null) => void;
};

const unavailable = () => { throw new Error("Gọi P2P chỉ khả dụng trên iOS hoặc Android."); };

export class P2pCall {
  async start(_options: P2pStartOptions) { return unavailable(); }
  async handleSignal(_signal: P2pSignal) { return unavailable(); }
  isConnected() { return false; }
  getLocalStream() { return null; }
  getRemoteStream() { return null; }
  async setMicrophoneEnabled(_enabled: boolean) { return unavailable(); }
  async setSpeakerEnabled(_enabled: boolean) { return unavailable(); }
  async setCameraEnabled(_enabled: boolean) { return unavailable(); }
  async switchCamera() { return unavailable(); }
  async setVideoQuality(_quality: "sd" | "hd") { return unavailable(); }
  async disconnect() { return undefined; }
}
