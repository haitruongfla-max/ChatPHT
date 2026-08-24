import { AndroidAudioTypePresets, AudioSession } from "@livekit/react-native";
import { ConnectionState, Room, Track } from "livekit-client";
import { PermissionsAndroid, Platform } from "react-native";

import { ensureLiveKitGlobals } from "@/lib/livekit-bootstrap";
import { shouldRetryScreenSharePublication } from "@/lib/livekit-screen-share-policy";
import type { LiveKitSession } from "@/lib/livekit-call";

ensureLiveKitGlobals();

/** A standalone room: no call camera is created and screen capture is the host's only video source. */
export class ScreenShareSession {
  private room = new Room({ adaptiveStream: true, dynacast: true });

  async connect(session: LiveKitSession) {
    ensureLiveKitGlobals();
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: ["speaker", "bluetooth", "headset", "earpiece"],
        audioTypeOptions: { ...AndroidAudioTypePresets.communication, forceHandleAudioRouting: true },
      },
      ios: { defaultOutput: "speaker" },
    });
    await AudioSession.startAudioSession();
    try {
      await this.room.connect(session.serverUrl, session.token);
      await this.setSpeakerEnabled(true);
    } catch (error) {
      this.room.disconnect();
      await AudioSession.stopAudioSession().catch(() => undefined);
      throw error;
    }
  }

  getRoom() {
    return this.room;
  }

  isConnected() {
    return this.room.state === ConnectionState.Connected;
  }

  async setMicrophoneEnabled(enabled: boolean) {
    if (enabled) await this.requestMicrophonePermission();
    await this.room.localParticipant.setMicrophoneEnabled(enabled, enabled ? {
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
    } : undefined);
    if (enabled && !this.room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track) {
      throw new Error("Không tạo được track micro. Hãy kiểm tra quyền micro của ChatPHT.");
    }
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

  async startScreenShare() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.publishScreenShareOnce();
        return;
      } catch (error) {
        await this.room.localParticipant.setScreenShareEnabled(false).catch(() => undefined);
        if (!shouldRetryScreenSharePublication(error, attempt)) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 700));
      }
    }
  }

  async stopScreenShare() {
    await this.room.localParticipant.setScreenShareEnabled(false);
  }

  async disconnect() {
    this.room.disconnect();
    await AudioSession.stopAudioSession().catch(() => undefined);
  }

  private async publishScreenShareOnce() {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const publication = this.room.localParticipant.setScreenShareEnabled(true);
      await Promise.race([
        publication,
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Android không phản hồi việc phát màn hình. Hãy thử lại sau khi cho phép ghi màn hình.")), 15_000);
        }),
      ]);
      if (!this.room.localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track) {
        throw new Error("Không thể bắt đầu chia sẻ màn hình. Hãy cho phép hộp thoại ghi màn hình của Android rồi thử lại.");
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  private async requestMicrophonePermission() {
    if (Platform.OS !== "android") return;
    const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new Error("ChatPHT cần quyền micro khi bạn muốn hỏi trong phiên trình chiếu.");
    }
  }
}
