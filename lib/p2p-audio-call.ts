import { mediaDevices, type MediaStream } from "react-native-webrtc";

import { resetAndroidCallSpeakerRoute, setAndroidCallSpeakerRoute } from "@/lib/android-audio-route";

/** Owns microphone-only capture for a voice call. It never opens a camera or MediaProjection. */
export class P2pAudioCall {
  private stream: MediaStream | null = null;

  async start() {
    await this.stop({ preserveAudioRoute: true });
    this.stream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        googEchoCancellation: true,
        googNoiseSuppression: true,
        googAutoGainControl: true,
      } as unknown as boolean,
      video: false,
    });
    // Điều hướng loa là tiện ích hậu khởi tạo; không cho bridge Android chặn offer P2P.
    void setAndroidCallSpeakerRoute(false).catch(() => undefined);
    return this.stream;
  }

  getStream() {
    return this.stream;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }

  async setSpeakerEnabled(enabled: boolean) {
    await setAndroidCallSpeakerRoute(enabled);
  }

  async stop(options: { preserveAudioRoute?: boolean } = {}) {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (!options.preserveAudioRoute) await resetAndroidCallSpeakerRoute();
  }
}
