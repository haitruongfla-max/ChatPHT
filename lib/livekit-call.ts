export type LiveKitSession = {
  serverUrl: string;
  token: string;
};

export type VideoQualityMode = "sd" | "hd";

/**
 * Web-safe facade. Expo resolves this file only for browser builds; no native
 * WebRTC module is imported into the ChatPHT web preview.
 */
export class LiveKitCall {
  async connect(_session: LiveKitSession, _kind: "audio" | "video") {
    throw new Error("Tính năng gọi chỉ khả dụng trên ứng dụng ChatPHT dành cho iOS và Android.");
  }

  async setMicrophoneEnabled(_enabled: boolean) {}
  async setCameraEnabled(_enabled: boolean) {}
  async setScreenShareEnabled(_enabled: boolean) {
    throw new Error("Chia sẻ màn hình chỉ khả dụng trên ứng dụng ChatPHT dành cho iOS và Android.");
  }
  async setSpeakerEnabled(_enabled: boolean) {}
  async setVideoQuality(_mode: VideoQualityMode) {
    throw new Error("Tính năng gọi chỉ khả dụng trên ứng dụng ChatPHT dành cho iOS và Android.");
  }
  async switchCamera(): Promise<boolean> {
    throw new Error("Tính năng gọi chỉ khả dụng trên ứng dụng ChatPHT dành cho iOS và Android.");
  }
  getRoom() {
    return undefined;
  }
  isConnected() {
    return false;
  }
  getNetworkStats() {
    return { pingMs: null, connectionQuality: "unknown" as const };
  }
  async adaptVideoForNetwork(_stats: ReturnType<LiveKitCall["getNetworkStats"]>) {
    return "sd" as const;
  }
  async disconnect() {}
}
