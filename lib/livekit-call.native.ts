import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";
import { LocalVideoTrack, Room, Track } from "livekit-client";
import { Platform } from "react-native";

import { ensureLiveKitGlobals } from "@/lib/livekit-bootstrap";

ensureLiveKitGlobals();

export type LiveKitSession = {
  serverUrl: string;
  token: string;
};

type SwitchableMediaStreamTrack = {
  _switchCamera?: () => void | Promise<void>;
};

export class LiveKitCall {
  private room = new Room({ adaptiveStream: true, dynacast: true });
  private isFrontCamera = true;

  async connect(session: LiveKitSession, kind: "audio" | "video") {
    ensureLiveKitGlobals();
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: ["speaker", "bluetooth", "headset", "earpiece"],
        audioTypeOptions: { ...AndroidAudioTypePresets.communication, forceHandleAudioRouting: true },
      },
      ios: { defaultOutput: "speaker" },
    });
    await AudioSession.setDefaultRemoteAudioTrackVolume(1);
    await AudioSession.startAudioSession();
    try {
      await this.room.connect(session.serverUrl, session.token);
      await this.room.localParticipant.setMicrophoneEnabled(true, {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true,
      });
      if (kind === "video") {
        await this.room.localParticipant.setCameraEnabled(true, {
          facingMode: this.isFrontCamera ? "user" : "environment",
        });
      }
      await this.setSpeakerEnabled(true);
    } catch (error) {
      this.room.disconnect();
      await AudioSession.stopAudioSession().catch(() => undefined);
      throw error;
    }
  }

  async setMicrophoneEnabled(enabled: boolean) {
    await this.room.localParticipant.setMicrophoneEnabled(enabled, enabled ? {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    } : undefined);
  }

  async setCameraEnabled(enabled: boolean) {
    await this.room.localParticipant.setCameraEnabled(enabled, enabled ? {
      facingMode: this.isFrontCamera ? "user" : "environment",
    } : undefined);
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

  getRoom() {
    return this.room;
  }

  async disconnect() {
    this.room.disconnect();
    this.isFrontCamera = true;
    await AudioSession.stopAudioSession();
  }
}
