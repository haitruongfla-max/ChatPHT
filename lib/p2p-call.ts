import type { MediaStream } from "react-native-webrtc";
import type { P2pCallMode } from "@/lib/p2p-call-mode";

export type P2pSignalType = "offer" | "answer" | "ice";
export type P2pSignal = { type: P2pSignalType; payload: string };
export type P2pConnectionState = "idle" | "connecting" | "recovering" | "connected" | "failed" | "closed";
export type P2pIceServer = { urls: string[]; username?: string; credential?: string };
/** Chỉ số lấy trực tiếp từ WebRTC; `null` nghĩa là SDK chưa có số liệu đáng tin cậy. */
export type P2pNetworkStats = { latencyMs: number | null };
export type P2pStartOptions = {
  isCaller: boolean;
  kind: "audio" | "video";
  mode: P2pCallMode;
  iceServers?: P2pIceServer[];
  onSignal: (signal: P2pSignal) => Promise<void> | void;
  onState: (state: P2pConnectionState) => void;
  onRemoteStream: (stream: MediaStream | null) => void;
  onStats?: (stats: P2pNetworkStats) => void;
};

const unavailable = () => { throw new Error("Gọi P2P chỉ khả dụng trên iOS hoặc Android."); };

/** Web-only facade. Native implementations are resolved from p2p-call.native.ts. */
export class P2pCall {
  async start(_options: P2pStartOptions) { return unavailable(); }
  async handleSignal(_signal: P2pSignal) { return unavailable(); }
  isConnected() { return false; }
  getLocalStream(): MediaStream | null { return null; }
  getRemoteStream(): MediaStream | null { return null; }
  async setMicrophoneEnabled(_enabled: boolean) { return unavailable(); }
  async setSpeakerEnabled(_enabled: boolean) { return unavailable(); }
  async setCameraEnabled(_enabled: boolean) { return unavailable(); }
  async switchCamera() { return unavailable(); }
  async setVideoQuality(_quality: "sd" | "hd") { return unavailable(); }
  async disconnect(_options: { preserveAudioSession?: boolean } = {}) { return undefined; }
}
