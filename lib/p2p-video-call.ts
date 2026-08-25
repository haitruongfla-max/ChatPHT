import { mediaDevices, type MediaStream, type MediaStreamTrack } from "react-native-webrtc";

import { resetAndroidCallSpeakerRoute, setAndroidCallSpeakerRoute } from "@/lib/android-audio-route";

/** Owns microphone-and-camera capture for a video call. It never starts MediaProjection. */
export class P2pVideoCall {
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
      video: { facingMode: "user", frameRate: 30, width: 1280, height: 720 },
    });
    // Video/micro phải có thể tạo peer ngay cả khi một ROM không phản hồi bridge đổi loa.
    void setAndroidCallSpeakerRoute(true).catch(() => undefined);
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

  async setCameraEnabled(enabled: boolean) {
    this.stream?.getVideoTracks().forEach((track) => { track.enabled = enabled; });
  }

  async switchCamera() {
    const track = this.stream?.getVideoTracks()[0] as (MediaStreamTrack & { _switchCamera?: () => void }) | undefined;
    if (!track?._switchCamera) throw new Error("Camera trước/sau không khả dụng.");
    track._switchCamera();
  }

  async setQuality(quality: "sd" | "hd") {
    const track = this.stream?.getVideoTracks()[0];
    if (!track) return;
    await track.applyConstraints(
      quality === "hd"
        ? { width: 1280, height: 720, frameRate: 30 }
        : { width: 640, height: 360, frameRate: 20 },
    );
  }

  async stop(options: { preserveAudioRoute?: boolean } = {}) {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (!options.preserveAudioRoute) await resetAndroidCallSpeakerRoute();
  }
}
