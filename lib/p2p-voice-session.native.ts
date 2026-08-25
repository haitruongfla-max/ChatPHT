import { mediaDevices, type MediaStream } from "react-native-webrtc";

import { resetAndroidCallSpeakerRoute, setAndroidCallSpeakerRoute } from "@/lib/android-audio-route";

/**
 * Owns exactly one microphone-only capture for one P2P voice session.
 * Camera and MediaProjection are deliberately absent from this module.
 */
export class P2pVoiceSession {
  private stream: MediaStream | null = null;
  private startPromise: Promise<MediaStream> | null = null;
  private stopped = false;

  async start() {
    if (this.stream) return this.stream;
    if (this.startPromise) return this.startPromise;

    this.stopped = false;
    const starting = this.captureMicrophone();
    this.startPromise = starting;
    try {
      return await starting;
    } finally {
      if (this.startPromise === starting) this.startPromise = null;
    }
  }

  private async captureMicrophone() {
    const stream = await mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        googEchoCancellation: true,
        googNoiseSuppression: true,
        googAutoGainControl: true,
        channelCount: 1,
      } as unknown as boolean,
      video: false,
    });

    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("VOICE_SESSION_STOPPED");
    }

    this.stream = stream;
    // Audio route is best-effort and must never delay creation of the peer/offer.
    void setAndroidCallSpeakerRoute(false).catch(() => undefined);
    return stream;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = enabled; });
  }

  async setSpeakerEnabled(enabled: boolean) {
    await setAndroidCallSpeakerRoute(enabled);
  }

  async stop(options: { preserveAudioRoute?: boolean } = {}) {
    this.stopped = true;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (!options.preserveAudioRoute) await resetAndroidCallSpeakerRoute();
  }
}
