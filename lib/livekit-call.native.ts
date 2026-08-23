import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";
import { ConnectionQuality, ConnectionState, LocalVideoTrack, Room, Track } from "livekit-client";
import { PermissionsAndroid, Platform } from "react-native";

import { ensureLiveKitGlobals } from "@/lib/livekit-bootstrap";
import { shouldRetryScreenSharePublication } from "@/lib/livekit-screen-share-policy";

ensureLiveKitGlobals();

export type LiveKitSession = {
  serverUrl: string;
  token: string;
};

export type LiveKitNetworkStats = {
  pingMs: number | null;
  connectionQuality: ConnectionQuality;
};

export type VideoQualityMode = "sd" | "hd";
type AppliedVideoQuality = VideoQualityMode | "low";

type SwitchableMediaStreamTrack = {
  _switchCamera?: () => void | Promise<void>;
};

export class LiveKitCall {
  private room = new Room({ adaptiveStream: true, dynacast: true });
  private isFrontCamera = true;
  private videoQuality: VideoQualityMode = "sd";
  private appliedVideoQuality: AppliedVideoQuality = "sd";

  async connect(session: LiveKitSession, kind: "audio" | "video") {
    ensureLiveKitGlobals();
    await this.requestMediaPermissions(kind);
    const useSpeakerByDefault = kind === "video";
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: useSpeakerByDefault
          ? ["speaker", "bluetooth", "headset", "earpiece"]
          : ["bluetooth", "headset", "earpiece", "speaker"],
        audioTypeOptions: { ...AndroidAudioTypePresets.communication, forceHandleAudioRouting: true },
      },
      ios: { defaultOutput: useSpeakerByDefault ? "speaker" : "earpiece" },
    });
    await AudioSession.setDefaultRemoteAudioTrackVolume(1);
    await AudioSession.startAudioSession();
    try {
      await this.room.connect(session.serverUrl, session.token);
      await this.setMicrophoneEnabled(true);
      if (kind === "video") await this.setCameraEnabled(true);
      await this.setSpeakerEnabled(useSpeakerByDefault);
    } catch (error) {
      this.room.disconnect();
      await AudioSession.stopAudioSession().catch(() => undefined);
      throw error;
    }
  }

  async setMicrophoneEnabled(enabled: boolean) {
    if (enabled) await this.requestMediaPermissions("audio");
    await this.room.localParticipant.setMicrophoneEnabled(enabled, enabled ? {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    } : undefined);
    if (enabled && !this.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track) {
      throw new Error("Không tạo được track micro. Hãy kiểm tra quyền micro của ChatPHT trong Cài đặt Android.");
    }
  }

  async setCameraEnabled(enabled: boolean) {
    if (enabled) await this.requestMediaPermissions("video");
    await this.room.localParticipant.setCameraEnabled(enabled, enabled ? {
      facingMode: this.isFrontCamera ? "user" : "environment",
      resolution: this.getResolution(this.appliedVideoQuality),
    } : undefined);
    if (enabled && !this.room.localParticipant.getTrackPublication(Track.Source.Camera)?.track) {
      throw new Error("Không tạo được track camera. Hãy kiểm tra quyền camera của ChatPHT trong Cài đặt Android.");
    }
  }

  async setScreenShareEnabled(enabled: boolean) {
    if (!enabled) {
      await this.room.localParticipant.setScreenShareEnabled(false);
      return;
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.publishScreenShareOnce();
        return;
      } catch (error) {
        // MediaProjection can be denied or rejected by OEM policy. Unpublish any partial track
        // before reporting the error so the room, microphone and camera remain connected.
        await this.room.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
        if (!shouldRetryScreenSharePublication(error, attempt)) throw error;
        // Give the SDK a short moment to complete the unpublish before re-requesting its publication acknowledgement.
        await new Promise<void>((resolve) => setTimeout(resolve, 700));
      }
    }
  }

  private async publishScreenShareOnce() {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const publication = this.room.localParticipant.setScreenShareEnabled(true);
      await Promise.race([
        publication,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Android không phản hồi việc phát track màn hình. Hãy thử lại sau khi cho phép ghi màn hình.")), 15_000);
        }),
      ]);
      if (!this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track) {
        throw new Error("Không thể bắt đầu chia sẻ màn hình. Hãy cho phép Android ghi lại màn hình rồi thử lại.");
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  async switchCamera() {
    const nextIsFrontCamera = !this.isFrontCamera;
    const track = this.room.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    const nativeTrack = track?.mediaStreamTrack as SwitchableMediaStreamTrack | undefined;
    if (nativeTrack && typeof nativeTrack._switchCamera === "function") {
      await nativeTrack._switchCamera();
    } else if (track && typeof track.restartTrack === "function") {
      await track.restartTrack({ facingMode: nextIsFrontCamera ? "user" : "environment" });
    } else {
      // A few Android camera implementations only switch reliably when their local track is recreated.
      await this.room.localParticipant.setCameraEnabled(false);
      this.isFrontCamera = nextIsFrontCamera;
      await this.setCameraEnabled(true);
      return this.isFrontCamera;
    }
    this.isFrontCamera = nextIsFrontCamera;
    return this.isFrontCamera;
  }

  async setSpeakerEnabled(enabled: boolean) {
    if (Platform.OS === "ios") {
      await AudioSession.selectAudioOutput(enabled ? "force_speaker" : "default");
      return;
    }
    const outputs = await AudioSession.getAudioOutputs();
    const preferred = enabled ? "speaker" : "earpiece";
    const selected = outputs.includes(preferred) ? preferred : outputs.includes("speaker") ? "speaker" : outputs[0];
    if (selected) await AudioSession.selectAudioOutput(selected);
  }

  async setVideoQuality(mode: VideoQualityMode) {
    this.videoQuality = mode;
    this.appliedVideoQuality = mode;
    await this.restartCameraWithQuality(mode);
  }

  /** Keeps voice intact; only video is reduced while the LiveKit SFU reports a weak path. */
  async adaptVideoForNetwork(stats: LiveKitNetworkStats) {
    const shouldUseLow = stats.pingMs !== null && stats.pingMs >= 250;
    const target: AppliedVideoQuality = shouldUseLow ? "low" : this.videoQuality;
    if (target === this.appliedVideoQuality) return target;
    this.appliedVideoQuality = target;
    await this.restartCameraWithQuality(target);
    return target;
  }

  private async restartCameraWithQuality(mode: AppliedVideoQuality) {
    const track = this.room.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    await track.restartTrack({
      facingMode: this.isFrontCamera ? "user" : "environment",
      resolution: this.getResolution(mode),
    });
  }

  private getResolution(mode: AppliedVideoQuality) {
    if (mode === "hd") return { width: 1280, height: 720 };
    if (mode === "low") return { width: 640, height: 360 };
    return { width: 854, height: 480 };
  }

  getRoom() {
    return this.room;
  }

  isConnected() {
    return this.room.state === ConnectionState.Connected;
  }

  getNetworkStats(): LiveKitNetworkStats {
    const engine = this.room.engine as unknown as { client?: { rtt?: number } } | null | undefined;
    const rtt = engine?.client?.rtt;
    return {
      pingMs: typeof rtt === "number" && Number.isFinite(rtt) && rtt >= 0 ? Math.round(rtt) : null,
      connectionQuality: this.room.localParticipant.connectionQuality,
    };
  }

  async disconnect() {
    this.room.disconnect();
    this.isFrontCamera = true;
    this.videoQuality = "sd";
    this.appliedVideoQuality = "sd";
    await AudioSession.stopAudioSession();
  }

  private async requestMediaPermissions(kind: "audio" | "video") {
    if (Platform.OS !== "android") return;
    const requested = [PermissionsAndroid.PERMISSIONS.RECORD_AUDIO];
    if (kind === "video") requested.push(PermissionsAndroid.PERMISSIONS.CAMERA);
    const results = await PermissionsAndroid.requestMultiple(requested);
    const denied = requested.filter((permission) => results[permission] !== PermissionsAndroid.RESULTS.GRANTED);
    if (denied.length > 0) {
      const names = denied.map((permission) => permission === PermissionsAndroid.PERMISSIONS.CAMERA ? "camera" : "micro").join(" và ");
      throw new Error(`ChatPHT cần quyền ${names} để thực hiện cuộc gọi.`);
    }
  }
}
