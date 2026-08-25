import { mediaDevices, MediaStream, type MediaStream as MediaStreamType } from "react-native-webrtc";

import { setAndroidCallSpeakerRoute } from "@/lib/android-audio-route";
import { P2pScreenShare } from "./p2p-screen-share";

/**
 * A standalone screen-sharing P2P session. Only the caller captures display
 * media. Both participants have a microphone track; only the screen caller may
 * opt into a separate camera track. It never imports or switches to call mode.
 */
export class P2pScreenCall {
  private readonly screenShare = new P2pScreenShare();
  private displayStream: MediaStreamType | null = null;
  private microphoneStream: MediaStreamType | null = null;
  private cameraStream: MediaStreamType | null = null;
  private stream: MediaStreamType | null = null;
  private isCaller = false;

  async start({ isCaller }: { isCaller: boolean }) {
    await this.stop();
    this.isCaller = isCaller;
    this.displayStream = isCaller ? await this.screenShare.start() : null;
    this.microphoneStream = await mediaDevices.getUserMedia({
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
    this.stream = new MediaStream();
    this.displayStream?.getTracks().forEach((track) => this.stream?.addTrack(track));
    this.microphoneStream.getTracks().forEach((track) => this.stream?.addTrack(track));
    await setAndroidCallSpeakerRoute(true);
    return this.stream;
  }

  getStream() {
    return this.stream;
  }

  /** Separate stream identities let the receiver render display and camera independently. */
  getPublishStreams() {
    return [this.displayStream, this.microphoneStream, this.cameraStream].filter((stream): stream is MediaStreamType => Boolean(stream));
  }

  getCameraStream() {
    return this.cameraStream;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.microphoneStream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }

  async setSpeakerEnabled(enabled: boolean) {
    await setAndroidCallSpeakerRoute(enabled);
  }

  async setCameraEnabled(enabled: boolean) {
    if (!this.isCaller) throw new Error("Chỉ người đang chia sẻ màn hình mới có thể bật camera phụ.");
    if (this.cameraStream) {
      this.cameraStream.getVideoTracks().forEach((track) => { track.enabled = enabled; });
      return { added: false, stream: this.cameraStream };
    }
    if (!enabled) return { added: false, stream: null };
    this.cameraStream = await mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", frameRate: 24, width: 640, height: 360 },
    });
    this.cameraStream.getVideoTracks().forEach((track) => { track.enabled = true; });
    return { added: true, stream: this.cameraStream };
  }

  async stop() {
    await this.screenShare.stop();
    this.microphoneStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.displayStream = null;
    this.microphoneStream = null;
    this.cameraStream = null;
    this.stream = null;
    this.isCaller = false;
  }
}
