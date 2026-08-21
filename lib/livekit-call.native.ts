import { AudioSession } from "@livekit/react-native";
import { LocalVideoTrack, Room, Track } from "livekit-client";
import { Platform } from "react-native";

import { ensureLiveKitGlobals } from "@/lib/livekit-bootstrap";

ensureLiveKitGlobals();

export type LiveKitSession = {
  serverUrl: string;
  token: string;
};

export class LiveKitCall {
  private room = new Room({ adaptiveStream: true, dynacast: true });
  private isFrontCamera = true;

  async connect(session: LiveKitSession, kind: "audio" | "video") {
    ensureLiveKitGlobals();
    await AudioSession.startAudioSession();
    await this.room.connect(session.serverUrl, session.token);
    await this.room.localParticipant.setMicrophoneEnabled(true);
    if (kind === "video") await this.room.localParticipant.setCameraEnabled(true);
  }

  async setMicrophoneEnabled(enabled: boolean) {
    await this.room.localParticipant.setMicrophoneEnabled(enabled);
  }

  async setCameraEnabled(enabled: boolean) {
    await this.room.localParticipant.setCameraEnabled(enabled);
  }

  async switchCamera() {
    const track = this.room.localParticipant.getTrackPublication(Track.Source.Camera)?.track;
    if (!(track instanceof LocalVideoTrack)) {
      throw new Error("Camera chưa sẵn sàng để chuyển đổi.");
    }
    const nextIsFrontCamera = !this.isFrontCamera;
    await track.restartTrack({ facingMode: nextIsFrontCamera ? "user" : "environment" });
    this.isFrontCamera = nextIsFrontCamera;
    return this.isFrontCamera;
  }

  async setSpeakerEnabled(enabled: boolean) {
    if (Platform.OS === "ios") {
      await AudioSession.selectAudioOutput(enabled ? "force_speaker" : "default");
      return;
    }
    const outputs = await AudioSession.getAudioOutputs();
    const selected = enabled ? "speaker" : "earpiece";
    if (outputs.includes(selected)) await AudioSession.selectAudioOutput(selected);
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
