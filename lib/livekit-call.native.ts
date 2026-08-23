import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";
import { ConnectionQuality, LocalVideoTrack, Room, Track } from "livekit-client";
import { PermissionsAndroid, Platform } from "react-native";

import { ensureLiveKitGlobals } from "@/lib/livekit-bootstrap";

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

type SwitchableMediaStreamTrack = {
  _switchCamera?: () => void | Promise<void>;
};

export class LiveKitCall {
  private room = new Room({ adaptiveStream: true, dynacast: true });
  private isFrontCamera = true;
  private videoQuality: VideoQualityMode = "hd";

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
      resolution: this.videoQuality === "hd" ? { width: 1280, height: 720 } : { width: 640, height: 360 },
    } : undefined);
    if (enabled && !this.room.localParticipant.getTrackPublication(Track.Source.Camera)?.track) {
      throw new Error("Không tạo được track camera. Hãy kiểm tra quyền camera của ChatPHT trong Cài đặt Android.");
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
    const track = this.room.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    await track.restartTrack({
      facingMode: this.isFrontCamera ? "user" : "environment",
      resolution: mode === "hd" ? { width: 1280, height: 720 } : { width: 640, height: 360 },
    });
  }

  getRoom() {
    return this.room;
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
    this.videoQuality = "hd";
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
