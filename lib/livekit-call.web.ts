export type LiveKitSession = {
  serverUrl: string;
  token: string;
};

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
  async setSpeakerEnabled(_enabled: boolean) {}
  async switchCamera(): Promise<boolean> {
    throw new Error("Tính năng gọi chỉ khả dụng trên ứng dụng ChatPHT dành cho iOS và Android.");
  }
  getRoom() {
    return undefined;
  }
  async disconnect() {}
}
